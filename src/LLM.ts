import { ChatCompletionChunk } from './ChatCompletionChunk';
import type { ChatCompletionOptions } from './ChatCompletionOptions';
import { ChatCompletionResponse } from './ChatCompletionResponse';
import { Choice } from './Choice';
import type { Conversation } from './Conversation';
import { Embedding } from './Embedding';
import { EmbeddingOptions } from './EmbeddingOptions';
import { EmbeddingResponse } from './EmbeddingResponse';
import * as HarmonyContent from './HarmonyContent';
import type { LLMClient } from './LLMClient';
import { Message } from './Message';
import { RerankOptions } from './RerankOptions';
import { RerankResponse } from './RerankResponse';
import { RerankResult } from './RerankResult';
import { Role } from './Role';
import { ToolCall } from './ToolCall';
import { ToolCallDelta } from './ToolCallDelta';
import { Usage } from './Usage';

/** Per-choice state accumulated while consuming a streamed chat completion. */
interface StreamChoiceAccumulator {
  role: string;
  content: string;
  reasoning: string;
  toolCalls: Map<number, { id: string; name: string; argumentsJson: string }>;
  finishReason: string | null;
}

const ROLE_VALUES: readonly string[] = Object.values(Role);

/** HTTP client for OpenAI-compatible LLM endpoints (chat, embeddings, rerank, tokenize). */
export class LLM implements LLMClient {
  constructor(
    public endpoint: string,
    public apiKey?: string,
    public defaultModel?: string,
    public timeoutSeconds: number = 120,
  ) {}

  async tokenize(text: string): Promise<number[]> {
    const data = await this.request('POST', '/tokenize', JSON.stringify({ content: text }));

    if (!Array.isArray(data.tokens)) {
      throw new Error('LLM tokenize response missing tokens');
    }

    return data.tokens.map((token: unknown) =>
      typeof token === 'object' && token !== null
        ? Number((token as Record<string, unknown>).id ?? 0)
        : Number(token),
    );
  }

  /**
   * Returns the usable context size (in tokens) the server is currently configured with,
   * via llama.cpp's `GET /props` (`default_generation_settings.n_ctx`).
   */
  async contextSize(): Promise<number> {
    const data = await this.request('GET', '/props');
    const nCtx = data.default_generation_settings?.n_ctx;

    if (typeof nCtx !== 'number') {
      throw new Error('LLM props response missing default_generation_settings.n_ctx');
    }

    return nCtx;
  }

  async chatCompletion(conversation: Conversation, options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    const start = performance.now();
    const body = JSON.stringify({
      messages: conversation.toChatCompletionPayload(),
      ...options.toRequestPayload(this.defaultModel),
    });

    let data: Record<string, any>;
    try {
      data = await this.request('POST', '/v1/chat/completions', body);
    } catch (e) {
      const recovered = this.tryRecoverHarmonyParseError(e);
      if (!recovered) {
        throw e;
      }
      data = recovered;
    }

    if (!Array.isArray(data.choices)) {
      throw new Error('LLM response missing choices');
    }

    const usage = new Usage(
      data.usage?.prompt_tokens ?? 0,
      data.usage?.completion_tokens ?? 0,
      data.usage?.total_tokens ?? 0,
    );

    const choices = data.choices.map((choice: any) => {
      const toolCalls = choice.message?.tool_calls
        ? choice.message.tool_calls.map((call: any) => ToolCall.fromApiShape(call))
        : null;
      const [content, reasoningContent] = LLM.normalizeAssistantContent(
        choice.message?.content ?? '',
        choice.message?.reasoning_content ?? null,
      );

      return new Choice(
        choice.index,
        new Message(
          ROLE_VALUES.includes(choice.message?.role) ? (choice.message.role as Role) : Role.Unknown,
          content,
          reasoningContent,
          {},
          toolCalls,
          choice.message?.tool_call_id ?? null,
        ),
        choice.finish_reason,
      );
    });

    const elapsedMs = performance.now() - start;

    return new ChatCompletionResponse(data.model, usage, choices, data, elapsedMs);
  }

  /**
   * Streams a chat completion, invoking `onChunk` for each incremental delta as it arrives,
   * and resolves with the same accumulated `ChatCompletionResponse` shape as `chatCompletion`.
   */
  async chatCompletionStream(
    conversation: Conversation,
    options: ChatCompletionOptions,
    onChunk: (chunk: ChatCompletionChunk) => void,
  ): Promise<ChatCompletionResponse> {
    const start = performance.now();
    const body = JSON.stringify({
      messages: conversation.toChatCompletionPayload(),
      ...options.toRequestPayload(this.defaultModel),
      stream: true,
      stream_options: { include_usage: true },
    });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey !== undefined) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const timeoutSignal = AbortSignal.timeout(this.timeoutSeconds * 1000);
    const signal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;

    const accumulators = new Map<number, StreamChoiceAccumulator>();
    let usage = new Usage(0, 0, 0);
    let model = this.defaultModel ?? 'unknown';

    try {
      let response: Response;
      try {
        response = await fetch(this.endpoint + '/v1/chat/completions', { method: 'POST', headers, body, signal });
      } catch (e) {
        throw new Error(e instanceof Error ? e.message : String(e));
      }

      if (response.status >= 400) {
        const text = await response.text();
        throw new Error(`LLM request failed: ${LLM.extractErrorMessage(text, response.status)}`);
      }
      if (!response.body) {
        throw new Error('LLM streaming response has no body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });

          let separatorIndex: number;
          while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + 2);

            const event = LLM.parseSseEvent(rawEvent);
            if (!event) {
              continue;
            }
            if (typeof event.model === 'string') {
              model = event.model;
            }
            if (event.usage) {
              usage = new Usage(
                event.usage.prompt_tokens ?? 0,
                event.usage.completion_tokens ?? 0,
                event.usage.total_tokens ?? 0,
              );
            }
            LLM.applyStreamEvent(event, accumulators, onChunk);
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (e) {
      // Only a caller-initiated abort (options.signal) degrades gracefully into a partial
      // response; a fetch timeout or genuine network error still propagates as before.
      if (!options.signal?.aborted) {
        throw e;
      }
    }

    const aborted = options.signal?.aborted ?? false;

    const choices = Array.from(accumulators.entries())
      .sort(([a], [b]) => a - b)
      .map(([index, acc]) => {
        // Drop any in-flight tool call: its arguments JSON may be truncated mid-abort and unsafe to execute.
        const toolCalls =
          !aborted && acc.toolCalls.size > 0
            ? Array.from(acc.toolCalls.values()).map((call) => new ToolCall(call.id, call.name, call.argumentsJson))
            : null;
        const [content, reasoningContent] = LLM.normalizeAssistantContent(acc.content, acc.reasoning || null);

        return new Choice(
          index,
          new Message(
            ROLE_VALUES.includes(acc.role) ? (acc.role as Role) : Role.Assistant,
            content,
            reasoningContent,
            {},
            toolCalls,
          ),
          aborted ? 'aborted' : (acc.finishReason ?? 'stop'),
        );
      });

    const elapsedMs = performance.now() - start;

    return new ChatCompletionResponse(model, usage, choices, null, elapsedMs);
  }

  async embeddings(
    input: string | string[],
    options: EmbeddingOptions = new EmbeddingOptions(),
  ): Promise<EmbeddingResponse> {
    const start = performance.now();
    const body = JSON.stringify({ input, ...options.toRequestPayload(this.defaultModel) });

    const data = await this.request('POST', '/v1/embeddings', body);

    if (!Array.isArray(data.data)) {
      throw new Error('LLM embeddings response missing data');
    }

    const usage = new Usage(data.usage?.prompt_tokens ?? 0, 0, data.usage?.total_tokens ?? 0);

    const embeddings = data.data.map((item: unknown, index: number) => {
      if (typeof item !== 'object' || item === null) {
        throw new Error('LLM embeddings response item is not an object');
      }
      const record = item as Record<string, unknown>;
      const vector = LLM.parseEmbeddingVector(record.embedding);

      return new Embedding(Number(record.index ?? index), vector);
    });

    const elapsedMs = performance.now() - start;

    return new EmbeddingResponse(
      typeof data.model === 'string' ? data.model : (options.model ?? this.defaultModel ?? 'unknown'),
      usage,
      embeddings,
      data,
      elapsedMs,
    );
  }

  async rerank(
    query: string,
    documents: string[],
    options: RerankOptions = new RerankOptions(),
  ): Promise<RerankResponse> {
    const start = performance.now();
    const body = JSON.stringify({
      query,
      documents,
      ...options.toRequestPayload(this.defaultModel),
    });

    const data = await this.request('POST', '/v1/rerank', body);

    if (!Array.isArray(data.results)) {
      throw new Error('LLM rerank response missing results');
    }

    const usage = new Usage(data.usage?.prompt_tokens ?? 0, 0, data.usage?.total_tokens ?? 0);

    const results = data.results.map((item: unknown) => {
      if (typeof item !== 'object' || item === null) {
        throw new Error('LLM rerank response item is not an object');
      }
      const record = item as Record<string, unknown>;
      if (record.index === undefined || record.relevance_score === undefined) {
        throw new Error('LLM rerank response item missing index or relevance_score');
      }

      return new RerankResult(Number(record.index), Number(record.relevance_score));
    });

    const elapsedMs = performance.now() - start;

    return new RerankResponse(
      typeof data.model === 'string' ? data.model : (options.model ?? this.defaultModel ?? 'unknown'),
      usage,
      results,
      data,
      elapsedMs,
    );
  }

  private async request(method: 'GET' | 'POST', path: string, body?: string): Promise<Record<string, any>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey !== undefined) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    let response: Response;
    try {
      response = await fetch(this.endpoint + path, {
        method,
        headers,
        body: method === 'POST' ? body : undefined,
        signal: AbortSignal.timeout(this.timeoutSeconds * 1000),
      });
    } catch (e) {
      throw new Error(e instanceof Error ? e.message : String(e));
    }

    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON response from LLM: ${text.slice(0, 500)}`);
    }

    if (typeof data !== 'object' || data === null) {
      throw new Error(`Invalid JSON response from LLM: ${text.slice(0, 500)}`);
    }

    const parsed = data as Record<string, any>;
    if (response.status >= 400 || parsed.error !== undefined) {
      throw new Error(`LLM request failed: ${LLM.extractErrorMessage(text, response.status)}`);
    }

    return parsed;
  }

  private static extractErrorMessage(text: string, status: number): string {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return `HTTP ${status}`;
    }
    if (typeof data !== 'object' || data === null) {
      return `HTTP ${status}`;
    }

    const parsed = data as Record<string, any>;
    let message = parsed.error?.message ?? parsed.error ?? `HTTP ${status}`;
    if (typeof message === 'object') {
      message = JSON.stringify(message);
    }

    return message;
  }

  /** Parses one `data: {...}` SSE event block. Returns null for keep-alives and `[DONE]`. */
  private static parseSseEvent(rawEvent: string): Record<string, any> | null {
    const dataLines = rawEvent
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim());

    if (dataLines.length === 0) {
      return null;
    }

    const payload = dataLines.join('');
    if (payload === '[DONE]') {
      return null;
    }

    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }

  private static applyStreamEvent(
    event: Record<string, any>,
    accumulators: Map<number, StreamChoiceAccumulator>,
    onChunk: (chunk: ChatCompletionChunk) => void,
  ): void {
    const choices = Array.isArray(event.choices) ? event.choices : [];

    for (const choice of choices) {
      const index = Number(choice.index ?? 0);
      let acc = accumulators.get(index);
      if (!acc) {
        acc = { role: 'assistant', content: '', reasoning: '', toolCalls: new Map(), finishReason: null };
        accumulators.set(index, acc);
      }

      const delta = choice.delta ?? {};
      if (typeof delta.role === 'string') {
        acc.role = delta.role;
      }

      const contentDelta: string = typeof delta.content === 'string' ? delta.content : '';
      const reasoningDelta: string | null = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : null;
      acc.content += contentDelta;
      if (reasoningDelta) {
        acc.reasoning += reasoningDelta;
      }

      let toolCallDeltas: ToolCallDelta[] | null = null;
      if (Array.isArray(delta.tool_calls)) {
        const parsedToolCallDeltas: ToolCallDelta[] = delta.tool_calls.map((raw: any) => ToolCallDelta.fromApiShape(raw));
        toolCallDeltas = parsedToolCallDeltas;
        for (const toolCallDelta of parsedToolCallDeltas) {
          let call = acc.toolCalls.get(toolCallDelta.index);
          if (!call) {
            call = { id: '', name: '', argumentsJson: '' };
            acc.toolCalls.set(toolCallDelta.index, call);
          }
          if (toolCallDelta.id) {
            call.id = toolCallDelta.id;
          }
          if (toolCallDelta.name) {
            call.name = toolCallDelta.name;
          }
          if (toolCallDelta.argumentsJson) {
            call.argumentsJson += toolCallDelta.argumentsJson;
          }
        }
      }

      const finishReason: string | null = typeof choice.finish_reason === 'string' ? choice.finish_reason : null;
      if (finishReason) {
        acc.finishReason = finishReason;
      }

      if (contentDelta || reasoningDelta || toolCallDeltas || finishReason) {
        onChunk(new ChatCompletionChunk(index, contentDelta, reasoningDelta, toolCallDeltas, finishReason));
      }
    }
  }

  private static parseEmbeddingVector(value: unknown): number[] {
    if (Array.isArray(value)) {
      return value.map((component) => Number(component));
    }
    if (typeof value === 'string') {
      return LLM.decodeBase64Embedding(value);
    }
    throw new Error('LLM embeddings response missing embedding vector');
  }

  /** OpenAI returns base64-encoded little-endian float32 vectors when encoding_format is base64. */
  private static decodeBase64Embedding(encoded: string): number[] {
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length % 4 !== 0) {
      throw new Error('LLM embeddings response has malformed base64 embedding');
    }

    const vector: number[] = [];
    for (let offset = 0; offset < bytes.length; offset += 4) {
      vector.push(bytes.readFloatLE(offset));
    }

    return vector;
  }

  private static normalizeAssistantContent(
    content: string,
    reasoningContent: string | null,
  ): [string, string | null] {
    if (!HarmonyContent.containsChannelMarkers(content)) {
      return [content, reasoningContent];
    }

    const parsed = HarmonyContent.parse(content);
    let reasoning = parsed.reasoning;
    if (reasoningContent) {
      reasoning = reasoning ? `${reasoningContent}\n${reasoning}` : reasoningContent;
    }

    return [parsed.content, reasoning];
  }

  /**
   * llama.cpp may return HTTP 500 after a successful generation when its Harmony
   * autoparser fails on the raw output. Recover when the error embeds parseable text.
   */
  private tryRecoverHarmonyParseError(e: unknown): Record<string, unknown> | null {
    const prefix = 'LLM request failed: ';
    const message = e instanceof Error ? e.message : String(e);
    if (!message.startsWith(prefix)) {
      return null;
    }

    const parsed = HarmonyContent.tryParseServerError(message.slice(prefix.length));
    if (!parsed || parsed.content === '') {
      return null;
    }

    return {
      model: this.defaultModel ?? 'unknown',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: parsed.content, reasoning_content: parsed.reasoning },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }
}

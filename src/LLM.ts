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
import { Usage } from './Usage';

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
      let message = parsed.error?.message ?? parsed.error ?? `HTTP ${response.status}`;
      if (typeof message === 'object') {
        message = JSON.stringify(message);
      }
      throw new Error(`LLM request failed: ${message}`);
    }

    return parsed;
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

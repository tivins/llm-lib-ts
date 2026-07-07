import { afterEach, describe, expect, test } from 'bun:test';
import { ChatCompletionOptions } from '../src/ChatCompletionOptions';
import { Conversation } from '../src/Conversation';
import { EmbeddingOptions } from '../src/EmbeddingOptions';
import { LLM } from '../src/LLM';
import { Message } from '../src/Message';
import { RerankOptions } from '../src/RerankOptions';
import { Role } from '../src/Role';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function textResponse(status: number, text: string): Response {
  return new Response(text, { status });
}

const originalFetch = global.fetch;

function stubFetch(response: Response | (() => Response), captured?: { url?: string; init?: RequestInit }) {
  global.fetch = (async (url: string, init?: RequestInit) => {
    if (captured) {
      captured.url = url;
      captured.init = init;
    }
    return typeof response === 'function' ? response() : response;
  }) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = originalFetch;
});

describe('LLM.chatCompletion', () => {
  test('parses choices, usage, and model from a well-formed response', async () => {
    stubFetch(
      jsonResponse(200, {
        model: 'test-model',
        usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hi there.' },
            finish_reason: 'stop',
          },
        ],
      }),
    );

    const llm = new LLM('http://localhost:8080');
    const result = await llm.chatCompletion(new Conversation(), new ChatCompletionOptions());

    expect(result.model).toBe('test-model');
    expect(result.usage.promptTokens).toBe(3);
    expect(result.usage.completionTokens).toBe(5);
    expect(result.usage.totalTokens).toBe(8);
    expect(result.choices).toHaveLength(1);
    expect(result.choices[0].message.role).toBe(Role.Assistant);
    expect(result.choices[0].message.content).toBe('Hi there.');
    expect(result.choices[0].finishReason).toBe('stop');
  });

  test('maps tool_calls to ToolCall instances', async () => {
    stubFetch(
      jsonResponse(200, {
        model: 'test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{ id: 'call_1', function: { name: 'echo', arguments: '{"x":1}' } }],
            },
            finish_reason: 'tool_calls',
          },
        ],
      }),
    );

    const llm = new LLM('http://localhost:8080');
    const result = await llm.chatCompletion(new Conversation(), new ChatCompletionOptions());

    const toolCalls = result.choices[0].message.toolCalls;
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls?.[0].id).toBe('call_1');
    expect(toolCalls?.[0].name).toBe('echo');
    expect(toolCalls?.[0].argumentsJson).toBe('{"x":1}');
  });

  test('falls back to Role.Unknown for an unrecognized role', async () => {
    stubFetch(
      jsonResponse(200, {
        model: 'test-model',
        choices: [{ index: 0, message: { role: 'weird', content: 'x' }, finish_reason: 'stop' }],
      }),
    );

    const llm = new LLM('http://localhost:8080');
    const result = await llm.chatCompletion(new Conversation(), new ChatCompletionOptions());

    expect(result.choices[0].message.role).toBe(Role.Unknown);
  });

  test('splits Harmony channel markers into content and reasoning', async () => {
    stubFetch(
      jsonResponse(200, {
        model: 'test-model',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '<|channel|>analysis<|message|>thinking...<|end|><|start|>assistant<|channel|>final<|message|>Done.<|return|>',
            },
            finish_reason: 'stop',
          },
        ],
      }),
    );

    const llm = new LLM('http://localhost:8080');
    const result = await llm.chatCompletion(new Conversation(), new ChatCompletionOptions());

    expect(result.choices[0].message.content).toBe('Done.');
    expect(result.choices[0].message.reasoningContent).toBe('thinking...');
  });

  test('throws when the response body has no choices array', async () => {
    stubFetch(jsonResponse(200, { model: 'test-model' }));

    const llm = new LLM('http://localhost:8080');
    await expect(llm.chatCompletion(new Conversation(), new ChatCompletionOptions())).rejects.toThrow(
      'LLM response missing choices',
    );
  });

  test('throws on non-JSON response body', async () => {
    stubFetch(textResponse(200, 'not json'));

    const llm = new LLM('http://localhost:8080');
    await expect(llm.chatCompletion(new Conversation(), new ChatCompletionOptions())).rejects.toThrow(
      'Invalid JSON response from LLM',
    );
  });

  test('throws with the error message on HTTP error status', async () => {
    stubFetch(jsonResponse(500, { error: { message: 'boom' } }));

    const llm = new LLM('http://localhost:8080');
    await expect(llm.chatCompletion(new Conversation(), new ChatCompletionOptions())).rejects.toThrow(
      'LLM request failed: boom',
    );
  });

  test('throws when the response has an error field even with a 200 status', async () => {
    stubFetch(jsonResponse(200, { error: 'nope' }));

    const llm = new LLM('http://localhost:8080');
    await expect(llm.chatCompletion(new Conversation(), new ChatCompletionOptions())).rejects.toThrow(
      'LLM request failed: nope',
    );
  });

  test('recovers from a llama.cpp Harmony autoparser failure embedded in a 500 error', async () => {
    const raw = '<|channel|>final<|message|>Recovered answer<|return|>';
    stubFetch(
      jsonResponse(500, {
        error: { message: `Failed to parse input at pos 12: ${raw}` },
      }),
    );

    const llm = new LLM('http://localhost:8080', undefined, 'fallback-model');
    const result = await llm.chatCompletion(new Conversation(), new ChatCompletionOptions());

    expect(result.model).toBe('fallback-model');
    expect(result.choices[0].message.content).toBe('Recovered answer');
    expect(result.choices[0].finishReason).toBe('stop');
  });

  test('rethrows the original error when Harmony recovery does not apply', async () => {
    stubFetch(jsonResponse(500, { error: { message: 'totally unrelated failure' } }));

    const llm = new LLM('http://localhost:8080');
    await expect(llm.chatCompletion(new Conversation(), new ChatCompletionOptions())).rejects.toThrow(
      'LLM request failed: totally unrelated failure',
    );
  });

  test('sends an Authorization header when an apiKey is configured', async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    stubFetch(
      jsonResponse(200, {
        model: 'test-model',
        choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }],
      }),
      captured,
    );

    const llm = new LLM('http://localhost:8080', 'secret-key');
    await llm.chatCompletion(new Conversation(), new ChatCompletionOptions());

    const headers = captured.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret-key');
    expect(captured.url).toBe('http://localhost:8080/v1/chat/completions');
  });

  test('serializes conversation messages and options into the request body', async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    stubFetch(
      jsonResponse(200, {
        model: 'test-model',
        choices: [{ index: 0, message: { role: 'assistant', content: 'hi' }, finish_reason: 'stop' }],
      }),
      captured,
    );

    const llm = new LLM('http://localhost:8080');
    const conversation = new Conversation([new Message(Role.User, 'hello')]);
    await llm.chatCompletion(conversation, new ChatCompletionOptions('my-model'));

    const body = JSON.parse(captured.init?.body as string);
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }]);
    expect(body.model).toBe('my-model');
  });
});

function sseResponse(events: string[], status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${event}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, { status });
}

describe('LLM.chatCompletionStream', () => {
  test('emits incremental content chunks and resolves the accumulated response', async () => {
    stubFetch(
      sseResponse([
        JSON.stringify({ model: 'test-model', choices: [{ index: 0, delta: { role: 'assistant', content: 'Hel' } }] }),
        JSON.stringify({ model: 'test-model', choices: [{ index: 0, delta: { content: 'lo.' } }] }),
        JSON.stringify({ model: 'test-model', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }),
        JSON.stringify({ model: 'test-model', choices: [], usage: { prompt_tokens: 2, completion_tokens: 4, total_tokens: 6 } }),
        '[DONE]',
      ]),
    );

    const chunks: string[] = [];
    const llm = new LLM('http://localhost:8080');
    const result = await llm.chatCompletionStream(new Conversation(), new ChatCompletionOptions(), (chunk) => {
      if (chunk.delta) {
        chunks.push(chunk.delta);
      }
    });

    expect(chunks).toEqual(['Hel', 'lo.']);
    expect(result.model).toBe('test-model');
    expect(result.choices[0].message.content).toBe('Hello.');
    expect(result.choices[0].message.role).toBe(Role.Assistant);
    expect(result.choices[0].finishReason).toBe('stop');
    expect(result.usage.promptTokens).toBe(2);
    expect(result.usage.completionTokens).toBe(4);
    expect(result.usage.totalTokens).toBe(6);
  });

  test('accumulates streamed tool call argument fragments by index', async () => {
    stubFetch(
      sseResponse([
        JSON.stringify({
          model: 'test-model',
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant',
                tool_calls: [{ index: 0, id: 'call_1', function: { name: 'echo', arguments: '{"x":' } }],
              },
            },
          ],
        }),
        JSON.stringify({
          model: 'test-model',
          choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '1}' } }] } }],
        }),
        JSON.stringify({ model: 'test-model', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }),
        '[DONE]',
      ]),
    );

    const llm = new LLM('http://localhost:8080');
    const result = await llm.chatCompletionStream(new Conversation(), new ChatCompletionOptions(), () => {});

    const toolCalls = result.choices[0].message.toolCalls;
    expect(toolCalls).toHaveLength(1);
    expect(toolCalls?.[0].id).toBe('call_1');
    expect(toolCalls?.[0].name).toBe('echo');
    expect(toolCalls?.[0].argumentsJson).toBe('{"x":1}');
    expect(result.choices[0].finishReason).toBe('tool_calls');
  });

  test('throws with the error message on an HTTP error status', async () => {
    stubFetch(jsonResponse(500, { error: { message: 'boom' } }));

    const llm = new LLM('http://localhost:8080');
    await expect(
      llm.chatCompletionStream(new Conversation(), new ChatCompletionOptions(), () => {}),
    ).rejects.toThrow('LLM request failed: boom');
  });
});

describe('LLM.tokenize', () => {
  test('extracts token ids from plain numbers and object entries', async () => {
    stubFetch(jsonResponse(200, { tokens: [1, { id: 2 }, 3] }));

    const llm = new LLM('http://localhost:8080');
    const tokens = await llm.tokenize('hello');

    expect(tokens).toEqual([1, 2, 3]);
  });

  test('throws when the response is missing a tokens array', async () => {
    stubFetch(jsonResponse(200, {}));

    const llm = new LLM('http://localhost:8080');
    await expect(llm.tokenize('hello')).rejects.toThrow('LLM tokenize response missing tokens');
  });
});

describe('LLM.embeddings', () => {
  test('parses plain numeric embedding vectors', async () => {
    stubFetch(
      jsonResponse(200, {
        model: 'embed-model',
        usage: { prompt_tokens: 2, total_tokens: 2 },
        data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
      }),
    );

    const llm = new LLM('http://localhost:8080');
    const result = await llm.embeddings('hello');

    expect(result.model).toBe('embed-model');
    expect(result.embeddings).toHaveLength(1);
    expect(result.embeddings[0].index).toBe(0);
    expect(result.embeddings[0].vector).toEqual([0.1, 0.2, 0.3]);
  });

  test('decodes base64-encoded little-endian float32 embedding vectors', async () => {
    const floats = [1.5, -2.25, 3.0];
    const buffer = Buffer.alloc(floats.length * 4);
    floats.forEach((value, i) => buffer.writeFloatLE(value, i * 4));
    const encoded = buffer.toString('base64');

    stubFetch(
      jsonResponse(200, {
        model: 'embed-model',
        data: [{ index: 0, embedding: encoded }],
      }),
    );

    const llm = new LLM('http://localhost:8080');
    const result = await llm.embeddings('hello', new EmbeddingOptions(undefined, 'base64'));

    expect(result.embeddings[0].vector.length).toBe(3);
    result.embeddings[0].vector.forEach((value, i) => {
      expect(value).toBeCloseTo(floats[i], 5);
    });
  });

  test('throws on malformed base64 embedding (byte length not a multiple of 4)', async () => {
    stubFetch(
      jsonResponse(200, {
        model: 'embed-model',
        data: [{ index: 0, embedding: Buffer.from([1, 2, 3]).toString('base64') }],
      }),
    );

    const llm = new LLM('http://localhost:8080');
    await expect(llm.embeddings('hello')).rejects.toThrow('LLM embeddings response has malformed base64 embedding');
  });

  test('throws when the embedding response is missing a data array', async () => {
    stubFetch(jsonResponse(200, { model: 'embed-model' }));

    const llm = new LLM('http://localhost:8080');
    await expect(llm.embeddings('hello')).rejects.toThrow('LLM embeddings response missing data');
  });

  test('throws when an embedding vector is neither array nor string', async () => {
    stubFetch(jsonResponse(200, { data: [{ index: 0, embedding: 42 }] }));

    const llm = new LLM('http://localhost:8080');
    await expect(llm.embeddings('hello')).rejects.toThrow('LLM embeddings response missing embedding vector');
  });

  test('falls back to options.model then defaultModel when the response omits model', async () => {
    stubFetch(jsonResponse(200, { data: [{ index: 0, embedding: [1] }] }));

    const llm = new LLM('http://localhost:8080', undefined, 'default-model');
    const result = await llm.embeddings('hello');

    expect(result.model).toBe('default-model');
  });
});

describe('LLM.rerank', () => {
  test('parses rerank results', async () => {
    stubFetch(
      jsonResponse(200, {
        model: 'rerank-model',
        usage: { prompt_tokens: 4, total_tokens: 4 },
        results: [
          { index: 1, relevance_score: 0.9 },
          { index: 0, relevance_score: 0.2 },
        ],
      }),
    );

    const llm = new LLM('http://localhost:8080');
    const result = await llm.rerank('query', ['a', 'b'], new RerankOptions());

    expect(result.results).toHaveLength(2);
    expect(result.results[0].index).toBe(1);
    expect(result.results[0].relevanceScore).toBe(0.9);
  });

  test('throws when a rerank result item is missing index or relevance_score', async () => {
    stubFetch(jsonResponse(200, { results: [{ index: 0 }] }));

    const llm = new LLM('http://localhost:8080');
    await expect(llm.rerank('query', ['a'])).rejects.toThrow(
      'LLM rerank response item missing index or relevance_score',
    );
  });

  test('throws when the rerank response is missing a results array', async () => {
    stubFetch(jsonResponse(200, {}));

    const llm = new LLM('http://localhost:8080');
    await expect(llm.rerank('query', ['a'])).rejects.toThrow('LLM rerank response missing results');
  });
});

describe('LLM network errors', () => {
  test('wraps a fetch rejection (e.g. timeout/network failure) into a plain Error', async () => {
    global.fetch = (async () => {
      throw new Error('fetch failed: timeout');
    }) as unknown as typeof fetch;

    const llm = new LLM('http://localhost:8080');
    await expect(llm.chatCompletion(new Conversation(), new ChatCompletionOptions())).rejects.toThrow(
      'fetch failed: timeout',
    );
  });
});

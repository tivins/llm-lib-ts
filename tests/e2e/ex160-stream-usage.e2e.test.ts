import { describe, expect, test } from 'bun:test';
import type { ChatCompletionChunk } from '../../src/ChatCompletionChunk';
import { ChatCompletionOptions } from '../../src/ChatCompletionOptions';
import { Conversation } from '../../src/Conversation';
import { LLM } from '../../src/LLM';
import { Message } from '../../src/Message';
import { Role } from '../../src/Role';
import { CHAT_ENDPOINT, CHAT_UP } from './support/servers';

describe.skipIf(!CHAT_UP)('e2e: running usage on streamed chunks', () => {
  test('each chunk carries the usage so far, the last one the server usage', async () => {
    const llm = new LLM(CHAT_ENDPOINT, undefined, undefined, 300);
    const chunks: ChatCompletionChunk[] = [];
    const response = await llm.chatCompletionStream(
      new Conversation([new Message(Role.User, 'Say hi in 3 words.')]),
      new ChatCompletionOptions(),
      (chunk) => chunks.push(chunk),
    );

    const running = chunks.slice(0, -1);
    const last = chunks[chunks.length - 1];

    // llama.cpp sends per-chunk timings: every delta knows the count so far, and it never goes down.
    for (const chunk of running) {
      expect(chunk.usage).not.toBeNull();
    }
    const counts = running.map((chunk) => chunk.usage!.completionTokens);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));

    expect(last.delta).toBe('');
    expect(last.usage).toBe(response.usage);
    expect(response.usage.promptTokens).toBe(running[running.length - 1].usage!.promptTokens);
    // The end-of-generation token is only counted in the server's final usage.
    expect(response.usage.completionTokens - counts[counts.length - 1]).toBeWithin(0, 2);
    expect(response.usage.totalTokens).toBe(response.usage.promptTokens + response.usage.completionTokens);

    const reasoningDeltas = running.filter((chunk) => chunk.reasoningDelta).length;
    if (reasoningDeltas === 0) {
      expect(response.usage.reasoningTokens).toBeNull();
    } else {
      // Reasoning delimiters are counted but never sent as deltas.
      expect(response.usage.reasoningTokens!).toBeGreaterThanOrEqual(reasoningDeltas);
      expect(response.usage.reasoningTokens!).toBeLessThan(response.usage.completionTokens);
    }
  }, 300000);
});

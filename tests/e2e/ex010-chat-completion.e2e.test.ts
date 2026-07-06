import { describe, expect, test } from 'bun:test';
import { ChatCompletionOptions } from '../../src/ChatCompletionOptions';
import { Conversation } from '../../src/Conversation';
import { LLM } from '../../src/LLM';
import { Message } from '../../src/Message';
import { Role } from '../../src/Role';
import { CHAT_ENDPOINT, CHAT_UP } from './support/servers';

describe.skipIf(!CHAT_UP)('e2e: single-turn chat completion', () => {
  test('returns a non-empty assistant answer', async () => {
    const llm = new LLM(CHAT_ENDPOINT, undefined, undefined, 300);

    const conversation = new Conversation([
      new Message(Role.System, 'You are a concise assistant. Answer in English with practical details.'),
      new Message(Role.User, 'I need to prepare for a client meeting in 10 minutes. Give a short checklist.'),
    ]);

    const response = await llm.chatCompletion(conversation, new ChatCompletionOptions(undefined, 0.2, 0.9));
    const message = response.firstChoice()?.message;

    expect(message).toBeDefined();
    expect(message?.role).toBe(Role.Assistant);
    expect(message?.content.trim().length).toBeGreaterThan(0);
  }, 60000);
});

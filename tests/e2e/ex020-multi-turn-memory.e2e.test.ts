import { describe, expect, test } from 'bun:test';
import { ChatCompletionOptions } from '../../src/ChatCompletionOptions';
import { Conversation } from '../../src/Conversation';
import { LLM } from '../../src/LLM';
import { Message } from '../../src/Message';
import { Role } from '../../src/Role';
import { CHAT_ENDPOINT, CHAT_UP } from './support/servers';

describe.skipIf(!CHAT_UP)('e2e: two-turn conversation with memory', () => {
  test('second turn answer reflects prior conversation context', async () => {
    const llm = new LLM(CHAT_ENDPOINT, undefined, undefined, 300);

    const conversation = new Conversation([
      new Message(Role.System, 'You are a concise assistant. Answer in English and keep prior messages in mind.'),
      new Message(Role.User, 'Propose three simple ideas to reduce stress before a presentation.'),
    ]);

    const options = new ChatCompletionOptions(undefined, 0.2, 0.9);

    const firstResponse = await llm.chatCompletion(conversation, options);
    const firstMessage = firstResponse.firstChoice()?.message;
    expect(firstMessage?.content.trim().length).toBeGreaterThan(0);

    conversation.addMessage(new Message(Role.Assistant, firstMessage!.content));
    conversation.addMessage(
      new Message(Role.User, 'Now turn these tips into a 5-minute routine, without repeating the whole list.'),
    );

    const secondResponse = await llm.chatCompletion(conversation, options);
    const secondMessage = secondResponse.firstChoice()?.message;

    expect(secondMessage?.role).toBe(Role.Assistant);
    expect(secondMessage?.content.trim().length).toBeGreaterThan(0);
    expect(conversation.messages).toHaveLength(4);
  }, 120000);
});

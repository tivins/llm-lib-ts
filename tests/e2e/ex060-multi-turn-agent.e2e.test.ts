import { describe, expect, test } from 'bun:test';
import { Agent } from '../../src/Agent';
import { ChatCompletionOptions } from '../../src/ChatCompletionOptions';
import { Conversation } from '../../src/Conversation';
import { LLM } from '../../src/LLM';
import { Message } from '../../src/Message';
import { Role } from '../../src/Role';
import { ToolRegistry } from '../../src/ToolRegistry';
import { CHAT_ENDPOINT, CHAT_UP } from './support/servers';

describe.skipIf(!CHAT_UP)('e2e: multi-turn agent session with response metadata', () => {
  test('reuses one agent across two user turns and reports usage metadata', async () => {
    const llm = new LLM(CHAT_ENDPOINT, undefined, undefined, 300);
    const agent = new Agent(llm, new ToolRegistry());
    const options = new ChatCompletionOptions(undefined, 0.2, 0.9);

    const conversation = new Conversation([
      new Message(Role.System, 'You are a concise assistant. Keep answers short and remember earlier turns.'),
    ]);

    const userTurns = [
      'Draft an agenda for a 30-minute meeting about the website redesign.',
      'Now trim that agenda to at most 3 bullet points while keeping the same context.',
    ];

    for (const userPrompt of userTurns) {
      conversation.addMessage(Message.withCreatedAt(Role.User, userPrompt));

      const result = await agent.runTurn(conversation, options);

      expect(result.success).toBe(true);
      expect(result.message?.content.trim().length).toBeGreaterThan(0);
      expect(result.message?.meta.model).toBeDefined();
      expect(result.message?.meta.usage).toBeDefined();
    }

    expect(conversation.messages).toHaveLength(5);
  }, 120000);
});

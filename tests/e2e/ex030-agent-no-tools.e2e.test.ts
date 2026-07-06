import { describe, expect, test } from 'bun:test';
import { Agent } from '../../src/Agent';
import { ChatCompletionOptions } from '../../src/ChatCompletionOptions';
import { Conversation } from '../../src/Conversation';
import { LLM } from '../../src/LLM';
import { Message } from '../../src/Message';
import { Role } from '../../src/Role';
import { ToolRegistry } from '../../src/ToolRegistry';
import { CHAT_ENDPOINT, CHAT_UP } from './support/servers';

describe.skipIf(!CHAT_UP)('e2e: agent turn with no tools', () => {
  test('runs a single turn and returns a successful text answer', async () => {
    const llm = new LLM(CHAT_ENDPOINT, undefined, undefined, 300);
    const agent = new Agent(llm, new ToolRegistry(), 0);

    const conversation = new Conversation([
      new Message(Role.System, 'You are a pragmatic product assistant. Answer with a short, actionable structure.'),
      new Message(Role.User, 'We are releasing a small note-taking app. Suggest a realistic manual testing plan.'),
    ]);

    const result = await agent.runTurn(conversation, new ChatCompletionOptions(undefined, 0.2, 0.9));

    expect(result.success).toBe(true);
    expect(result.message?.content.trim().length).toBeGreaterThan(0);
    expect(result.toolRounds).toBe(0);
  }, 60000);
});

import { describe, expect, test } from 'bun:test';
import { Agent } from '../../src/Agent';
import { AgentHooks } from '../../src/AgentHooks';
import { ChatCompletionOptions } from '../../src/ChatCompletionOptions';
import { Conversation } from '../../src/Conversation';
import { Message } from '../../src/Message';
import { Role } from '../../src/Role';
import { Tool } from '../../src/Tool';
import { ToolCall } from '../../src/ToolCall';
import { userRejectedToolCall } from '../../src/ToolCallRejection';
import { ToolRegistry } from '../../src/ToolRegistry';
import { ToolSchema } from '../../src/ToolSchema';
import { ResponseFactory } from './support/ResponseFactory';
import { StubLLM } from './support/StubLLM';

// Deterministic: uses StubLLM instead of a live llama.cpp server, so this test
// runs unconditionally and verifies the approval-gating flow in isolation.
describe('e2e: reject a proposed tool call via beforeToolCall', () => {
  test('the real handler never runs once the hook rejects the proposal', async () => {
    let handlerRan = false;

    const tools = new ToolRegistry(
      new Tool(
        new ToolSchema('write_file', 'Write text content to a file path.', {
          type: 'object',
          properties: { path: { type: 'string' }, content: { type: 'string' } },
          required: ['path', 'content'],
          additionalProperties: false,
        }),
        async () => {
          handlerRan = true;
          return JSON.stringify({ written: true });
        },
      ),
    );

    const hooks = new AgentHooks().beforeToolCall((event) => {
      if (event.call.name !== 'write_file') {
        return;
      }
      event.replacement = userRejectedToolCall(event.call);
    });

    const llm = new StubLLM();
    llm.enqueue(
      ResponseFactory.assistantToolCalls([
        new ToolCall('call_write_1', 'write_file', JSON.stringify({ path: 'notes.txt', content: 'hello' })),
      ]),
      ResponseFactory.assistantText(
        'I could not write the file because you rejected the proposal. Tell me if you want a different path.',
      ),
    );

    const agent = new Agent(llm, tools, 2, hooks);

    const conversation = new Conversation([
      new Message(Role.System, 'You are a coding assistant. Use write_file when the user asks to create a file.'),
      new Message(Role.User, 'Create notes.txt with the text hello.'),
    ]);

    const result = await agent.runTurn(conversation, new ChatCompletionOptions());

    expect(result.success).toBe(true);
    expect(result.toolRounds).toBe(1);
    expect(handlerRan).toBe(false);
    expect(result.message?.content).toContain('rejected the proposal');
  });
});

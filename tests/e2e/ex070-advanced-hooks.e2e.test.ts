import { describe, expect, test } from 'bun:test';
import { Agent } from '../../src/Agent';
import { AgentHooks } from '../../src/AgentHooks';
import { ChatCompletionOptions } from '../../src/ChatCompletionOptions';
import { Conversation } from '../../src/Conversation';
import { LLM } from '../../src/LLM';
import { Message } from '../../src/Message';
import { Role } from '../../src/Role';
import { Tool } from '../../src/Tool';
import { ToolRegistry } from '../../src/ToolRegistry';
import { ToolSchema } from '../../src/ToolSchema';
import { CHAT_ENDPOINT, CHAT_UP } from './support/servers';

describe.skipIf(!CHAT_UP)('e2e: advanced lifecycle hooks (mocked tool + response rewriting)', () => {
  test('mocks lookup_inventory via beforeToolCall and rewrites the visible response', async () => {
    const llm = new LLM(CHAT_ENDPOINT, undefined, undefined, 300);

    const tools = new ToolRegistry(
      new Tool(
        new ToolSchema(
          'lookup_inventory',
          'Look up product stock by SKU.',
          {
            type: 'object',
            properties: { sku: { type: 'string' } },
            required: ['sku'],
            additionalProperties: false,
          },
        ),
        async () => {
          throw new Error('real handler should never run: beforeToolCall mocks this tool');
        },
      ),
    );

    let mockedCallCount = 0;
    let visibleContentRewritten = false;

    const hooks = new AgentHooks()
      .beforeToolCall((event) => {
        if (event.call.name !== 'lookup_inventory') {
          return;
        }
        mockedCallCount++;
        event.replacement = new Message(
          Role.Tool,
          JSON.stringify({ sku: 'SKU-100', name: 'Wireless mouse', stock: 999, warehouse: 'Mock warehouse' }),
          null,
          {},
          null,
          event.call.id,
        );
      })
      .onAssistantResponse((event) => {
        event.visibleContent = `[Support Bot] ${event.rawContent.trim()}`;
        visibleContentRewritten = true;
      });

    const agent = new Agent(llm, tools, 3, hooks);

    const conversation = new Conversation([
      new Message(
        Role.System,
        'You are a stock assistant. When the user gives a SKU, call lookup_inventory before answering.',
      ),
      new Message(Role.User, 'Can we ship 10 units of SKU-100 today?'),
    ]);

    const result = await agent.runTurn(conversation, new ChatCompletionOptions(undefined, 0.2, 0.9, 1, tools, 'auto'));

    expect(result.success).toBe(true);
    expect(mockedCallCount).toBeGreaterThanOrEqual(1);
    expect(visibleContentRewritten).toBe(true);
    expect(result.message?.content.startsWith('[Support Bot] ')).toBe(true);
  }, 90000);
});

import { describe, expect, test } from 'bun:test';
import { Agent } from '../../src/Agent';
import { ChatCompletionOptions } from '../../src/ChatCompletionOptions';
import { Conversation } from '../../src/Conversation';
import { LLM } from '../../src/LLM';
import { Message } from '../../src/Message';
import { Role } from '../../src/Role';
import { Tool } from '../../src/Tool';
import { ToolRegistry } from '../../src/ToolRegistry';
import { ToolSchema } from '../../src/ToolSchema';
import { CHAT_ENDPOINT, CHAT_UP } from './support/servers';

type Order = {
  customer: string;
  status: string;
  carrier: string;
  last_event: string;
  estimated_delivery: string;
};

describe.skipIf(!CHAT_UP)('e2e: agent calls one tool before answering', () => {
  test('looks up the order before drafting a customer reply', async () => {
    const llm = new LLM(CHAT_ENDPOINT, undefined, undefined, 300);

    const orders: Record<string, Order> = {
      'FR-2026-0042': {
        customer: 'Camille Martin',
        status: 'delayed',
        carrier: 'Colissimo',
        last_event: 'Sorting center delay in Lyon',
        estimated_delivery: '2026-06-12',
      },
    };

    const state: { handlerCalledWith: string | null } = { handlerCalledWith: null };

    const tools = new ToolRegistry(
      new Tool(
        new ToolSchema(
          'lookup_order',
          'Look up a customer order by its public order reference.',
          {
            type: 'object',
            properties: {
              order_reference: { type: 'string', description: 'The order reference, e.g. FR-2026-0042.' },
            },
            required: ['order_reference'],
            additionalProperties: false,
          },
        ),
        async (args: string) => {
          const payload = JSON.parse(args);
          const reference = payload.order_reference ?? '';
          state.handlerCalledWith = reference;
          return JSON.stringify(orders[reference] ?? { error: 'Order not found', order_reference: reference });
        },
      ),
    );

    const agent = new Agent(llm, tools, 2);

    const conversation = new Conversation([
      new Message(
        Role.System,
        'You are a customer-support assistant. When the user gives an order reference, call lookup_order before answering.',
      ),
      new Message(Role.User, 'Hi, can you check order FR-2026-0042 and draft a reply I can send to the customer?'),
    ]);

    const result = await agent.runTurn(conversation, new ChatCompletionOptions(undefined, 0.2, 0.9, 1, tools, 'auto'));

    expect(result.success).toBe(true);
    expect(state.handlerCalledWith).toBe('FR-2026-0042');
    expect(result.toolRounds).toBeGreaterThanOrEqual(1);
    expect(result.message?.content.trim().length).toBeGreaterThan(0);
  }, 90000);
});

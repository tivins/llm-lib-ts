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

describe.skipIf(!CHAT_UP)('e2e: multi-tool support workflow with lifecycle hooks', () => {
  test('calls order and policy tools, and fires afterLlmCall/afterToolCall hooks', async () => {
    const llm = new LLM(CHAT_ENDPOINT, undefined, undefined, 300);

    const orders: Record<string, Record<string, unknown>> = {
      'FR-2026-0042': {
        customer: 'Camille Martin',
        status: 'delayed',
        carrier: 'Colissimo',
        last_event: 'Sorting center delay in Lyon',
        estimated_delivery: '2026-06-12',
        total_eur: 89.9,
      },
    };

    const policies: Record<string, Record<string, unknown>> = {
      delayed_delivery: {
        summary: 'If delivery is more than 48 hours late, offer shipping-fee credit.',
        customer_tone: 'Apologize, explain the next update date, and avoid blaming the carrier.',
      },
      delivered_order: {
        summary: 'For delivered orders, ask the customer to check the pickup point or mailbox first.',
        customer_tone: 'Be precise and invite the customer to reply if the package is still missing.',
      },
    };

    const lookupOrder = new Tool(
      new ToolSchema(
        'lookup_order',
        'Look up a customer order by its public order reference.',
        {
          type: 'object',
          properties: { order_reference: { type: 'string' } },
          required: ['order_reference'],
          additionalProperties: false,
        },
      ),
      async (args: string) => {
        const reference = JSON.parse(args).order_reference ?? '';
        return JSON.stringify(orders[reference] ?? { error: 'Order not found', order_reference: reference });
      },
    );

    const getPolicy = new Tool(
      new ToolSchema(
        'get_support_policy',
        'Fetch the internal support policy for a known case type.',
        {
          type: 'object',
          properties: { case_type: { type: 'string', enum: ['delayed_delivery', 'delivered_order'] } },
          required: ['case_type'],
          additionalProperties: false,
        },
      ),
      async (args: string) => {
        const caseType = JSON.parse(args).case_type ?? '';
        return JSON.stringify(policies[caseType] ?? { error: 'Unknown policy', case_type: caseType });
      },
    );

    const calledTools: string[] = [];
    let llmCallCount = 0;

    const hooks = new AgentHooks()
      .afterLlmCall(() => {
        llmCallCount++;
      })
      .afterToolCall((event) => {
        calledTools.push(event.call.name);
      });

    const tools = new ToolRegistry(lookupOrder, getPolicy);
    const agent = new Agent(llm, tools, 4, hooks);

    const conversation = new Conversation([
      new Message(
        Role.System,
        'You are a senior customer-support assistant. Use tools for order facts and policy facts before making a recommendation. Do not invent tracking events or policy details.',
      ),
      new Message(
        Role.User,
        'Customer Camille Martin is asking for a goodwill gesture on order FR-2026-0042. Verify the facts, apply the right policy, then draft the reply to send.',
      ),
    ]);

    const result = await agent.runTurn(conversation, new ChatCompletionOptions(undefined, 0.2, 0.9, 1, tools, 'auto'));

    expect(result.success).toBe(true);
    expect(calledTools).toContain('lookup_order');
    expect(calledTools).toContain('get_support_policy');
    expect(llmCallCount).toBeGreaterThanOrEqual(2);
    expect(result.message?.content.trim().length).toBeGreaterThan(0);
  }, 120000);
});

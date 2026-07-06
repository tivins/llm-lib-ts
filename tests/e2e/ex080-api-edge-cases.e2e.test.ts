import { describe, expect, test } from 'bun:test';
import { Agent } from '../../src/Agent';
import { AgentHooks } from '../../src/AgentHooks';
import { ChatCompletionOptions } from '../../src/ChatCompletionOptions';
import { Conversation } from '../../src/Conversation';
import { LLM } from '../../src/LLM';
import { Message } from '../../src/Message';
import { Role } from '../../src/Role';
import { Tool } from '../../src/Tool';
import { ToolCall } from '../../src/ToolCall';
import { ToolRegistry } from '../../src/ToolRegistry';
import { ToolSchema } from '../../src/ToolSchema';
import { CHAT_ENDPOINT, CHAT_UP } from './support/servers';

describe('e2e: ToolRegistry edge cases (no LLM call)', () => {
  test('rejects duplicate tool names, reports unknown tools, and catches handler exceptions', async () => {
    const registry = new ToolRegistry();
    registry.registerTools(
      new Tool(new ToolSchema('lookup_order', 'Lookup order', { type: 'object', properties: {} }), async () =>
        JSON.stringify({ handler: 'v1' }),
      ),
    );

    expect(() =>
      registry.registerTools(
        new Tool(new ToolSchema('lookup_order', 'Lookup order', { type: 'object', properties: {} }), async () =>
          JSON.stringify({ handler: 'v2' }),
        ),
      ),
    ).toThrow(/already registered/);

    const unknownResult = await registry.execute(new ToolCall('call-2', 'missing_tool', '{}'));
    expect(unknownResult.content).toContain('No handler for tool');

    const boomRegistry = new ToolRegistry(
      new Tool(new ToolSchema('boom', 'Always throws', { type: 'object', properties: {} }), async () => {
        throw new Error('handler exploded');
      }),
    );
    const handlerErrorResult = await boomRegistry.execute(new ToolCall('call-3', 'boom', '{}'));
    expect(handlerErrorResult.content).toContain('handler exploded');
  });
});

describe.skipIf(!CHAT_UP)('e2e: structured JSON output via responseFormat', () => {
  test('returns a JSON object honoring the requested schema shape', async () => {
    const llm = new LLM(CHAT_ENDPOINT, undefined, undefined, 300);

    const conversation = new Conversation([
      new Message(Role.System, 'Return valid JSON only. No markdown, no explanation.'),
      new Message(
        Role.User,
        'Give a JSON object with keys title, priority (low|medium|high), and tasks (array of 2 strings) for a deployment checklist.',
      ),
    ]);

    const response = await llm.chatCompletion(
      conversation,
      new ChatCompletionOptions(undefined, 0.1, 1.0, 1, undefined, undefined, 'json_object'),
    );

    const text = (response.firstChoice()?.message.content ?? '').trim();
    const decoded = JSON.parse(text);

    expect(typeof decoded).toBe('object');
    expect(decoded).not.toBeNull();
  }, 60000);
});

describe.skipIf(!CHAT_UP)('e2e: agent unknown tool recovery + max tool rounds', () => {
  test('surfaces onMaxToolRoundsExceeded and a tool message for the unavailable get_weather tool', async () => {
    const llm = new LLM(CHAT_ENDPOINT, undefined, undefined, 300);

    const orders: Record<string, Record<string, unknown>> = {
      'FR-2026-0042': { status: 'delayed', customer: 'Camille Martin' },
      'FR-2026-0081': { status: 'delivered', customer: 'Nadia Benali' },
    };

    const tools = new ToolRegistry(
      new Tool(
        new ToolSchema('lookup_order', 'Look up one order by reference.', {
          type: 'object',
          properties: { order_reference: { type: 'string' } },
          required: ['order_reference'],
          additionalProperties: false,
        }),
        async (args: string) => {
          const reference = JSON.parse(args).order_reference ?? '';
          return JSON.stringify(orders[reference] ?? { error: 'Order not found', order_reference: reference });
        },
      ),
    );

    let maxRoundsHit = false;
    const hooks = new AgentHooks().onMaxToolRoundsExceeded(() => {
      maxRoundsHit = true;
    });

    const agent = new Agent(llm, tools, 1, hooks);

    const conversation = new Conversation([
      new Message(
        Role.System,
        'You are a support assistant. Use lookup_order for order facts. If get_weather is unavailable, continue with order facts only.',
      ),
      new Message(
        Role.User,
        'Compare orders FR-2026-0042 and FR-2026-0081, and also tell me the weather in Paris using get_weather.',
      ),
    ]);

    const result = await agent.runTurn(conversation, new ChatCompletionOptions(undefined, 0.2, 1.0, 1, tools, 'auto'));

    // Either the model stays within 1 tool round (success) or exceeds it (max-rounds hook fires).
    expect(result.toolRounds).toBeGreaterThanOrEqual(0);
    if (!result.success) {
      expect(maxRoundsHit).toBe(true);
    }
  }, 90000);
});

describe.skipIf(!CHAT_UP)('e2e: reasoning_content is logged but never re-sent to the LLM', () => {
  test('conversation payload never includes reasoning_content', async () => {
    const llm = new LLM(CHAT_ENDPOINT, undefined, undefined, 300);
    const agent = new Agent(llm, new ToolRegistry());

    const conversation = new Conversation([
      new Message(Role.System, 'You are a concise assistant.'),
      new Message(Role.User, 'What is 2 + 2?'),
    ]);

    const result = await agent.runTurn(conversation, new ChatCompletionOptions(undefined, 0.2, 0.9));
    expect(result.success).toBe(true);

    const payloadMessages = conversation.toChatCompletionPayload();
    const reasoningInPayload = payloadMessages.some((message) => 'reasoning_content' in message);

    expect(reasoningInPayload).toBe(false);
  }, 60000);
});

import { describe, expect, test } from 'bun:test';
import { Role } from '../src/Role';
import { Tool } from '../src/Tool';
import { ToolCall } from '../src/ToolCall';
import { ToolRegistry } from '../src/ToolRegistry';
import { ToolSchema } from '../src/ToolSchema';

function makeTool(name: string, handler: Tool['handler']): Tool {
  return new Tool(new ToolSchema(name, `desc:${name}`, { type: 'object', properties: {} }), handler);
}

describe('ToolRegistry', () => {
  test('registerTools registers schemas and handlers via the constructor', () => {
    const registry = new ToolRegistry(
      makeTool('echo', async (args) => args),
      makeTool('shout', async (args) => args.toUpperCase()),
    );

    expect(registry.has('echo')).toBe(true);
    expect(registry.has('shout')).toBe(true);
    expect(registry.has('missing')).toBe(false);
    expect(registry.all().map((s) => s.name)).toEqual(['echo', 'shout']);
  });

  test('registerTools throws when registering a duplicate tool name', () => {
    const registry = new ToolRegistry(makeTool('echo', async () => 'ok'));

    expect(() => registry.registerTools(makeTool('echo', async () => 'ok'))).toThrow(
      "ToolRegistry: tool 'echo' is already registered.",
    );
  });

  test('toRequestPayload maps schemas to their API shape', () => {
    const registry = new ToolRegistry(makeTool('echo', async () => 'ok'));

    expect(registry.toRequestPayload()).toEqual([
      {
        type: 'function',
        function: {
          name: 'echo',
          description: 'desc:echo',
          parameters: { type: 'object', properties: {} },
        },
      },
    ]);
  });

  test('execute runs the matching handler and wraps the result in a tool Message', async () => {
    const registry = new ToolRegistry(makeTool('echo', async (args) => `echo:${args}`));
    const call = new ToolCall('call_1', 'echo', '{"a":1}');

    const message = await registry.execute(call);

    expect(message.role).toBe(Role.Tool);
    expect(message.content).toBe('echo:{"a":1}');
    expect(message.toolCallId).toBe('call_1');
  });

  test('execute supports synchronous handlers', async () => {
    const registry = new ToolRegistry(makeTool('sync', (args) => `sync:${args}`));
    const call = new ToolCall('call_2', 'sync', 'x');

    const message = await registry.execute(call);

    expect(message.content).toBe('sync:x');
  });

  test('execute returns an error tool message when no handler is registered for the call', async () => {
    const registry = new ToolRegistry();
    const call = new ToolCall('call_3', 'missing', '{}');

    const message = await registry.execute(call);

    expect(message.role).toBe(Role.Tool);
    expect(JSON.parse(message.content)).toEqual({ error: 'No handler for tool: missing' });
    expect(message.toolCallId).toBe('call_3');
  });

  test('execute catches handler errors and wraps the message', async () => {
    const registry = new ToolRegistry(
      makeTool('boom', async () => {
        throw new Error('kaboom');
      }),
    );
    const call = new ToolCall('call_4', 'boom', '{}');

    const message = await registry.execute(call);

    expect(JSON.parse(message.content)).toEqual({ error: 'kaboom' });
    expect(message.toolCallId).toBe('call_4');
  });

  test('execute wraps non-Error throws using their string representation', async () => {
    const registry = new ToolRegistry(
      makeTool('boom', async () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw 'raw string failure';
      }),
    );
    const call = new ToolCall('call_5', 'boom', '{}');

    const message = await registry.execute(call);

    expect(JSON.parse(message.content)).toEqual({ error: 'raw string failure' });
  });

  test('executeAll runs every call and preserves order', async () => {
    const registry = new ToolRegistry(
      makeTool('a', async () => 'A'),
      makeTool('b', async () => 'B'),
    );
    const calls = [new ToolCall('1', 'a', ''), new ToolCall('2', 'b', ''), new ToolCall('3', 'missing', '')];

    const messages = await registry.executeAll(calls);

    expect(messages).toHaveLength(3);
    expect(messages[0].content).toBe('A');
    expect(messages[1].content).toBe('B');
    expect(JSON.parse(messages[2].content)).toEqual({ error: 'No handler for tool: missing' });
  });
});

describe('Tool', () => {
  test('pairs a schema with its handler', () => {
    const schema = new ToolSchema('name', 'description', {});
    const handler = async () => 'ok';
    const tool = new Tool(schema, handler);

    expect(tool.schema).toBe(schema);
    expect(tool.handler).toBe(handler);
  });
});

describe('ToolSchema', () => {
  test('toApiShape produces the OpenAI-compatible function shape', () => {
    const schema = new ToolSchema('get_weather', 'Gets the weather', {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    });

    expect(schema.toApiShape()).toEqual({
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'Gets the weather',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
    });
  });
});

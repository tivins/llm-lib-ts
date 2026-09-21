import { describe, expect, test } from 'bun:test';
import { Agent } from '../src/Agent';
import { AgentHookEvent } from '../src/AgentHookEvent';
import { AgentHooks } from '../src/AgentHooks';
import { ChatCompletionChunk } from '../src/ChatCompletionChunk';
import { ChatCompletionOptions } from '../src/ChatCompletionOptions';
import { ChatCompletionResponse } from '../src/ChatCompletionResponse';
import { Choice } from '../src/Choice';
import { Conversation } from '../src/Conversation';
import type { LLMClient } from '../src/LLMClient';
import { Message } from '../src/Message';
import { Role } from '../src/Role';
import { Tool } from '../src/Tool';
import { ToolCall } from '../src/ToolCall';
import { ToolRegistry } from '../src/ToolRegistry';
import { Usage } from '../src/Usage';

function makeResponse(message: Message, finishReason: string): ChatCompletionResponse {
  const usage = new Usage(0, 0, 0);
  return new ChatCompletionResponse('test-model', usage, [new Choice(0, message, finishReason)]);
}

class StubLLM implements LLMClient {
  public calls = 0;
  public streamCalls = 0;

  constructor(private responses: ChatCompletionResponse[]) {}

  async chatCompletion(): Promise<ChatCompletionResponse> {
    const response = this.responses[this.calls] ?? this.responses[this.responses.length - 1];
    this.calls++;
    return response;
  }

  async chatCompletionStream(
    _conversation: Conversation,
    _options: ChatCompletionOptions,
    onChunk: (chunk: ChatCompletionChunk) => void,
  ): Promise<ChatCompletionResponse> {
    this.streamCalls++;
    const response = await this.chatCompletion();
    const message = response.assistantMessage();
    if (message) {
      onChunk(
        new ChatCompletionChunk(0, message.content, message.reasoningContent, null, response.finishReason() ?? null),
      );
    }
    return response;
  }

  async tokenize(): Promise<number[]> {
    return [];
  }

  async contextSize(): Promise<number> {
    throw new Error('not implemented');
  }

  async embeddings(): Promise<any> {
    throw new Error('not implemented');
  }

  async rerank(): Promise<any> {
    throw new Error('not implemented');
  }
}

describe('Agent.runTurn', () => {
  test('returns a successful result when the assistant stops without tool calls', async () => {
    const finalMessage = new Message(Role.Assistant, 'Hello there.');
    const llm = new StubLLM([makeResponse(finalMessage, 'stop')]);
    const agent = new Agent(llm, new ToolRegistry());
    const conversation = new Conversation();

    const result = await agent.runTurn(conversation, new ChatCompletionOptions());

    expect(result.success).toBe(true);
    expect(result.message?.content).toBe('Hello there.');
    expect(result.toolRounds).toBe(0);
    expect(conversation.messages).toHaveLength(1);
    expect(llm.streamCalls).toBe(0);
  });

  test('executes a tool call round then returns the final assistant message', async () => {
    const toolCall = new ToolCall('call_1', 'echo', JSON.stringify({ text: 'hi' }));
    const assistantWithToolCall = new Message(Role.Assistant, '', null, {}, [toolCall]);
    const finalMessage = new Message(Role.Assistant, 'Done.');
    const llm = new StubLLM([makeResponse(assistantWithToolCall, 'tool_calls'), makeResponse(finalMessage, 'stop')]);

    const tools = new ToolRegistry(new Tool(
      { name: 'echo', description: '', parameters: {}, toApiShape: () => ({ type: 'function', function: { name: 'echo', description: '', parameters: {} } }) } as any,
      async (args: string) => `echo:${args}`,
    ));
    const agent = new Agent(llm, tools);
    const conversation = new Conversation();

    const result = await agent.runTurn(conversation, new ChatCompletionOptions());

    expect(result.success).toBe(true);
    expect(result.toolRounds).toBe(1);
    expect(conversation.messages).toHaveLength(3);
    expect(conversation.messages[1].role).toBe(Role.Tool);
    expect(conversation.messages[1].content).toBe(`echo:${JSON.stringify({ text: 'hi' })}`);
    expect(conversation.messages[1].toolCallId).toBe('call_1');
  });

  test('stops with an error once maxToolRounds is exceeded', async () => {
    const toolCall = new ToolCall('call_1', 'echo', '{}');
    const assistantWithToolCall = new Message(Role.Assistant, '', null, {}, [toolCall]);
    const llm = new StubLLM([makeResponse(assistantWithToolCall, 'tool_calls')]);

    const tools = new ToolRegistry(new Tool(
      { name: 'echo', description: '', parameters: {}, toApiShape: () => ({ type: 'function', function: { name: 'echo', description: '', parameters: {} } }) } as any,
      async () => 'ok',
    ));
    const agent = new Agent(llm, tools, 1);
    const conversation = new Conversation();

    let exceededPayload: unknown = null;
    agent.hooks.onMaxToolRoundsExceeded((payload) => {
      exceededPayload = payload;
    });

    const result = await agent.runTurn(conversation, new ChatCompletionOptions());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Max tool rounds (1) exceeded.');
    expect(result.toolRounds).toBe(1);
    expect(exceededPayload).not.toBeNull();
  });

  test('returns an error when finish reason is neither stop nor tool call driven length', async () => {
    const message = new Message(Role.Assistant, 'partial');
    const llm = new StubLLM([makeResponse(message, 'content_filter')]);
    const agent = new Agent(llm, new ToolRegistry());
    const conversation = new Conversation();

    const result = await agent.runTurn(conversation, new ChatCompletionOptions());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unexpected finish reason: content_filter.');
    expect(result.finishReason).toBe('content_filter');
  });

  test('treats a "length" finish reason without tool calls as a truncated success', async () => {
    const message = new Message(Role.Assistant, 'truncated output');
    const llm = new StubLLM([makeResponse(message, 'length')]);
    const agent = new Agent(llm, new ToolRegistry());
    const conversation = new Conversation();

    const result = await agent.runTurn(conversation, new ChatCompletionOptions());

    expect(result.success).toBe(true);
    expect(result.truncated()).toBe(true);
  });

  test('rejects options carrying a different tool registry than the agent', async () => {
    const llm = new StubLLM([makeResponse(new Message(Role.Assistant, 'x'), 'stop')]);
    const agent = new Agent(llm, new ToolRegistry());
    const conversation = new Conversation();
    const otherRegistry = new ToolRegistry();

    await expect(
      agent.runTurn(conversation, new ChatCompletionOptions(undefined, 0.7, 1, 1, otherRegistry)),
    ).rejects.toThrow('ChatCompletionOptions.tools must be the same registry as Agent.tools, or omitted.');
  });

  test('dispatches beforeTurn and afterTurn hooks around the turn', async () => {
    const llm = new StubLLM([makeResponse(new Message(Role.Assistant, 'hi'), 'stop')]);
    const hooks = new AgentHooks();
    const events: AgentHookEvent[] = [];
    hooks.beforeTurn(() => events.push(AgentHookEvent.BeforeTurn));
    hooks.afterTurn(() => events.push(AgentHookEvent.AfterTurn));

    const agent = new Agent(llm, new ToolRegistry(), 10, hooks);
    await agent.runTurn(new Conversation(), new ChatCompletionOptions());

    expect(events).toEqual([AgentHookEvent.BeforeTurn, AgentHookEvent.AfterTurn]);
  });

  test('allows a tool call replacement message via the beforeToolCall hook', async () => {
    const toolCall = new ToolCall('call_1', 'echo', '{}');
    const assistantWithToolCall = new Message(Role.Assistant, '', null, {}, [toolCall]);
    const finalMessage = new Message(Role.Assistant, 'Done.');
    const llm = new StubLLM([makeResponse(assistantWithToolCall, 'tool_calls'), makeResponse(finalMessage, 'stop')]);

    const tools = new ToolRegistry(new Tool(
      { name: 'echo', description: '', parameters: {}, toApiShape: () => ({ type: 'function', function: { name: 'echo', description: '', parameters: {} } }) } as any,
      async () => {
        throw new Error('should not be called');
      },
    ));
    const hooks = new AgentHooks();
    hooks.beforeToolCall((event) => {
      event.replacement = new Message(Role.Tool, 'replaced', null, {}, null, event.call.id);
    });

    const agent = new Agent(llm, tools, 10, hooks);
    const conversation = new Conversation();

    const result = await agent.runTurn(conversation, new ChatCompletionOptions());

    expect(result.success).toBe(true);
    expect(conversation.messages[1].content).toBe('replaced');
  });
});

describe('Agent.runTurnStream', () => {
  test('streams the assistant reply and does not call chatCompletion', async () => {
    const llm = new StubLLM([makeResponse(new Message(Role.Assistant, 'Hello there.'), 'stop')]);
    const agent = new Agent(llm, new ToolRegistry());
    const deltas: string[] = [];

    const result = await agent.runTurnStream(new Conversation(), new ChatCompletionOptions(), (chunk) => {
      deltas.push(chunk.delta);
    });

    expect(result.success).toBe(true);
    expect(result.message?.content).toBe('Hello there.');
    expect(llm.streamCalls).toBe(1);
    expect(llm.calls).toBe(1);
    expect(deltas).toEqual(['Hello there.']);
  });

  test('executes a tool call round over the stream then returns the final message', async () => {
    const toolCall = new ToolCall('call_1', 'echo', JSON.stringify({ text: 'hi' }));
    const assistantWithToolCall = new Message(Role.Assistant, '', null, {}, [toolCall]);
    const finalMessage = new Message(Role.Assistant, 'Done.');
    const llm = new StubLLM([makeResponse(assistantWithToolCall, 'tool_calls'), makeResponse(finalMessage, 'stop')]);

    const tools = new ToolRegistry(new Tool(
      { name: 'echo', description: '', parameters: {}, toApiShape: () => ({ type: 'function', function: { name: 'echo', description: '', parameters: {} } }) } as any,
      async (args: string) => `echo:${args}`,
    ));
    const agent = new Agent(llm, tools);
    const conversation = new Conversation();
    const deltas: string[] = [];

    const result = await agent.runTurnStream(conversation, new ChatCompletionOptions(), (chunk) => {
      deltas.push(chunk.delta);
    });

    expect(result.success).toBe(true);
    expect(result.toolRounds).toBe(1);
    expect(conversation.messages).toHaveLength(3);
    expect(llm.streamCalls).toBe(2);
    expect(deltas).toEqual(['', 'Done.']);
  });
});

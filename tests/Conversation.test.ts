import { describe, expect, test } from 'bun:test';
import { Conversation } from '../src/Conversation';
import type { Logger } from '../src/Logger';
import { Message } from '../src/Message';
import { Role } from '../src/Role';
import { ToolCall } from '../src/ToolCall';

class FakeLogger implements Logger {
  public filename = 'fake';
  public saved: Conversation[] = [];

  saveConversation(conversation: Conversation): void {
    this.saved.push(conversation);
  }
}

describe('Conversation', () => {
  test('starts empty with no logger by default', () => {
    const conversation = new Conversation();

    expect(conversation.messages).toEqual([]);
    expect(conversation.logger).toBeNull();
  });

  test('addMessage appends to messages in order', () => {
    const conversation = new Conversation();
    const first = new Message(Role.User, 'hi');
    const second = new Message(Role.Assistant, 'hello');

    conversation.addMessage(first);
    conversation.addMessage(second);

    expect(conversation.messages).toEqual([first, second]);
  });

  test('addMessage notifies the logger with itself after each append', () => {
    const logger = new FakeLogger();
    const conversation = new Conversation([], logger);

    conversation.addMessage(new Message(Role.User, 'hi'));

    expect(logger.saved).toHaveLength(1);
    expect(logger.saved[0]).toBe(conversation);
    expect(logger.saved[0].messages).toHaveLength(1);
  });

  test('addMessage does not throw when no logger is set', () => {
    const conversation = new Conversation();

    expect(() => conversation.addMessage(new Message(Role.User, 'hi'))).not.toThrow();
  });

  test('toChatCompletionPayload maps every message via toChatCompletionPayload', () => {
    const toolCall = new ToolCall('call_1', 'echo', '{}');
    const conversation = new Conversation([
      new Message(Role.User, 'hi'),
      new Message(Role.Assistant, '', null, {}, [toolCall]),
      new Message(Role.Tool, 'result', null, {}, null, 'call_1'),
    ]);

    expect(conversation.toChatCompletionPayload()).toEqual([
      { role: Role.User, content: 'hi' },
      { role: Role.Assistant, content: null, tool_calls: [toolCall.toApiShape()] },
      { role: Role.Tool, content: 'result', tool_call_id: 'call_1' },
    ]);
  });

  test('toChatCompletionPayload strips Harmony channel markers from assistant content', () => {
    const conversation = new Conversation([
      new Message(Role.Assistant, '<|channel|>analysis<|message|>thinking<|end|><|start|>assistant<|channel|>final<|message|>answer'),
    ]);

    expect(conversation.toChatCompletionPayload()).toEqual([{ role: Role.Assistant, content: 'answer' }]);
  });

  test('toJSON maps every message via toJSON and preserves reasoning/meta', () => {
    const message = Message.withCreatedAt(Role.Assistant, 'answer', 'because', new Date('2024-01-01T00:00:00.000Z'));
    const conversation = new Conversation([message]);

    expect(conversation.toJSON()).toEqual({
      messages: [
        {
          role: Role.Assistant,
          content: 'answer',
          reasoning_content: 'because',
          meta: { created_at: '2024-01-01T00:00:00.000Z' },
        },
      ],
    });
  });

  test('JSON.stringify uses toJSON to serialize the conversation', () => {
    const conversation = new Conversation([new Message(Role.User, 'hi')]);

    expect(JSON.parse(JSON.stringify(conversation))).toEqual({
      messages: [{ role: Role.User, content: 'hi' }],
    });
  });
});

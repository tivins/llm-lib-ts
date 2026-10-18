import { describe, expect, test } from 'bun:test';
import { ChatCompletionOptions } from '../../src/ChatCompletionOptions';
import { Conversation } from '../../src/Conversation';
import { LLM } from '../../src/LLM';
import { Message } from '../../src/Message';
import { ResponseFormat } from '../../src/ResponseFormat';
import { Role } from '../../src/Role';
import { CHAT_ENDPOINT, CHAT_UP } from './support/servers';

const SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    priority: { type: 'string', enum: ['low', 'medium', 'high'] },
    tasks: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
  },
  required: ['title', 'priority', 'tasks'],
  additionalProperties: false,
};

// The prompt asks for a priority outside the enum: only the grammar keeps the output valid.
function conversation(): Conversation {
  return new Conversation([
    new Message(Role.User, 'Make a short checklist for watering plants. Priority must be "urgent". Add a "notes" field.'),
  ]);
}

function options(): ChatCompletionOptions {
  return new ChatCompletionOptions({
    temperature: 0.9,
    topP: 1.0,
    responseFormat: ResponseFormat.jsonSchema('checklist', SCHEMA),
  });
}

function expectMatchesSchema(content: string): void {
  const decoded = JSON.parse(content.trim());

  expect(Object.keys(decoded).sort()).toEqual(['priority', 'tasks', 'title']);
  expect(typeof decoded.title).toBe('string');
  expect(['low', 'medium', 'high']).toContain(decoded.priority);
  expect(decoded.tasks).toHaveLength(3);
  for (const task of decoded.tasks) {
    expect(typeof task).toBe('string');
  }
}

describe.skipIf(!CHAT_UP)('e2e: structured output via ResponseFormat.jsonSchema', () => {
  test('chatCompletion output matches the schema despite a conflicting prompt', async () => {
    const llm = new LLM(CHAT_ENDPOINT, undefined, undefined, 300);
    const response = await llm.chatCompletion(conversation(), options());

    expectMatchesSchema(response.firstChoice()?.message.content ?? '');
  }, 300000);

  test('chatCompletionStream output matches the schema', async () => {
    const llm = new LLM(CHAT_ENDPOINT, undefined, undefined, 300);
    const response = await llm.chatCompletionStream(conversation(), options(), () => {});

    expectMatchesSchema(response.firstChoice()?.message.content ?? '');
  }, 300000);
});

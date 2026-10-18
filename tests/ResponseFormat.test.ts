import { describe, expect, test } from 'bun:test';
import { ChatCompletionOptions } from '../src/ChatCompletionOptions';
import { ResponseFormat } from '../src/ResponseFormat';

const SCHEMA = {
  type: 'object',
  properties: { color: { type: 'string', enum: ['red', 'blue'] } },
  required: ['color'],
  additionalProperties: false,
};

function optionsWith(responseFormat?: string | ResponseFormat): ChatCompletionOptions {
  return new ChatCompletionOptions({ responseFormat });
}

describe('ResponseFormat', () => {
  test('text and jsonObject map to { type }', () => {
    expect(ResponseFormat.text().toApiShape()).toEqual({ type: 'text' });
    expect(ResponseFormat.jsonObject().toApiShape()).toEqual({ type: 'json_object' });
  });

  test('jsonSchema maps to the OpenAI json_schema shape, strict by default', () => {
    expect(ResponseFormat.jsonSchema('color_pick', SCHEMA).toApiShape()).toEqual({
      type: 'json_schema',
      json_schema: { name: 'color_pick', schema: SCHEMA, strict: true },
    });
    expect(ResponseFormat.jsonSchema('color_pick', SCHEMA, false).toApiShape()).toEqual({
      type: 'json_schema',
      json_schema: { name: 'color_pick', schema: SCHEMA, strict: false },
    });
  });
});

describe('ChatCompletionOptions.responseFormat', () => {
  test('is omitted from the payload when unset', () => {
    expect(optionsWith().toRequestPayload()).not.toHaveProperty('response_format');
  });

  test('a plain string is still sent as { type }', () => {
    expect(optionsWith('json_object').toRequestPayload().response_format).toEqual({ type: 'json_object' });
  });

  test('a ResponseFormat is sent through toApiShape()', () => {
    expect(optionsWith(ResponseFormat.jsonObject()).toRequestPayload().response_format).toEqual({
      type: 'json_object',
    });
    expect(optionsWith(ResponseFormat.jsonSchema('color_pick', SCHEMA)).toRequestPayload().response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'color_pick', schema: SCHEMA, strict: true },
    });
  });

  test('clone() keeps the response format', () => {
    const format = ResponseFormat.jsonSchema('color_pick', SCHEMA);
    const clone = optionsWith(format).clone();

    expect(clone.responseFormat).toBe(format);
    expect(clone.toRequestPayload().response_format).toEqual(format.toApiShape());
  });
});

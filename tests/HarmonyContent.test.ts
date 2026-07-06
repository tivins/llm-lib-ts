import { describe, expect, test } from 'bun:test';
import { parse, stripTokens, tryParseServerError } from '../src/HarmonyContent';

describe('HarmonyContent', () => {
  test('parse extracts analysis and final channels', () => {
    const raw =
      '<|channel|>analysis<|message|>User asks for help.<|end|>' +
      '<|start|>assistant<|channel|>final<|message|>Here is the answer.<|return|>';

    expect(parse(raw)).toEqual({
      content: 'Here is the answer.',
      reasoning: 'User asks for help.',
    });
  });

  test('parse returns original text when no channel markers', () => {
    expect(parse('Plain assistant reply.')).toEqual({
      content: 'Plain assistant reply.',
      reasoning: null,
    });
  });

  test('tryParseServerError extracts embedded assistant text', () => {
    const error =
      'Failed to parse input at pos 13: <|channel|>analysis<|message|>thinking<|end|>' +
      '<|start|>assistant<|channel|>final<|message|>visible answer<|return|>';

    expect(tryParseServerError(error)).toEqual({
      content: 'visible answer',
      reasoning: 'thinking',
    });
  });

  test('tryParseServerError returns null for unrelated errors', () => {
    expect(tryParseServerError('Connection refused')).toBeNull();
  });

  test('stripTokens removes harmony markers', () => {
    const raw = '<|start|>assistant<|channel|>final<|message|>Hello<|return|>';
    expect(stripTokens(raw)).toBe('Hello');
  });

  test('parse extracts thought json after timestamped channel marker', () => {
    const raw =
      '<|channel>2024-10-11T16:40:54.384Z\n' + '{\n' + '  "thought": "markdown content in json."}Le début de la réponse';

    expect(parse(raw)).toEqual({
      content: 'Le début de la réponse',
      reasoning: 'markdown content in json.',
    });
  });

  test('parse preserves standard harmony when channel name is present', () => {
    const raw =
      '<|channel|>analysis<|message|>CoT<|end|>' +
      '<|start|>assistant<|channel|>final<|message|>Answer<|return|>';

    expect(parse(raw)).toEqual({
      content: 'Answer',
      reasoning: 'CoT',
    });
  });
});

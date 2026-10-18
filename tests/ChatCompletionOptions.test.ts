import { describe, expect, test } from 'bun:test';
import { ChatCompletionOptions } from '../src/ChatCompletionOptions';
import { ToolRegistry } from '../src/ToolRegistry';

describe('ChatCompletionOptions', () => {
  test('defaults apply when no init is given', () => {
    const options = new ChatCompletionOptions();

    expect(options.toRequestPayload()).toEqual({ temperature: 0.7, top_p: 1.0, n: 1 });
  });

  test('init sets only the given fields', () => {
    const options = new ChatCompletionOptions({ temperature: 0.2, model: 'my-model' });

    expect(options.toRequestPayload()).toEqual({ temperature: 0.2, top_p: 1.0, n: 1, model: 'my-model' });
  });

  test('seed is sent only when set', () => {
    expect(new ChatCompletionOptions({ seed: 42 }).toRequestPayload()).toEqual({
      temperature: 0.7, top_p: 1.0, n: 1, seed: 42,
    });
    expect(new ChatCompletionOptions({ seed: 0 }).toRequestPayload().seed).toBe(0);
    expect('seed' in new ChatCompletionOptions().toRequestPayload()).toBe(false);
  });

  test('an explicit undefined falls back to the default', () => {
    const options = new ChatCompletionOptions({ temperature: undefined, n: undefined });

    expect(options.temperature).toBe(0.7);
    expect(options.n).toBe(1);
  });

  test('clone() copies every field into a distinct object', () => {
    const tools = new ToolRegistry();
    const signal = new AbortController().signal;
    const options = new ChatCompletionOptions({
      model: 'm',
      temperature: 0.1,
      topP: 0.5,
      n: 2,
      seed: 7,
      tools,
      toolChoice: 'auto',
      responseFormat: 'json_object',
      signal,
    });

    const clone = options.clone();

    expect(clone).not.toBe(options);
    expect(clone).toEqual(options);
    expect(clone.tools).toBe(tools);
    expect(clone.signal).toBe(signal);
  });
});

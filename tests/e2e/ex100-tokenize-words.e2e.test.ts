import { describe, expect, test } from 'bun:test';
import { LLM } from '../../src/LLM';
import { CHAT_ENDPOINT, CHAT_UP } from './support/servers';

describe.skipIf(!CHAT_UP)('e2e: word-level tokenize verdicts', () => {
  test('identical spelling tokenizes identically', async () => {
    const llm = new LLM(CHAT_ENDPOINT, undefined, undefined, 60);

    const left = await llm.tokenize('house');
    const right = await llm.tokenize('house');

    expect(left).toEqual(right);
  }, 30000);

  test('synonyms with unrelated spellings rarely share any token id', async () => {
    const llm = new LLM(CHAT_ENDPOINT, undefined, undefined, 60);

    const fast = await llm.tokenize('fast');
    const quick = await llm.tokenize('quick');

    const shared = fast.filter((token) => quick.includes(token));
    expect(shared.length).toBe(0);
  }, 30000);
});

import { describe, expect, test } from 'bun:test';
import { LLM } from '../../src/LLM';
import { CHAT_ENDPOINT, CHAT_UP } from './support/servers';

function sharedPrefixLength(left: number[], right: number[]): number {
  const limit = Math.min(left.length, right.length);
  let shared = 0;
  for (let i = 0; i < limit; i++) {
    if (left[i] !== right[i]) break;
    shared++;
  }
  return shared;
}

describe.skipIf(!CHAT_UP)('e2e: tokenize similar vs dissimilar phrases', () => {
  test('near-duplicate sentences share a longer token prefix than unrelated ones', async () => {
    const llm = new LLM(CHAT_ENDPOINT, undefined, undefined, 60);

    const greeting = await llm.tokenize('Hello, how are you?');
    const greetingVariant = await llm.tokenize('Hello, how are you');
    const deploy = await llm.tokenize('Deploy the staging environment before Friday.');

    expect(greeting.length).toBeGreaterThan(0);
    expect(greetingVariant.length).toBeGreaterThan(0);
    expect(deploy.length).toBeGreaterThan(0);

    const similarPrefix = sharedPrefixLength(greeting, greetingVariant);
    const dissimilarPrefix = sharedPrefixLength(greeting, deploy);

    expect(similarPrefix).toBeGreaterThan(dissimilarPrefix);
  }, 30000);
});

import { describe, expect, test } from 'bun:test';
import { EmbeddingOptions } from '../../src/EmbeddingOptions';
import { LLM } from '../../src/LLM';
import { EMBED_ENDPOINT, EMBED_UP } from './support/servers';

function cosineSimilarity(left: number[], right: number[]): number {
  let dot = 0;
  let normLeft = 0;
  let normRight = 0;
  for (let i = 0; i < left.length; i++) {
    const other = right[i] ?? 0;
    dot += left[i] * other;
    normLeft += left[i] * left[i];
    normRight += other * other;
  }
  if (normLeft === 0 || normRight === 0) return 0;
  return dot / (Math.sqrt(normLeft) * Math.sqrt(normRight));
}

describe.skipIf(!EMBED_UP)('e2e: embeddings via POST /v1/embeddings', () => {
  test('related sentences are more similar than unrelated ones', async () => {
    const llm = new LLM(EMBED_ENDPOINT, undefined, 'bge-m3-Q8_0.gguf', 120);

    const texts = [
      'The cat sits on the mat.',
      'A feline rests on a rug.',
      'Stock markets rallied after the earnings report.',
    ];

    const response = await llm.embeddings(texts, new EmbeddingOptions(undefined, 'float'));
    expect(response.embeddings).toHaveLength(3);

    const vectors = response.vectors();
    const related = cosineSimilarity(vectors[0], vectors[1]);
    const unrelated = cosineSimilarity(vectors[0], vectors[2]);

    expect(related).toBeGreaterThan(unrelated);
  }, 60000);
});

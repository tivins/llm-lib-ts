import { describe, expect, test } from 'bun:test';
import { LLM } from '../../src/LLM';
import { RerankOptions } from '../../src/RerankOptions';
import { RERANK_ENDPOINT, RERANK_UP } from './support/servers';

describe.skipIf(!RERANK_UP)('e2e: rerank via POST /v1/rerank', () => {
  test('ranks the panda documents above the unrelated ones', async () => {
    const llm = new LLM(RERANK_ENDPOINT, undefined, 'Qwen3-Reranker-4B-Q4_K_M.gguf', 120);

    const query = 'What is a giant panda?';
    const documents = [
      'The giant panda (Ailuropoda melanoleuca) is a bear endemic to China, known for its black-and-white coat and bamboo diet.',
      'Corporate earnings beat expectations and stock markets rallied in late trading.',
      'Pandas spend most of their day eating bamboo and resting in mountain forests.',
      'Quantum computing uses qubits that can exist in superposition.',
    ];

    const response = await llm.rerank(query, documents, new RerankOptions(undefined, 3));
    const ranked = response.rankedDocuments(documents);

    expect(ranked).toHaveLength(3);
    expect(ranked[0].document).toContain('giant panda');
    expect(ranked.map((item) => item.document)).not.toContain(documents[3]);
  }, 60000);
});

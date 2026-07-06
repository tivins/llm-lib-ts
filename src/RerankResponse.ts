import type { RerankResult } from './RerankResult';
import type { Usage } from './Usage';

export interface RankedDocument {
  index: number;
  document: string;
  relevanceScore: number;
}

/** Parsed response from a rerank API call. */
export class RerankResponse {
  constructor(
    public model: string,
    public usage: Usage,
    public results: RerankResult[],
    private rawData: Record<string, unknown> | null = null,
    public duration: number | null = null,
  ) {}

  raw(): Record<string, unknown> | null {
    return this.rawData;
  }

  /** Results sorted by relevance score, highest first. */
  sortedResults(): RerankResult[] {
    return [...this.results].sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /** Map ranked results back to the original document strings. */
  rankedDocuments(documents: string[]): RankedDocument[] {
    const ranked: RankedDocument[] = [];
    for (const result of this.sortedResults()) {
      const document = documents[result.index];
      if (document === undefined) {
        continue;
      }
      ranked.push({ index: result.index, document, relevanceScore: result.relevanceScore });
    }

    return ranked;
  }
}

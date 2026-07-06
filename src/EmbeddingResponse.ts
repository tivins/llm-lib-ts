import type { Embedding } from './Embedding';
import type { Usage } from './Usage';

/** Parsed response from an embeddings API call. */
export class EmbeddingResponse {
  constructor(
    public model: string,
    public usage: Usage,
    public embeddings: Embedding[],
    private rawData: Record<string, unknown> | null = null,
    public duration: number | null = null,
  ) {}

  raw(): Record<string, unknown> | null {
    return this.rawData;
  }

  first(): Embedding | undefined {
    return this.embeddings[0];
  }

  vectors(): number[][] {
    return this.embeddings.map((embedding) => embedding.vector);
  }
}

/** A single embedding vector returned by the embeddings API. */
export class Embedding {
  constructor(
    public index: number,
    public vector: number[],
  ) {}
}

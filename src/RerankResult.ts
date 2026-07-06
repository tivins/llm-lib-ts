/** A single rerank score for one document index. */
export class RerankResult {
  constructor(
    public index: number,
    public relevanceScore: number,
  ) {}
}

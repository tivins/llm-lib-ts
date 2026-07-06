/** Request parameters for a rerank API call (model, top_n). */
export class RerankOptions {
  constructor(
    public model?: string,
    public topN?: number,
  ) {}

  toRequestPayload(defaultModel?: string): Record<string, unknown> {
    const body: Record<string, unknown> = {};

    const model = this.model ?? defaultModel;
    if (model !== undefined) {
      body.model = model;
    }
    if (this.topN !== undefined) {
      body.top_n = this.topN;
    }

    return body;
  }
}

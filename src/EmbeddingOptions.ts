/** Request parameters for an embeddings API call (model, encoding, dimensions). */
export class EmbeddingOptions {
  constructor(
    public model?: string,
    public encodingFormat?: string,
    public dimensions?: number,
  ) {}

  toRequestPayload(defaultModel?: string): Record<string, unknown> {
    const body: Record<string, unknown> = {};

    const model = this.model ?? defaultModel;
    if (model !== undefined) {
      body.model = model;
    }
    if (this.encodingFormat !== undefined) {
      body.encoding_format = this.encodingFormat;
    }
    if (this.dimensions !== undefined) {
      body.dimensions = this.dimensions;
    }

    return body;
  }
}

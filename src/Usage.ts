export interface UsageApiShape {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  completion_tokens_details?: { reasoning_tokens?: number };
}

/** Token usage statistics from an LLM API response. */
export class Usage {
  constructor(
    public promptTokens: number,
    public completionTokens: number,
    public totalTokens: number,
    /** Part of `completionTokens` spent reasoning; `null` when unknown (no reasoning, or not reported). */
    public reasoningTokens: number | null = null,
  ) {}

  /** Reads an OpenAI-style `usage` object; missing counts become 0. */
  static fromApiShape(raw: Record<string, any> | null | undefined): Usage {
    const reasoning = raw?.completion_tokens_details?.reasoning_tokens;
    return new Usage(
      raw?.prompt_tokens ?? 0,
      raw?.completion_tokens ?? 0,
      raw?.total_tokens ?? 0,
      typeof reasoning === 'number' ? reasoning : null,
    );
  }

  toJSON(): UsageApiShape {
    const shape: UsageApiShape = {
      prompt_tokens: this.promptTokens,
      completion_tokens: this.completionTokens,
      total_tokens: this.totalTokens,
    };
    if (this.reasoningTokens !== null) {
      shape.completion_tokens_details = { reasoning_tokens: this.reasoningTokens };
    }
    return shape;
  }
}

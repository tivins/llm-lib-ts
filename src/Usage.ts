export interface UsageApiShape {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/** Token usage statistics from an LLM API response. */
export class Usage {
  constructor(
    public promptTokens: number,
    public completionTokens: number,
    public totalTokens: number,
  ) {}

  toJSON(): UsageApiShape {
    return {
      prompt_tokens: this.promptTokens,
      completion_tokens: this.completionTokens,
      total_tokens: this.totalTokens,
    };
  }
}

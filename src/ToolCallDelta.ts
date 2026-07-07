/** One fragment of a tool call as it is streamed incrementally by the API. */
export class ToolCallDelta {
  constructor(
    public index: number,
    public id: string | null,
    public name: string | null,
    public argumentsJson: string | null,
  ) {}

  static fromApiShape(data: {
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }): ToolCallDelta {
    return new ToolCallDelta(data.index, data.id ?? null, data.function?.name ?? null, data.function?.arguments ?? null);
  }
}

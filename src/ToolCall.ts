export interface ToolCallApiShape {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** Represents a function tool invocation requested by the assistant. */
export class ToolCall {
  constructor(
    public id: string,
    public name: string,
    public argumentsJson: string,
  ) {}

  static fromApiShape(data: { id: string; function: { name: string; arguments: string } }): ToolCall {
    return new ToolCall(data.id, data.function.name, data.function.arguments);
  }

  toApiShape(): ToolCallApiShape {
    return {
      id: this.id,
      type: 'function',
      function: {
        name: this.name,
        arguments: this.argumentsJson,
      },
    };
  }
}

export type JsonSchema = Record<string, unknown>;

export interface ToolSchemaApiShape {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
}

/** JSON-schema description of a callable tool sent to the LLM. */
export class ToolSchema {
  constructor(
    public name: string,
    public description: string,
    public parameters: JsonSchema,
  ) {}

  toApiShape(): ToolSchemaApiShape {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}

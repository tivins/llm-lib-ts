import type { JsonSchema } from './ToolSchema';

export type ResponseFormatType = 'text' | 'json_object' | 'json_schema';

/**
 * Output format requested from the model (`response_format`).
 * With `jsonSchema`, llama-server compiles the schema into a grammar, so the output matches it by construction.
 */
export class ResponseFormat {
  private constructor(
    public readonly type: ResponseFormatType,
    public readonly name: string | null = null,
    public readonly schema: JsonSchema | null = null,
    public readonly strict: boolean = true,
  ) {}

  static text(): ResponseFormat {
    return new ResponseFormat('text');
  }

  /** Any JSON object (llama-server constrains the output to `{ "type": "object" }`). */
  static jsonObject(): ResponseFormat {
    return new ResponseFormat('json_object');
  }

  /** `name` is ignored by llama-server but required by OpenAI-compatible providers. */
  static jsonSchema(name: string, schema: JsonSchema, strict: boolean = true): ResponseFormat {
    return new ResponseFormat('json_schema', name, schema, strict);
  }

  toApiShape(): Record<string, unknown> {
    if (this.type === 'json_schema') {
      return {
        type: 'json_schema',
        json_schema: { name: this.name, schema: this.schema, strict: this.strict },
      };
    }

    return { type: this.type };
  }
}

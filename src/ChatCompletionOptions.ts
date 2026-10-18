import { ResponseFormat } from './ResponseFormat';
import type { ToolRegistry } from './ToolRegistry';

/** Fields accepted by the `ChatCompletionOptions` constructor; omitted ones take their default. */
export interface ChatCompletionOptionsInit {
  /** Falls back to the client's default model. */
  model?: string;
  /** Default 0.7. */
  temperature?: number;
  /** Default 1.0. */
  topP?: number;
  /** Default 1. */
  n?: number;
  tools?: ToolRegistry;
  toolChoice?: string;
  /** A plain string is sent as `{ type }`; use `ResponseFormat.jsonSchema()` to constrain the output to a schema. */
  responseFormat?: string | ResponseFormat;
  signal?: AbortSignal;
}

/** Request parameters for a chat completion (model, sampling, tools, format). */
export class ChatCompletionOptions {
  model?: string;
  temperature: number;
  topP: number;
  n: number;
  tools?: ToolRegistry;
  toolChoice?: string;
  /** A plain string is sent as `{ type }`; use `ResponseFormat.jsonSchema()` to constrain the output to a schema. */
  responseFormat?: string | ResponseFormat;
  signal?: AbortSignal;

  constructor(init: ChatCompletionOptionsInit = {}) {
    this.model = init.model;
    this.temperature = init.temperature ?? 0.7;
    this.topP = init.topP ?? 1.0;
    this.n = init.n ?? 1;
    this.tools = init.tools;
    this.toolChoice = init.toolChoice;
    this.responseFormat = init.responseFormat;
    this.signal = init.signal;
  }

  clone(): ChatCompletionOptions {
    return new ChatCompletionOptions({ ...this });
  }

  toRequestPayload(defaultModel?: string): Record<string, unknown> {
    const body: Record<string, unknown> = {
      temperature: this.temperature,
      top_p: this.topP,
      n: this.n,
    };

    const model = this.model ?? defaultModel;
    if (model !== undefined) {
      body.model = model;
    }

    if (this.tools && this.tools.all().length > 0) {
      body.tools = this.tools.toRequestPayload();
      if (this.toolChoice !== undefined) {
        body.tool_choice = this.toolChoice;
      }
    }

    if (this.responseFormat !== undefined) {
      body.response_format =
        this.responseFormat instanceof ResponseFormat
          ? this.responseFormat.toApiShape()
          : { type: this.responseFormat };
    }

    return body;
  }
}

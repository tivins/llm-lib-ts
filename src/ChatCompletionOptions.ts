import type { ToolRegistry } from './ToolRegistry';

/** Request parameters for a chat completion (model, sampling, tools, format). */
export class ChatCompletionOptions {
  constructor(
    public model?: string,
    public temperature: number = 0.7,
    public topP: number = 1.0,
    public n: number = 1,
    public tools?: ToolRegistry,
    public toolChoice?: string,
    public responseFormat?: string,
  ) {}

  clone(): ChatCompletionOptions {
    return new ChatCompletionOptions(
      this.model,
      this.temperature,
      this.topP,
      this.n,
      this.tools,
      this.toolChoice,
      this.responseFormat,
    );
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
      body.response_format = { type: this.responseFormat };
    }

    return body;
  }
}

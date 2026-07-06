import { Message } from './Message';
import { Role } from './Role';
import type { Choice } from './Choice';
import type { Usage } from './Usage';

/** Parsed response from a chat completion API call. */
export class ChatCompletionResponse {
  constructor(
    public model: string,
    public usage: Usage,
    public choices: Choice[],
    private rawData: Record<string, unknown> | null = null,
    public duration: number | null = null,
  ) {}

  raw(): Record<string, unknown> | null {
    return this.rawData;
  }

  firstChoice(): Choice | undefined {
    return this.choices[0];
  }

  finishReason(): string | undefined {
    return this.firstChoice()?.finishReason;
  }

  assistantMessage(): Message | null {
    const message = this.firstChoice()?.message;
    return message?.role === Role.Assistant ? message : null;
  }

  hasToolCalls(): boolean {
    const calls = this.assistantMessage()?.toolCalls;
    return !!calls && calls.length > 0;
  }

  toStoredMessage(at: Date = new Date()): Message | null {
    const assistant = this.assistantMessage();
    if (!assistant) {
      return null;
    }

    const meta: Record<string, unknown> = {
      created_at: at.toISOString(),
      time_ms: this.duration ?? 0,
      model: this.model,
      usage: this.usage.toJSON(),
    };
    const finishReason = this.finishReason();
    if (finishReason !== undefined) {
      meta.finish_reason = finishReason;
    }

    return new Message(assistant.role, assistant.content, assistant.reasoningContent, meta, assistant.toolCalls);
  }
}

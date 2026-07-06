import type { Logger } from './Logger';
import { Message } from './Message';

/** Holds the ordered list of messages in an LLM chat session. */
export class Conversation {
  constructor(
    public messages: Message[] = [],
    public logger: Logger | null = null,
  ) {}

  addMessage(message: Message): void {
    this.messages.push(message);
    this.logger?.saveConversation(this);
  }

  toChatCompletionPayload(): Record<string, unknown>[] {
    return this.messages.map((message) => message.toChatCompletionPayload());
  }

  toJSON(): { messages: Record<string, unknown>[] } {
    return { messages: this.messages.map((message) => message.toJSON()) };
  }
}

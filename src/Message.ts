import type { Attachment } from './Attachment';
import { Role } from './Role';
import type { ToolCall } from './ToolCall';
import * as HarmonyContent from './HarmonyContent';

/** A single chat message with role, content, metadata, optional tool calls, and optional media attachments. */
export class Message {
  constructor(
    public role: Role,
    public content: string,
    public reasoningContent: string | null = null,
    public meta: Record<string, unknown> = {},
    public toolCalls: ToolCall[] | null = null,
    public toolCallId: string | null = null,
    public attachments: Attachment[] = [],
  ) {}

  /** User message with optional image/video attachments. */
  static user(content: string, attachments: Attachment[] = []): Message {
    return new Message(Role.User, content, null, {}, null, null, attachments);
  }

  /** Shortcut for system prompt message */
  static system(content: string): Message {
      return new Message(Role.System, content);
  }

  static withCreatedAt(
    role: Role,
    content: string,
    reasoningContent: string | null = null,
    at: Date = new Date(),
  ): Message {
    return new Message(role, content, reasoningContent, {
      created_at: at.toISOString(),
    });
  }

  toJSON(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      role: this.role,
      content: this.content,
    };
    if (this.reasoningContent !== null) {
      payload.reasoning_content = this.reasoningContent;
    }
    if (this.toolCalls && this.toolCalls.length > 0) {
      payload.tool_calls = this.toolCalls.map((call) => call.toApiShape());
    }
    if (this.toolCallId !== null) {
      payload.tool_call_id = this.toolCallId;
    }
    if (this.attachments.length > 0) {
      payload.attachments = this.attachments.map((attachment) => attachment.toJSON());
    }
    if (Object.keys(this.meta).length > 0) {
      payload.meta = this.meta;
    }

    return payload;
  }

  toChatCompletionPayload(): Record<string, unknown> {
    let content = this.content;
    if (this.role === Role.Assistant && HarmonyContent.containsChannelMarkers(content)) {
      content = HarmonyContent.parse(content).content;
    }

    const payload: Record<string, unknown> = {
      role: this.role,
      content: this.attachments.length > 0 ? this.toContentParts(content) : content === '' ? null : content,
    };
    // reasoning_content is intentionally omitted here: it is internal chain-of-thought
    // produced by the model and must not be re-injected into subsequent requests
    // (it would bloat the context window without benefit). It is preserved in toJSON()
    // for logging purposes only.
    if (this.toolCalls && this.toolCalls.length > 0) {
      payload.tool_calls = this.toolCalls.map((call) => call.toApiShape());
    }
    if (this.toolCallId !== null) {
      payload.tool_call_id = this.toolCallId;
    }

    return payload;
  }

  private toContentParts(text: string): Record<string, unknown>[] {
    const parts: Record<string, unknown>[] = [];
    if (text !== '') {
      parts.push({ type: 'text', text });
    }
    for (const attachment of this.attachments) {
      parts.push(attachment.toContentPart());
    }

    return parts;
  }
}

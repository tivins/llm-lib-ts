import { Message } from './Message';
import { Role } from './Role';
import type { Tool, ToolHandler } from './Tool';
import type { ToolCall } from './ToolCall';
import type { ToolSchema, ToolSchemaApiShape } from './ToolSchema';

/** Collection of registered tools and their handlers, exposed to the LLM and executed by the agent. */
export class ToolRegistry {
  private schemas = new Map<string, ToolSchema>();
  private handlers = new Map<string, ToolHandler>();

  constructor(...tools: Tool[]) {
    this.registerTools(...tools);
  }

  registerTools(...tools: Tool[]): void {
    for (const tool of tools) {
      if (this.schemas.has(tool.schema.name)) {
        throw new Error(`ToolRegistry: tool '${tool.schema.name}' is already registered.`);
      }
      this.schemas.set(tool.schema.name, tool.schema);
      this.handlers.set(tool.schema.name, tool.handler);
    }
  }

  all(): ToolSchema[] {
    return [...this.schemas.values()];
  }

  has(name: string): boolean {
    return this.schemas.has(name);
  }

  toRequestPayload(): ToolSchemaApiShape[] {
    return this.all().map((schema) => schema.toApiShape());
  }

  async execute(call: ToolCall): Promise<Message> {
    const handler = this.handlers.get(call.name);
    if (!handler) {
      return new Message(Role.Tool, JSON.stringify({ error: `No handler for tool: ${call.name}` }), null, {}, null, call.id);
    }

    try {
      const content = await handler(call.argumentsJson);
      return new Message(Role.Tool, content, null, {}, null, call.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return new Message(Role.Tool, JSON.stringify({ error: message }), null, {}, null, call.id);
    }
  }

  async executeAll(calls: ToolCall[]): Promise<Message[]> {
    return Promise.all(calls.map((call) => this.execute(call)));
  }
}

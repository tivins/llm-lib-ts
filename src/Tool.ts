import type { ToolSchema } from './ToolSchema';

export type ToolHandler = (args: string) => string | Promise<string>;

/** Pairs a tool schema with its callable handler for agent execution. */
export class Tool {
  constructor(
    public schema: ToolSchema,
    public handler: ToolHandler,
  ) {}
}

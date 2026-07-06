import type { Message } from './Message';

/** Outcome of a single agent turn, including the assistant message and any error. */
export class AgentTurnResult {
  constructor(
    public message: Message | null,
    public success: boolean,
    public error: string | null = null,
    public toolRounds: number = 0,
    public finishReason: string | null = null,
  ) {}

  /** True when the turn stopped because of `finish_reason: length` (truncated response). */
  truncated(): boolean {
    return this.finishReason === 'length';
  }
}

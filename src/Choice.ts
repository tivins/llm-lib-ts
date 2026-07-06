import type { Message } from './Message';

/** One completion choice returned by the LLM API. */
export class Choice {
  constructor(
    public index: number,
    public message: Message,
    public finishReason: string,
  ) {}
}

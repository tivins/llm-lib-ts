import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Conversation } from './Conversation';

/** Persists conversation history to a JSON file on disk. */
export class Logger {
  constructor(public filename: string) {
    const dir = dirname(filename);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  saveConversation(conversation: Conversation): void {
    writeFileSync(this.filename, JSON.stringify(conversation, null, 2) + '\n', 'utf8');
  }
}

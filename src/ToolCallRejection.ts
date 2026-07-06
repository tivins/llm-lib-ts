import { Message } from './Message';
import { Role } from './Role';
import type { ToolCall } from './ToolCall';

/** Builds standard tool messages for skipped tool execution (e.g. user rejection). */
export const USER_REJECTED_CODE = 'user_rejected';
export const DEFAULT_USER_REJECTED_MESSAGE = 'Action rejected by the user';

export function userRejectedToolCall(call: ToolCall, reason?: string): Message {
  return new Message(
    Role.Tool,
    JSON.stringify({ error: reason ?? DEFAULT_USER_REJECTED_MESSAGE, code: USER_REJECTED_CODE }),
    null,
    {},
    null,
    call.id,
  );
}

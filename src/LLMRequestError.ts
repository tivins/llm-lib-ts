/** Maximum length of `metadata.raw` copied into `.message`; the full value stays in `.metadata`. */
const MAX_RAW_LENGTH = 200;

/** Structured details extracted from an OpenAI-compatible error response body. */
export interface LLMRequestErrorOptions {
  code?: string | number;
  providerName?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Thrown when an LLM endpoint responds with an HTTP error status, or a 200 response
 * carrying an `error` field. Carries the raw provider fields alongside a human-readable
 * `.message` so callers can either match on `.message` (existing behavior) or branch on
 * `.status` / `.code` without parsing text.
 */
export class LLMRequestError extends Error {
  readonly status: number;
  readonly providerMessage: string;
  readonly code?: string | number;
  readonly providerName?: string;
  readonly metadata?: Record<string, unknown>;

  constructor(status: number, providerMessage: string, options: LLMRequestErrorOptions = {}) {
    super(LLMRequestError.buildMessage(status, providerMessage, options));
    this.name = 'LLMRequestError';
    this.status = status;
    this.providerMessage = providerMessage;
    this.code = options.code;
    this.providerName = options.providerName;
    this.metadata = options.metadata;
    Object.setPrototypeOf(this, LLMRequestError.prototype);
  }

  /** Parses an OpenAI-compatible error body (`{"error": {...}}` or `{"error": "..."}`). */
  static fromResponseBody(text: string, status: number): LLMRequestError {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return new LLMRequestError(status, `HTTP ${status}`);
    }

    if (typeof data !== 'object' || data === null) {
      return new LLMRequestError(status, `HTTP ${status}`);
    }

    const errorField = (data as Record<string, any>).error;

    if (typeof errorField === 'string') {
      return new LLMRequestError(status, errorField);
    }

    if (typeof errorField === 'object' && errorField !== null) {
      let message = errorField.message;
      if (typeof message === 'object' && message !== null) {
        message = JSON.stringify(message);
      } else if (typeof message !== 'string') {
        message = `HTTP ${status}`;
      }

      return new LLMRequestError(status, message, {
        code: typeof errorField.code === 'string' || typeof errorField.code === 'number' ? errorField.code : undefined,
        providerName: typeof errorField.metadata?.provider_name === 'string' ? errorField.metadata.provider_name : undefined,
        metadata:
          typeof errorField.metadata === 'object' && errorField.metadata !== null ? errorField.metadata : undefined,
      });
    }

    return new LLMRequestError(status, `HTTP ${status}`);
  }

  private static buildMessage(status: number, providerMessage: string, options: LLMRequestErrorOptions): string {
    const details = [`HTTP ${status}`];
    if (options.code !== undefined) {
      details.push(`code ${options.code}`);
    }
    if (options.providerName) {
      details.push(`provider ${options.providerName}`);
    }

    let message = `LLM request failed: ${providerMessage} (${details.join(', ')})`;

    // Provider-supplied text: truncated so untrusted remote content stays bounded in logs.
    const raw = options.metadata?.raw;
    if (typeof raw === 'string' && raw !== '') {
      const excerpt = raw.length > MAX_RAW_LENGTH ? `${raw.slice(0, MAX_RAW_LENGTH)}…` : raw;
      message += ` — ${excerpt}`;
    }

    return message;
  }
}

/** Endpoints for the local llama.cpp servers exercised by the e2e suite. */
export const CHAT_ENDPOINT = 'http://127.0.0.1:8080';
export const EMBED_ENDPOINT = 'http://127.0.0.1:8081';
export const RERANK_ENDPOINT = 'http://127.0.0.1:8082';

async function isUp(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** Checked once per test run; each constant reflects whether that server responded to /health. */
export const CHAT_UP = await isUp(CHAT_ENDPOINT);
export const EMBED_UP = await isUp(EMBED_ENDPOINT);
export const RERANK_UP = await isUp(RERANK_ENDPOINT);

/** Parses and normalizes GPT-OSS / Harmony channel markers in assistant text. */

const CHANNEL = '<|channel|>';
const CHANNEL_ALT = '<|channel>';
const MESSAGE = '<|message|>';
const START = '<|start|>';

export interface ParsedContent {
  content: string;
  reasoning: string | null;
}

export function containsChannelMarkers(raw: string): boolean {
  return raw.includes(CHANNEL) || raw.includes(CHANNEL_ALT);
}

export function parse(raw: string): ParsedContent {
  if (!containsChannelMarkers(raw)) {
    return { content: raw, reasoning: null };
  }

  const jsonParsed = tryParseChannelJsonFormat(raw);
  if (jsonParsed) {
    return jsonParsed;
  }

  if (!raw.includes(CHANNEL)) {
    return { content: stripTokens(raw), reasoning: null };
  }

  const segments = raw
    .split(new RegExp(`(?=${escapeRegExp(START)}|${escapeRegExp(CHANNEL)})`))
    .filter((segment) => segment !== '');

  if (segments.length === 0) {
    return { content: stripTokens(raw), reasoning: null };
  }

  const reasoningParts: string[] = [];
  const finalParts: string[] = [];
  const fallbackParts: string[] = [];

  for (const segment of segments) {
    const parsed = parseSegment(segment);
    if (!parsed) {
      const trimmed = segment.trim();
      if (trimmed !== '') {
        fallbackParts.push(stripTokens(trimmed));
      }
      continue;
    }

    if (parsed.channel === 'analysis') {
      reasoningParts.push(parsed.content);
    } else if (parsed.channel === 'final') {
      finalParts.push(parsed.content);
    } else {
      fallbackParts.push(parsed.content);
    }
  }

  const reasoning = reasoningParts.length > 0 ? reasoningParts.join('\n') : null;
  const content =
    finalParts.length > 0 ? finalParts.join('\n') : fallbackParts.filter((part) => part !== '').join('\n');

  if (content === '' && reasoning === null) {
    return { content: stripTokens(raw), reasoning: null };
  }

  return { content, reasoning };
}

/** Extract assistant text from llama.cpp "Failed to parse input at pos …" errors. */
export function tryParseServerError(errorMessage: string): ParsedContent | null {
  if (!errorMessage.startsWith('Failed to parse input at pos')) {
    return null;
  }

  const colonPos = errorMessage.indexOf(': ');
  if (colonPos === -1) {
    return null;
  }

  const raw = errorMessage.slice(colonPos + 2);
  if (raw === '') {
    return null;
  }

  const parsed = parse(raw);
  if (parsed.content === '' && parsed.reasoning === null) {
    return null;
  }

  return parsed;
}

export function stripTokens(text: string): string {
  let result = text.replace(/<\|start\|>[^<]*/g, '');
  result = result.replace(/<\|channel\|?>[^<{]*/g, '');
  result = result
    .replaceAll('<|message|>', '')
    .replaceAll('<|end|>', '')
    .replaceAll('<|return|>', '')
    .replaceAll('<|call|>', '');

  return result.trim();
}

/**
 * Some models emit `<|channel>TIMESTAMP\n{"thought":"…"}visible answer` instead of
 * the standard Harmony `<|channel|>analysis<|message|>…` sequence.
 */
function tryParseChannelJsonFormat(raw: string): ParsedContent | null {
  if (!/^<\|channel>\|?/.test(raw)) {
    return null;
  }

  if (/^<\|channel\|>(analysis|final|commentary)</.test(raw)) {
    return null;
  }

  const afterMarker = raw.replace(/^<\|channel>\|?/, '');

  const bracePos = afterMarker.indexOf('{');
  if (bracePos === -1) {
    return null;
  }

  const json = extractJsonObject(afterMarker.slice(bracePos));
  if (json === null) {
    return null;
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
    return null;
  }

  const record = decoded as Record<string, unknown>;
  let thought = record.thought ?? record.thinking ?? null;
  if (typeof thought !== 'string') {
    thought = null;
  }

  const content = afterMarker.slice(bracePos + json.length).trim();
  if (thought === null && content === '') {
    return null;
  }

  return {
    content,
    reasoning: thought !== null && thought !== '' ? thought : null,
  };
}

function extractJsonObject(text: string): string | null {
  if (text === '' || text[0] !== '{') {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\' && inString) {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(0, i + 1);
      }
    }
  }

  return null;
}

interface ParsedSegment {
  channel: string;
  content: string;
}

function parseSegment(segment: string): ParsedSegment | null {
  let trimmed = segment.trim();
  if (trimmed === '') {
    return null;
  }

  if (trimmed.startsWith(START)) {
    trimmed = trimmed.slice(START.length);
    const channelPos = trimmed.indexOf(CHANNEL);
    if (channelPos !== -1) {
      trimmed = trimmed.slice(channelPos);
    }
  }

  if (!trimmed.startsWith(CHANNEL)) {
    return null;
  }

  const afterChannel = trimmed.slice(CHANNEL.length);
  const messagePos = afterChannel.indexOf(MESSAGE);
  if (messagePos === -1) {
    return null;
  }

  const channel = afterChannel.slice(0, messagePos).trim();
  if (channel === '') {
    return null;
  }

  const body = afterChannel.slice(messagePos + MESSAGE.length);
  const content = extractMessageBody(body);
  if (content === '') {
    return null;
  }

  return { channel, content };
}

function extractMessageBody(text: string): string {
  let endPos = text.length;
  for (const terminator of ['<|end|>', '<|return|>', '<|call|>', START]) {
    const pos = text.indexOf(terminator);
    if (pos !== -1 && pos < endPos) {
      endPos = pos;
    }
  }

  return text.slice(0, endPos).trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

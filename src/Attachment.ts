export type AttachmentKind = 'image' | 'video';

/** Binary media (image or video) attached to a user message, sent inline as a base64 data URL. */
export class Attachment {
  public readonly mimeType: string;

  constructor(
    public bytes: Uint8Array,
    mimeType: string,
    public name: string | null = null,
  ) {
    this.mimeType = Attachment.normalizeMimeType(mimeType);
    Attachment.kindOf(this.mimeType);
  }

  static fromBytes(bytes: Uint8Array | ArrayBuffer, mimeType: string, name: string | null = null): Attachment {
    return new Attachment(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), mimeType, name);
  }

  static fromBase64(data: string, mimeType: string, name: string | null = null): Attachment {
    return new Attachment(Uint8Array.from(Buffer.from(data, 'base64')), mimeType, name);
  }

  /** Reads a file from disk; the MIME type is inferred from the extension unless given. */
  static async fromFile(path: string, mimeType: string | null = null): Promise<Attachment> {
    const file = Bun.file(path);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = path.split(/[\\/]/).pop() ?? path;

    return new Attachment(bytes, mimeType ?? file.type, name);
  }

  get kind(): AttachmentKind {
    return Attachment.kindOf(this.mimeType);
  }

  get size(): number {
    return this.bytes.byteLength;
  }

  toDataUrl(): string {
    return `data:${this.mimeType};base64,${Buffer.from(this.bytes).toString('base64')}`;
  }

  /** OpenAI-compatible `content[]` part (llama.cpp accepts `video_url` alongside `image_url`). */
  toContentPart(): Record<string, unknown> {
    const url = this.toDataUrl();
    if (this.kind === 'video') {
      return { type: 'video_url', video_url: { url } };
    }

    return { type: 'image_url', image_url: { url } };
  }

  /** Metadata only: the bytes are deliberately left out of logs. */
  toJSON(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      kind: this.kind,
      mime_type: this.mimeType,
      size: this.size,
    };
    if (this.name !== null) {
      payload.name = this.name;
    }

    return payload;
  }

  private static normalizeMimeType(mimeType: string): string {
    return mimeType.split(';')[0].trim().toLowerCase();
  }

  private static kindOf(mimeType: string): AttachmentKind {
    if (mimeType.startsWith('image/')) {
      return 'image';
    }
    if (mimeType.startsWith('video/')) {
      return 'video';
    }

    throw new Error(`Unsupported attachment MIME type "${mimeType}" (expected image/* or video/*)`);
  }
}

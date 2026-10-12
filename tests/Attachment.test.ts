import { describe, expect, test } from 'bun:test';
import { Attachment } from '../src/Attachment';
import { Conversation } from '../src/Conversation';
import { Message } from '../src/Message';
import { Role } from '../src/Role';

const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const BASE64 = 'iVBORw==';

describe('Attachment', () => {
  test('derives kind from the MIME type and strips parameters', () => {
    expect(new Attachment(BYTES, 'image/png').kind).toBe('image');
    expect(new Attachment(BYTES, 'Video/MP4; codecs=avc1').mimeType).toBe('video/mp4');
    expect(new Attachment(BYTES, 'video/webm').kind).toBe('video');
  });

  test('rejects unsupported MIME types', () => {
    expect(() => new Attachment(BYTES, 'audio/wav')).toThrow('Unsupported attachment MIME type "audio/wav"');
    expect(() => new Attachment(BYTES, 'text/plain;charset=utf-8')).toThrow('"text/plain"');
  });

  test('fromBytes accepts an ArrayBuffer and fromBase64 decodes the payload', () => {
    expect(Attachment.fromBytes(BYTES.buffer, 'image/png').bytes).toEqual(BYTES);
    expect(Attachment.fromBase64(BASE64, 'image/png').bytes).toEqual(BYTES);
  });

  test('fromFile reads bytes, infers the MIME type and keeps the basename', async () => {
    const image = await Attachment.fromFile(`${import.meta.dir}/e2e/fixtures/red.png`);
    const video = await Attachment.fromFile(`${import.meta.dir}/e2e/fixtures/blue.mp4`);

    expect(image.mimeType).toBe('image/png');
    expect(image.name).toBe('red.png');
    expect(image.size).toBe(174);
    expect(video.kind).toBe('video');
  });

  test('fromFile lets the caller override the MIME type', async () => {
    const attachment = await Attachment.fromFile(`${import.meta.dir}/e2e/fixtures/red.png`, 'image/x-custom');

    expect(attachment.mimeType).toBe('image/x-custom');
  });

  test('toContentPart emits image_url / video_url with a base64 data URL', () => {
    expect(new Attachment(BYTES, 'image/png').toContentPart()).toEqual({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${BASE64}` },
    });
    expect(new Attachment(BYTES, 'video/mp4').toContentPart()).toEqual({
      type: 'video_url',
      video_url: { url: `data:video/mp4;base64,${BASE64}` },
    });
  });

  test('toJSON exposes metadata only', () => {
    expect(new Attachment(BYTES, 'image/png', 'a.png').toJSON()).toEqual({
      kind: 'image',
      mime_type: 'image/png',
      size: 4,
      name: 'a.png',
    });
    expect(new Attachment(BYTES, 'image/png').toJSON()).not.toHaveProperty('name');
  });
});

describe('Message with attachments', () => {
  test('Message.user builds a user message holding the attachments', () => {
    const attachment = new Attachment(BYTES, 'image/png');
    const message = Message.user('look', [attachment]);

    expect(message.role).toBe(Role.User);
    expect(message.content).toBe('look');
    expect(message.attachments).toEqual([attachment]);
  });

  test('without attachments the payload content stays a plain string', () => {
    expect(Message.user('hi').toChatCompletionPayload()).toEqual({ role: Role.User, content: 'hi' });
  });

  test('with attachments the payload content is text first, then media parts', () => {
    const message = Message.user('compare', [new Attachment(BYTES, 'image/png'), new Attachment(BYTES, 'video/mp4')]);

    expect(message.toChatCompletionPayload()).toEqual({
      role: Role.User,
      content: [
        { type: 'text', text: 'compare' },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${BASE64}` } },
        { type: 'video_url', video_url: { url: `data:video/mp4;base64,${BASE64}` } },
      ],
    });
  });

  test('empty text is omitted from the content parts', () => {
    const message = Message.user('', [new Attachment(BYTES, 'image/png')]);

    expect(message.toChatCompletionPayload().content).toEqual([
      { type: 'image_url', image_url: { url: `data:image/png;base64,${BASE64}` } },
    ]);
  });

  test('conversation logs keep attachment metadata but never the bytes', () => {
    const conversation = new Conversation([Message.user('look', [new Attachment(BYTES, 'image/png', 'a.png')])]);
    const json = JSON.stringify(conversation);

    expect(JSON.parse(json)).toEqual({
      messages: [
        {
          role: Role.User,
          content: 'look',
          attachments: [{ kind: 'image', mime_type: 'image/png', size: 4, name: 'a.png' }],
        },
      ],
    });
    expect(json).not.toContain(BASE64);
  });
});

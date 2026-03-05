import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

process.env.IMAP_HOST = process.env.IMAP_HOST || 'imap.example.com';
process.env.IMAP_PORT = process.env.IMAP_PORT || '993';
process.env.EMAIL_USER = process.env.EMAIL_USER || 'user@example.com';
process.env.EMAIL_PASS = process.env.EMAIL_PASS || 'password';
process.env.IMAP_SECURE = process.env.IMAP_SECURE || 'true';
process.env.SMTP_HOST = process.env.SMTP_HOST || 'smtp.example.com';
process.env.SMTP_PORT = process.env.SMTP_PORT || '465';
process.env.SMTP_SECURE = process.env.SMTP_SECURE || 'true';

const { IMAPClient } = await import('../dist/imap-client.js');

function createRawMimeEmail() {
  return [
    'From: Alice <alice@example.com>',
    'To: Bob <bob@example.com>',
    'Subject: Attachment test',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="mixed-1"',
    '',
    '--mixed-1',
    'Content-Type: text/plain; charset="utf-8"',
    '',
    'Body text',
    '--mixed-1',
    'Content-Type: text/plain; name="hello.txt"',
    'Content-Transfer-Encoding: base64',
    'Content-Disposition: attachment; filename="hello.txt"',
    '',
    'SGVsbG8gd29ybGQ=',
    '--mixed-1--',
    '',
  ].join('\r\n');
}

function setupFakeImap(client, rawMessage) {
  const fakeImap = {
    fetch() {
      const fetchEmitter = new EventEmitter();

      process.nextTick(() => {
        const msg = new EventEmitter();
        fetchEmitter.emit('message', msg, 1);

        process.nextTick(() => {
          const stream = Readable.from([Buffer.from(rawMessage, 'utf8')]);
          msg.emit('body', stream, { which: '' });
          stream.on('end', () => {
            msg.emit('attributes', {
              uid: 1,
              flags: [],
              date: new Date('2026-01-01T00:00:00Z'),
              size: Buffer.byteLength(rawMessage),
            });
            msg.emit('end');
            fetchEmitter.emit('end');
          });
        });
      });

      return fetchEmitter;
    }
  };

  client.imap = fakeImap;
  client.currentBox = 'INBOX';
}

test('fetchMessages returns attachment metadata by default', async () => {
  const client = new IMAPClient({
    host: 'imap.example.com',
    port: 993,
    username: 'user@example.com',
    password: 'password',
    tls: true,
  });

  setupFakeImap(client, createRawMimeEmail());

  const [message] = await client.fetchMessages([1], {});
  assert.equal(message.attachments?.length, 1);
  assert.equal(message.attachments?.[0].filename, 'hello.txt');
  assert.equal(message.attachments?.[0].contentBase64, undefined);
});

test('fetchMessages returns attachment base64 when includeAttachmentContent is enabled', async () => {
  const client = new IMAPClient({
    host: 'imap.example.com',
    port: 993,
    username: 'user@example.com',
    password: 'password',
    tls: true,
  });

  setupFakeImap(client, createRawMimeEmail());

  const [message] = await client.fetchMessages([1], { includeAttachmentContent: true, attachmentMaxBytes: 1024 });
  assert.equal(message.attachments?.length, 1);
  assert.equal(message.attachments?.[0].filename, 'hello.txt');
  assert.equal(message.attachments?.[0].contentBase64, 'SGVsbG8gd29ybGQ=');
  assert.equal(message.attachments?.[0].contentTruncated, false);
});

import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { SerialTaskQueue } from '../dist/async-queue.js';
import { FileAccessPolicy } from '../dist/file-access-policy.js';
import { IMAPClient } from '../dist/imap-client.js';
import { appendQuotedOriginal, appendSignature } from '../dist/mail-utils.js';
import { parseMessageRef, parseMoveMessageRef } from '../dist/message-ref.js';
import { isPathInsideRoot } from '../dist/path-policy.js';
import { MailSearchService } from '../dist/search-service.js';
import { SMTPClient } from '../dist/smtp-client.js';

test('SerialTaskQueue does not interleave stateful tasks', async () => {
  const queue = new SerialTaskQueue();
  const events = [];
  let releaseFirst;
  const firstGate = new Promise(resolve => {
    releaseFirst = resolve;
  });

  const first = queue.run(async () => {
    events.push('first:start');
    await firstGate;
    events.push('first:end');
  });
  const second = queue.run(async () => {
    events.push('second:start');
    events.push('second:end');
  });

  await Promise.resolve();
  assert.deepEqual(events, ['first:start']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start', 'second:end']);
});

test('parseMessageRef requires a mailbox-scoped positive UID', () => {
  assert.deepEqual(
    parseMessageRef({ mailbox: 'INBOX', uid: 42, uidValidity: 7 }),
    { mailbox: 'INBOX', uid: 42, uidValidity: 7 }
  );
  assert.throws(() => parseMessageRef({ uid: 42 }), /mailbox/);
  assert.throws(() => parseMessageRef({ mailbox: 'INBOX', uid: 0 }), /positive integer/);
});

test('parseMoveMessageRef requires distinct source and target mailboxes', () => {
  assert.deepEqual(
    parseMoveMessageRef({ mailbox: 'INBOX', uid: 42, uidValidity: 7, targetMailbox: 'Archive' }),
    { mailbox: 'INBOX', uid: 42, uidValidity: 7, targetMailbox: 'Archive' }
  );
  assert.throws(
    () => parseMoveMessageRef({ mailbox: 'INBOX', uid: 42, targetMailbox: '' }),
    /targetMailbox/
  );
  assert.throws(
    () => parseMoveMessageRef({ mailbox: 'INBOX', uid: 42, targetMailbox: 'inbox' }),
    /different/
  );
  assert.throws(
    () => parseMoveMessageRef({ uid: 42, targetMailbox: 'Archive' }),
    /mailbox/
  );
});

test('IMAPClient moves the selected UID and returns a destination UID when available', async () => {
  const client = new IMAPClient({
    host: 'imap.example.com',
    port: 993,
    username: 'sender@example.com',
    password: 'not-used',
  });
  client.currentBox = 'INBOX';
  client.imap = {
    move(uid, targetMailbox, callback) {
      assert.equal(uid, 42);
      assert.equal(targetMailbox, 'Archive');
      callback(null, '108');
    },
  };

  assert.deepEqual(
    await client.moveMessage(42, 'Archive'),
    { destinationUid: 108 }
  );

  client.imap = {
    move(_uid, _targetMailbox, callback) {
      callback(null);
    },
  };
  assert.deepEqual(await client.moveMessage(42, 'Archive'), {});

  client.imap = {
    move(_uid, _targetMailbox, callback) {
      callback(new Error('Mailbox does not exist'));
    },
  };
  await assert.rejects(
    () => client.moveMessage(42, 'Archive'),
    /IMAP MOVE failed: Mailbox does not exist/
  );
});

test('path policy rejects sibling-prefix escapes', () => {
  assert.equal(isPathInsideRoot('/allowed/root/file.txt', '/allowed/root'), true);
  assert.equal(isPathInsideRoot('/allowed/root', '/allowed/root'), true);
  assert.equal(isPathInsideRoot('/allowed/root-escape/file.txt', '/allowed/root'), false);
  assert.equal(isPathInsideRoot('/outside/file.txt', '/allowed/root'), false);
});

test('FileAccessPolicy enforces roots and size limits', async () => {
  const allowedRoot = await mkdtemp(path.join(tmpdir(), 'mcp-mail-allowed-'));
  const outsideRoot = await mkdtemp(path.join(tmpdir(), 'mcp-mail-outside-'));

  try {
    const allowedFile = path.join(allowedRoot, 'small.txt');
    const oversizedFile = path.join(allowedRoot, 'large.txt');
    const outsideFile = path.join(outsideRoot, 'outside.txt');
    await writeFile(allowedFile, '1234');
    await writeFile(oversizedFile, '12345');
    await writeFile(outsideFile, '1');

    const policy = new FileAccessPolicy({ allowedRoots: [allowedRoot], maxAttachmentBytes: 4 });
    assert.equal((await policy.getReadableAttachmentPath(allowedFile)).size, 4);
    await assert.rejects(() => policy.getReadableAttachmentPath(oversizedFile), /configured limit/);
    await assert.rejects(() => policy.getReadableAttachmentPath(outsideFile), /outside MAIL_ALLOWED_ROOTS/);
    assert.equal(
      await policy.prepareWritableDirectory(path.join(allowedRoot, 'downloads')),
      path.join(await realpath(allowedRoot), 'downloads')
    );
  } finally {
    await Promise.all([
      rm(allowedRoot, { recursive: true, force: true }),
      rm(outsideRoot, { recursive: true, force: true }),
    ]);
  }
});

test('appendSignature composes plain text and HTML alternatives safely', () => {
  assert.deepEqual(
    appendSignature('Hello', '<p>Hello</p>'),
    { text: 'Hello', html: '<p>Hello</p>' }
  );

  assert.deepEqual(
    appendSignature('Hello', '<p>Hello</p>', { text: 'Regards,\nA < B' }),
    {
      text: 'Hello\n\nRegards,\nA < B',
      html: '<p>Hello</p><br><br><div class="mcp-mail-signature">Regards,<br>A &lt; B</div>',
    }
  );

  assert.deepEqual(
    appendSignature('Hello', undefined, { html: '<strong>Sender</strong>' }),
    {
      text: 'Hello',
      html: 'Hello<br><br><div class="mcp-mail-signature"><strong>Sender</strong></div>',
    }
  );
});

test('reply composition places the signature before the quoted original', () => {
  const signedReply = appendSignature('Thanks', '<p>Thanks</p>', {
    text: 'Regards,\nSender',
    html: '<p>Regards,<br>Sender</p>',
  });
  const reply = appendQuotedOriginal(
    signedReply,
    'Earlier message',
    '<p>Earlier message</p>',
    '2026-07-20',
    'author@example.com'
  );

  assert.ok(reply.text.indexOf('Thanks') < reply.text.indexOf('Regards'));
  assert.ok(reply.text.indexOf('Regards') < reply.text.indexOf('On 2026-07-20'));
  assert.ok(reply.html.indexOf('mcp-mail-signature') < reply.html.indexOf('border-left'));
});

test('raw sent copy preserves attachments and reply threading headers', async () => {
  const client = new SMTPClient({
    host: 'smtp.example.com',
    port: 465,
    secure: true,
    username: 'sender@example.com',
    password: 'not-used',
  });

  const raw = await client.buildRawMessage({
    to: 'recipient@example.com',
    subject: 'Attachment test',
    text: 'Hello',
    inReplyTo: '<original@example.com>',
    references: ['<root@example.com>', '<original@example.com>'],
    attachments: [{
      filename: 'evidence.txt',
      content: Buffer.from('attachment-content'),
    }],
  }, '<reply@example.com>');

  const message = raw.toString('utf8');
  assert.match(message, /Message-ID: <reply@example\.com>/i);
  assert.match(message, /In-Reply-To: <original@example\.com>/i);
  assert.match(message, /References: <root@example\.com> <original@example\.com>/i);
  assert.match(message, /filename=evidence\.txt/i);
  assert.match(message, /YXR0YWNobWVudC1jb250ZW50/);
});

test('raw MIME output contains the composed signature in text and HTML parts', async () => {
  const client = new SMTPClient({
    host: 'smtp.example.com',
    port: 465,
    secure: true,
    username: 'sender@example.com',
    password: 'not-used',
  });
  const content = appendSignature('Hello', '<p>Hello</p>', {
    text: 'Regards, Sender',
    html: '<strong>Regards, Sender</strong>',
  });

  const raw = await client.buildRawMessage({
    to: 'recipient@example.com',
    subject: 'Signature test',
    text: content.text,
    html: content.html,
  });
  const message = raw.toString('utf8');

  assert.match(message, /Regards, Sender/);
  assert.match(message, /mcp-mail-signature/);
});

test('MailSearchService owns mailbox search, date filtering, and response limits', async () => {
  const fakeIMAPClient = {
    async openBox(mailbox) {
      assert.equal(mailbox, 'INBOX');
      return { uidvalidity: 91 };
    },
    async search(criteria) {
      assert.deepEqual(criteria, [['FROM', 'sender@example.com']]);
      return [1, 2, 3];
    },
    async fetchMessages() {
      return [
        { uid: 1, date: '2026-01-01T12:00:00Z', text: 'too early' },
        { uid: 2, date: '2026-01-02T12:00:00Z', text: '123456789' },
        { uid: 3, date: '2026-01-03T12:00:00Z', text: 'too late' },
      ];
    },
  };
  let connectionChecks = 0;
  const service = new MailSearchService({
    ensureIMAPConnection: async () => { connectionChecks += 1; },
    getIMAPClient: () => fakeIMAPClient,
    findSentMailbox: async () => null,
    maxBodyCharacters: 5,
  });

  const response = await service.searchBySender({
    sender: 'sender@example.com',
    startDate: '2026-01-02',
    endDate: '2026-01-02',
  });
  const result = JSON.parse(response.content[0].text);

  assert.equal(connectionChecks, 1);
  assert.equal(result.totalMatches, 1);
  assert.equal(result.returnedCount, 1);
  assert.equal(result.messages[0].sourceMailbox, 'INBOX');
  assert.equal(result.messages[0].uidValidity, 91);
  assert.equal(result.messages[0].text, '12345\n\n[truncated]');
  assert.equal(result.messages[0].textTruncated, true);
  assert.match(result.warning, /only searched INBOX/);
});

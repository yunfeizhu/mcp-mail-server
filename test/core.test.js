import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { SerialTaskQueue } from '../dist/async-queue.js';
import { FileAccessPolicy } from '../dist/file-access-policy.js';
import { parseMessageRef } from '../dist/message-ref.js';
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

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Imap from 'imap';
import { simpleParser } from 'mailparser';

import { SerialTaskQueue } from '../src/async-queue';
import { FileAccessPolicy } from '../src/file-access-policy';
import {
  DeleteMessageError,
  FetchByteLimitError,
  IMAPClient as TypedIMAPClient,
  IMAPOperationAbortedError,
  PartialMoveError,
  SentAppendError,
} from '../src/imap-client';
import {
  DEFAULT_EMAIL_HTML_STYLE,
  applyDefaultHtmlStyle,
  appendQuotedOriginal,
  appendSignature,
  buildReplyRecipients,
  ensureHtmlAlternative,
  extractEmailsFromAddressField,
} from '../src/mail-utils';
import { parseMessageRef, parseMoveMessageRef } from '../src/message-ref';
import { isPathInsideRoot } from '../src/path-policy';
import { MailSearchService as TypedMailSearchService } from '../src/search-service';
import { SMTPClient as TypedSMTPClient } from '../src/smtp-client';
import { MAIL_TOOLS } from '../src/tool-definitions';

// These tests deliberately replace private transport state and inject partial
// protocol doubles. Keep that white-box boundary explicit instead of weakening
// the production types.
const IMAPClient = TypedIMAPClient as any;
const MailSearchService = TypedMailSearchService as any;
const SMTPClient = TypedSMTPClient as any;
const TestEventEmitter = EventEmitter as any;
const TestImap = Imap as any;

let mailRuntimePromise: Promise<any> | undefined;
function loadMailRuntime(): Promise<any> {
  if (!mailRuntimePromise) {
    const env = {
      IMAP_HOST: 'localhost',
      IMAP_PORT: '993',
      IMAP_SECURE: 'true',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      EMAIL_USER: 'test@example.com',
      EMAIL_PASS: 'not-used',
    };
    const previous = new Map(Object.keys(env).map(name => [name, process.env[name]]));
    Object.assign(process.env, env);
    mailRuntimePromise = Promise.all([
      import('../src/mail-connection-manager'),
      import('../src/mail-mcp-server'),
    ]).finally(() => {
      for (const [name, value] of previous) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    });
  }
  return mailRuntimePromise;
}

test('mail configuration rejects plaintext IMAP and requires TLS for SMTP submission', () => {
  const baseEnv = {
    ...process.env,
    IMAP_HOST: 'imap.example.com',
    IMAP_PORT: '993',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    EMAIL_USER: 'sender@example.com',
    EMAIL_PASS: 'not-used',
  };
  const importConfig =
    'import("./src/config").then(({EMAIL_CONFIG}) => process.stdout.write(JSON.stringify(EMAIL_CONFIG.SMTP)))';
  const importConfigArgs = ['--import', 'tsx', '--input-type=module', '-e', importConfig];

  const insecureIMAP = spawnSync(process.execPath, importConfigArgs, {
    cwd: process.cwd(),
    env: { ...baseEnv, IMAP_SECURE: 'false', SMTP_SECURE: 'false' },
    encoding: 'utf8',
  });
  assert.notEqual(insecureIMAP.status, 0);
  assert.match(insecureIMAP.stderr, /IMAP_SECURE=false is not supported/);

  const startTLS = spawnSync(process.execPath, importConfigArgs, {
    cwd: process.cwd(),
    env: { ...baseEnv, IMAP_SECURE: 'true', SMTP_SECURE: 'false' },
    encoding: 'utf8',
  });
  assert.equal(startTLS.status, 0, startTLS.stderr);
  const smtpConfig = JSON.parse(startTLS.stdout);
  assert.equal(smtpConfig.secure, false);
  assert.equal(smtpConfig.requireTLS, true);
  assert.equal(smtpConfig.tlsRejectUnauthorized, true);

  const invalidPort = spawnSync(process.execPath, importConfigArgs, {
    cwd: process.cwd(),
    env: { ...baseEnv, IMAP_PORT: '65536', IMAP_SECURE: 'true', SMTP_SECURE: 'true' },
    encoding: 'utf8',
  });
  assert.notEqual(invalidPort.status, 0);
  assert.match(invalidPort.stderr, /integer between 1 and 65535/);

  const unsafeLimit = spawnSync(process.execPath, importConfigArgs, {
    cwd: process.cwd(),
    env: {
      ...baseEnv,
      IMAP_SECURE: 'true',
      SMTP_SECURE: 'true',
      MAIL_MAX_SEARCH_CANDIDATES: String(Number.MAX_SAFE_INTEGER + 1),
    },
    encoding: 'utf8',
  });
  assert.notEqual(unsafeLimit.status, 0);
  assert.match(unsafeLimit.stderr, /positive safe integer/);
});

test('IMAPClient rejects when a connection ends before ready', async () => {
  const originalConnect = TestImap.prototype.connect;
  TestImap.prototype.connect = function connectAndEnd() {
    queueMicrotask(() => this.emit('end'));
  };

  try {
    const client = new IMAPClient({
      host: 'imap.example.com',
      port: 993,
      username: 'sender@example.com',
      password: 'not-used',
      tls: true,
    });
    await assert.rejects(() => client.connect(), /ended before it became ready/);
  } finally {
    TestImap.prototype.connect = originalConnect;
  }
});

test('IMAPClient rejects close-before-ready and clears live state on close', async () => {
  const originalConnect = TestImap.prototype.connect;
  const originalOpenBox = TestImap.prototype.openBox;

  try {
    TestImap.prototype.connect = function connectAndClose() {
      queueMicrotask(() => this.emit('close', true));
    };
    const initialClient = new IMAPClient({
      host: 'imap.example.com',
      port: 993,
      username: 'sender@example.com',
      password: 'not-used',
      tls: true,
    });
    await assert.rejects(() => initialClient.connect(), /closed before it became ready/);

    TestImap.prototype.openBox = function openBox(_mailbox, _readOnly, callback) {
      callback(null, {
        messages: { total: 0, new: 0, unseen: 0 },
        permFlags: [],
        uidvalidity: 7,
        uidnext: 1,
      });
    };
    TestImap.prototype.connect = function connectAndBecomeReady() {
      queueMicrotask(() => this.emit('ready'));
    };
    const connectedClient = new IMAPClient({
      host: 'imap.example.com',
      port: 993,
      username: 'sender@example.com',
      password: 'not-used',
      tls: true,
    });
    await connectedClient.connect();
    assert.equal(connectedClient.isConnected(), true);
    connectedClient.imap.emit('close', false);
    assert.equal(connectedClient.isConnected(), false);
    assert.equal(connectedClient.getCurrentBox(), null);
  } finally {
    TestImap.prototype.connect = originalConnect;
    TestImap.prototype.openBox = originalOpenBox;
  }
});

test('IMAPClient rejects an active command when the connection terminates', async () => {
  const client = new IMAPClient({
    host: 'imap.example.com',
    port: 993,
    username: 'sender@example.com',
    password: 'not-used',
  });
  const imap = new TestEventEmitter();
  imap.search = () => {};
  client.imap = imap;
  client.currentBox = 'INBOX';

  const pendingSearch = client.search(['ALL']);
  queueMicrotask(() => imap.emit('close', true));

  await assert.rejects(pendingSearch, (error: any) => {
    assert.equal(error instanceof IMAPOperationAbortedError, true);
    assert.equal(error.operation, 'SEARCH');
    assert.equal(error.terminalEvent, 'close');
    return true;
  });
  assert.equal(imap.listenerCount('close'), 0);
});

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
  assert.deepEqual(parseMessageRef({ mailbox: 'INBOX', uid: 42, uidValidity: 7 }), {
    mailbox: 'INBOX',
    uid: 42,
    uidValidity: 7,
  });
  assert.throws(() => parseMessageRef({ uid: 42 }), /mailbox/);
  assert.throws(() => parseMessageRef({ mailbox: 'INBOX', uid: 0 }), /positive integer/);
});

test('parseMoveMessageRef requires distinct source and target mailboxes', () => {
  assert.deepEqual(
    parseMoveMessageRef({ mailbox: 'INBOX', uid: 42, uidValidity: 7, targetMailbox: 'Archive' }),
    { mailbox: 'INBOX', uid: 42, uidValidity: 7, targetMailbox: 'Archive' },
  );
  assert.throws(
    () => parseMoveMessageRef({ mailbox: 'INBOX', uid: 42, targetMailbox: '' }),
    /targetMailbox/,
  );
  assert.throws(
    () => parseMoveMessageRef({ mailbox: 'INBOX', uid: 42, targetMailbox: 'inbox' }),
    /different/,
  );
  assert.throws(() => parseMoveMessageRef({ uid: 42, targetMailbox: 'Archive' }), /mailbox/);
});

test('IMAPClient moves the selected UID and returns a destination UID when available', async () => {
  const client = new IMAPClient({
    host: 'imap.example.com',
    port: 993,
    username: 'sender@example.com',
    password: 'not-used',
  });
  client.currentBox = 'INBOX';
  client.currentUidValidity = 7;
  client.search = async criteria => {
    assert.deepEqual(criteria, [['UID', 42]]);
    return [42];
  };
  client.imap = {
    serverSupports(capability) {
      return capability === 'MOVE';
    },
    move(uid, targetMailbox, callback) {
      assert.equal(uid, 42);
      assert.equal(targetMailbox, 'Archive');
      callback(null, '108');
    },
  };

  assert.deepEqual(await client.moveMessage(42, 'Archive'), { destinationUid: 108 });

  client.imap = {
    serverSupports(capability) {
      return capability === 'MOVE';
    },
    move(_uid, _targetMailbox, callback) {
      callback(null);
    },
  };
  assert.deepEqual(await client.moveMessage(42, 'Archive'), {});

  client.imap = {
    serverSupports(capability) {
      return capability === 'MOVE';
    },
    move(_uid, _targetMailbox, callback) {
      callback(new Error('Mailbox does not exist'));
    },
  };
  await assert.rejects(
    () => client.moveMessage(42, 'Archive'),
    /IMAP MOVE failed: Mailbox does not exist/,
  );

  const interruptedMove = new TestEventEmitter();
  interruptedMove.serverSupports = capability => capability === 'MOVE';
  interruptedMove.move = () => {
    queueMicrotask(() => interruptedMove.emit('close', true));
  };
  client.imap = interruptedMove;
  await assert.rejects(
    () => client.moveMessage(42, 'Archive'),
    (error: any) => {
      assert.equal(error instanceof PartialMoveError, true);
      assert.equal(error.copyOutcome, 'unknown');
      assert.equal(error.sourceState, 'unknown');
      return true;
    },
  );

  const interruptedCopy = new TestEventEmitter();
  interruptedCopy.serverSupports = capability => capability === 'UIDPLUS';
  interruptedCopy.copy = () => {
    queueMicrotask(() => interruptedCopy.emit('end'));
  };
  client.imap = interruptedCopy;
  await assert.rejects(
    () => client.moveMessage(42, 'Archive'),
    (error: any) => {
      assert.equal(error instanceof PartialMoveError, true);
      assert.equal(error.copyOutcome, 'unknown');
      assert.equal(error.sourceState, 'unknown');
      assert.match(error.message, /COPY outcome could not be confirmed/);
      return true;
    },
  );

  client.imap = {
    serverSupports(capability) {
      return capability === 'UIDPLUS';
    },
    copy(_uid, _targetMailbox, callback) {
      callback(null);
    },
    addFlags(_uid, _flags, callback) {
      callback(new Error('source cleanup failed'));
    },
  };
  client.openBox = async () => ({ uidvalidity: 7 });
  client.search = async criteria => (criteria[0] === 'DELETED' ? [] : [42]);
  await assert.rejects(
    () => client.moveMessage(42, 'Archive'),
    (error: any) => {
      assert.equal(error instanceof PartialMoveError, true);
      assert.equal(error.destinationUid, undefined);
      assert.equal(error.sourceState, 'present');
      assert.match(error.message, /partially completed/);
      return true;
    },
  );

  let rolledBack = false;
  let sourceDeleted = true;
  client.search = async criteria =>
    criteria[0] === 'DELETED' ? (sourceDeleted ? [42] : []) : [42];
  client.imap = {
    serverSupports(capability) {
      return capability === 'UIDPLUS';
    },
    copy(_uid, _targetMailbox, callback) {
      callback(null, '109');
    },
    addFlags(_uid, _flags, callback) {
      callback(null);
    },
    expunge(_uid, callback) {
      callback(new Error('expunge failed'));
    },
    delFlags(_uid, _flags, callback) {
      rolledBack = true;
      sourceDeleted = false;
      callback(null);
    },
  };
  await assert.rejects(
    () => client.moveMessage(42, 'Archive'),
    (error: any) => {
      assert.equal(error instanceof PartialMoveError, true);
      assert.equal(error.destinationUid, 109);
      assert.equal(error.sourceState, 'present');
      return true;
    },
  );
  assert.equal(rolledBack, true);

  let uidSearchCount = 0;
  client.search = async criteria => {
    if (criteria[0] === 'DELETED') return [];
    uidSearchCount += 1;
    return uidSearchCount === 1 ? [42] : [];
  };
  client.imap = {
    serverSupports(capability) {
      return capability === 'UIDPLUS';
    },
    copy(_uid, _targetMailbox, callback) {
      callback(null, '110');
    },
    addFlags(_uid, _flags, callback) {
      callback(null);
    },
    expunge(_uid, callback) {
      callback(new Error('response lost'));
    },
  };
  assert.deepEqual(await client.moveMessage(42, 'Archive'), { destinationUid: 110 });

  client.imap = {
    serverSupports(capability) {
      return capability === 'UIDPLUS';
    },
    copy(_uid, _targetMailbox, callback) {
      callback(null);
    },
    addFlags(_uid, _flags, callback) {
      callback(null);
    },
    expunge(_uid, callback) {
      callback(null);
    },
  };
  client.search = async () => [42];
  assert.deepEqual(await client.moveMessage(42, 'Archive'), {});

  client.imap = {
    serverSupports() {
      return false;
    },
    move() {
      throw new Error('unsafe fallback must not run');
    },
  };
  await assert.rejects(() => client.moveMessage(42, 'Archive'), /requires IMAP MOVE or UIDPLUS/);

  client.search = async () => [];
  client.imap = {
    serverSupports(capability) {
      return capability === 'MOVE';
    },
    move() {
      throw new Error('missing UID must not be moved');
    },
  };
  await assert.rejects(() => client.moveMessage(42, 'Archive'), /UID 42 was not found/);
});

test('IMAPClient clears wrapper mailbox state after SELECT fails', async () => {
  const client = new IMAPClient({
    host: 'imap.example.com',
    port: 993,
    username: 'sender@example.com',
    password: 'not-used',
  });
  client.authenticated = true;
  client.currentBox = 'INBOX';
  client.currentUidValidity = 7;
  client.imap = {
    openBox(_mailbox, _readOnly, callback) {
      callback(new Error('mailbox missing'));
    },
  };

  await assert.rejects(() => client.openBox('Missing', true), /mailbox missing/);
  assert.equal(client.getCurrentBox(), null);
  assert.equal(client.getCurrentUidValidity(), null);
});

test('IMAPClient requests RFC822 size by default', async () => {
  const client = new IMAPClient({
    host: 'imap.example.com',
    port: 993,
    username: 'sender@example.com',
    password: 'not-used',
  });
  let fetchOptions;
  client.currentBox = 'INBOX';
  client.currentUidValidity = 7;
  client.imap = {
    fetch(_uids, options) {
      fetchOptions = options;
      const fetch = new TestEventEmitter();
      queueMicrotask(() => fetch.emit('end'));
      return fetch;
    },
  };

  assert.deepEqual(await client.fetchMessages([42], { bodies: ['HEADER'] }), []);
  assert.equal(fetchOptions.size, true);
  assert.equal(fetchOptions.envelope, false);
  assert.equal(fetchOptions.struct, false);
});

test('IMAPClient reports an unavailable RFC822 size as null instead of zero', async () => {
  const client = new IMAPClient({
    host: 'imap.example.com',
    port: 993,
    username: 'sender@example.com',
    password: 'not-used',
  });
  client.currentBox = 'INBOX';
  client.currentUidValidity = 7;
  client.imap = {
    fetch() {
      const fetch = new TestEventEmitter();
      queueMicrotask(() => {
        const message = new TestEventEmitter();
        const stream = new TestEventEmitter();
        fetch.emit('message', message, 1);
        message.emit('body', stream, { which: 'HEADER' });
        stream.emit(
          'data',
          Buffer.from(
            'From: sender@example.com\r\nTo: receiver@example.com\r\nSubject: Size test\r\n\r\n',
          ),
        );
        stream.emit('end');
        message.emit('attributes', { uid: 42, flags: [], date: new Date() });
        message.emit('end');
        fetch.emit('end');
      });
      return fetch;
    },
  };

  const [message] = await client.fetchMessages([42], { bodies: ['HEADER'] });
  assert.equal(message.size, null);
  assert.equal(message.subject, 'Size test');
  assert.equal(message.html, undefined);
  assert.equal(Object.hasOwn(message, 'id'), false);
});

test('IMAPClient reports every missing UID before a batch read', async () => {
  const client = new IMAPClient({
    host: 'imap.example.com',
    port: 993,
    username: 'sender@example.com',
    password: 'not-used',
  });
  client.currentBox = 'INBOX';
  client.search = async criteria => {
    assert.deepEqual(criteria, [['UID', 1, 2, 3]]);
    return [1];
  };

  await assert.rejects(
    () => client.assertUIDsExist([1, 2, 3]),
    /UIDs 2, 3 were not found in mailbox INBOX/,
  );
});

test('IMAPClient applies the message limit to oversized header chunks', async () => {
  const client = new IMAPClient({
    host: 'imap.example.com',
    port: 993,
    username: 'sender@example.com',
    password: 'not-used',
    maxMessageBytes: 4,
  });
  client.currentBox = 'INBOX';
  client.currentUidValidity = 7;
  client.imap = {
    fetch() {
      const fetch = new TestEventEmitter();
      queueMicrotask(() => {
        const message = new TestEventEmitter();
        const stream = new TestEventEmitter();
        fetch.emit('message', message, 1);
        message.emit('body', stream, { which: 'HEADER' });
        stream.emit('data', Buffer.alloc(100, 'a'));
        stream.emit('end');
        message.emit('attributes', { uid: 42, flags: [], date: new Date(), size: 100 });
        message.emit('end');
        fetch.emit('end');
      });
      return fetch;
    },
  };

  const messages = await client.fetchMessages([42]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].subject, 'Message too large');
  assert.match(messages[0].text, /configured limit of 4 bytes/);
});

test('IMAPClient enforces a shared byte budget while body streams are buffered', async () => {
  const client = new IMAPClient({
    host: 'imap.example.com',
    port: 993,
    username: 'sender@example.com',
    password: 'not-used',
  });
  client.currentBox = 'INBOX';
  client.currentUidValidity = 7;
  client.imap = {
    fetch() {
      const fetch = new TestEventEmitter();
      queueMicrotask(() => {
        const message = new TestEventEmitter();
        const stream = new TestEventEmitter();
        fetch.emit('message', message, 1);
        message.emit('body', stream, { which: 'HEADER' });
        stream.emit('data', Buffer.alloc(100, 'a'));
        stream.emit('end');
        message.emit('attributes', { uid: 42, flags: [], date: new Date(), size: 100 });
        message.emit('end');
        fetch.emit('end');
      });
      return fetch;
    },
  };
  const byteBudget = { used: 0, limit: 10 };

  await assert.rejects(
    () => client.fetchMessages([42], { bodies: ['HEADER'], byteBudget }),
    (error: any) => {
      assert.equal(error instanceof FetchByteLimitError, true);
      assert.equal(error.used, 10);
      assert.equal(error.limit, 10);
      return true;
    },
  );
  assert.equal(byteBudget.used, 10);
});

test('IMAPClient appends sent messages as seen with an internal date', async () => {
  const client = new IMAPClient({
    host: 'imap.example.com',
    port: 993,
    username: 'sender@example.com',
    password: 'not-used',
  });
  client.connected = true;
  let openedReadWrite = false;
  client.openBox = async (mailbox, readOnly) => {
    assert.equal(mailbox, 'INBOX.Sent');
    assert.equal(readOnly, false);
    openedReadWrite = true;
    return { uidvalidity: 7 };
  };
  client.imap = {
    append(content, options, callback) {
      assert.equal(openedReadWrite, true);
      assert.equal(content.toString(), 'raw-message');
      assert.equal(options.mailbox, 'INBOX.Sent');
      assert.deepEqual(options.flags, ['\\Seen']);
      assert.ok(options.date instanceof Date);
      callback(null);
    },
  };

  await client.saveMessageToFolder(Buffer.from('raw-message'), 'INBOX.Sent');
});

test('IMAPClient classifies a connection loss during APPEND as unknown', async () => {
  const client = new IMAPClient({
    host: 'imap.example.com',
    port: 993,
    username: 'sender@example.com',
    password: 'not-used',
  });
  client.connected = true;
  client.openBox = async () => ({ uidvalidity: 7 });
  const imap = new TestEventEmitter();
  imap.append = () => {
    queueMicrotask(() => imap.emit('end'));
  };
  client.imap = imap;

  await assert.rejects(
    () => client.saveMessageToFolder(Buffer.from('raw-message'), 'INBOX.Sent'),
    (error: any) => {
      assert.equal(error instanceof SentAppendError, true);
      assert.equal(error.stage, 'append');
      assert.equal(error.outcome, 'unknown');
      assert.match(error.message, /connection ended before the server confirmed/);
      return true;
    },
  );
});

test('IMAPClient bounds attachment MIME buffering even when RFC822 size is unavailable', async () => {
  const client = new IMAPClient({
    host: 'imap.example.com',
    port: 993,
    username: 'sender@example.com',
    password: 'not-used',
  });
  client.currentBox = 'INBOX';
  client.imap = {
    fetch() {
      const fetch = new TestEventEmitter();
      queueMicrotask(() => {
        const message = new TestEventEmitter();
        const stream = new TestEventEmitter();
        fetch.emit('message', message);
        message.emit('body', stream);
        stream.emit('data', Buffer.from('12345'));
        stream.emit('end');
        fetch.emit('end');
      });
      return fetch;
    },
  };

  await assert.rejects(
    () => client.fetchMessageAttachments(42, 4),
    /attachment processing limit of 4 bytes/,
  );
});

test('IMAPClient permanently deletes only the selected UID', async () => {
  const client = new IMAPClient({
    host: 'imap.example.com',
    port: 993,
    username: 'sender@example.com',
    password: 'not-used',
  });
  client.currentBox = 'INBOX';
  client.search = async () => [42];
  client.openBox = async (mailbox, readOnly) => {
    assert.equal(mailbox, 'INBOX');
    assert.equal(readOnly, false);
    return { uidvalidity: 7 };
  };
  client.imap = {
    serverSupports(capability) {
      assert.equal(capability, 'UIDPLUS');
      return true;
    },
    addFlags(uid, flags, callback) {
      assert.equal(uid, 42);
      assert.deepEqual(flags, ['\\Deleted']);
      callback(null);
    },
    expunge(uid, callback) {
      assert.equal(uid, 42);
      callback(null);
    },
  };

  await client.deleteMessage(42);

  client.imap = {
    serverSupports() {
      return false;
    },
  };
  await assert.rejects(() => client.deleteMessage(42), /UIDPLUS/);

  client.search = async () => [];
  client.imap = {
    serverSupports() {
      return true;
    },
    addFlags() {
      throw new Error('missing UID must not be marked');
    },
  };
  await assert.rejects(() => client.deleteMessage(42), /UID 42 was not found/);
});

test('IMAPClient rechecks UIDVALIDITY after the deletion SELECT', async () => {
  const client = new IMAPClient({
    host: 'imap.example.com',
    port: 993,
    username: 'sender@example.com',
    password: 'not-used',
  });
  client.currentBox = 'INBOX';
  let marked = false;
  client.openBox = async () => ({ uidvalidity: 8 });
  client.search = async () => [42];
  client.imap = {
    serverSupports() {
      return true;
    },
    addFlags() {
      marked = true;
    },
  };

  await assert.rejects(() => client.deleteMessage(42, 7), /UIDVALIDITY changed.*expected 7, got 8/);
  assert.equal(marked, false);
});

test('IMAPClient removes the Deleted flag when targeted expunge fails', async () => {
  const client = new IMAPClient({
    host: 'imap.example.com',
    port: 993,
    username: 'sender@example.com',
    password: 'not-used',
  });
  client.currentBox = 'INBOX';
  let sourceDeleted = true;
  client.search = async criteria =>
    criteria[0] === 'DELETED' ? (sourceDeleted ? [42] : []) : [42];
  client.openBox = async () => ({ uidvalidity: 7 });
  let rolledBack = false;
  client.imap = {
    serverSupports() {
      return true;
    },
    addFlags(_uid, _flags, callback) {
      callback(null);
    },
    expunge(_uid, callback) {
      callback(new Error('expunge failed'));
    },
    delFlags(uid, flags, callback) {
      assert.equal(uid, 42);
      assert.deepEqual(flags, ['\\Deleted']);
      rolledBack = true;
      sourceDeleted = false;
      callback(null);
    },
  };

  await assert.rejects(
    () => client.deleteMessage(42),
    (error: any) => {
      assert.equal(error instanceof DeleteMessageError, true);
      assert.equal(error.stage, 'expunge');
      assert.equal(error.outcome, 'not-deleted');
      assert.equal(error.sourceState, 'present');
      assert.equal(error.sourceDeletedFlag, false);
      assert.match(error.message, /expunge failed/);
      return true;
    },
  );
  assert.equal(rolledBack, true);
});

test('IMAPClient treats an absent UID after an EXPUNGE response loss as deleted', async () => {
  const client = new IMAPClient({
    host: 'imap.example.com',
    port: 993,
    username: 'sender@example.com',
    password: 'not-used',
  });
  client.currentBox = 'INBOX';
  let uidSearchCount = 0;
  client.search = async criteria => {
    if (criteria[0] === 'DELETED') return [];
    uidSearchCount += 1;
    return uidSearchCount === 1 ? [42] : [];
  };
  client.openBox = async () => ({ uidvalidity: 7 });
  client.imap = {
    serverSupports() {
      return true;
    },
    addFlags(_uid, _flags, callback) {
      callback(null);
    },
    expunge(_uid, callback) {
      callback(new Error('response lost'));
    },
  };

  await client.deleteMessage(42);
  assert.equal(uidSearchCount, 2);
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
    await symlink(outsideRoot, path.join(allowedRoot, 'escape-link'));

    const policy = new FileAccessPolicy({ allowedRoots: [allowedRoot], maxAttachmentBytes: 4 });
    assert.equal((await policy.getReadableAttachmentPath(allowedFile)).size, 4);
    assert.equal((await policy.readAttachmentFile(allowedFile)).content.toString(), '1234');
    await assert.rejects(() => policy.getReadableAttachmentPath(oversizedFile), /configured limit/);
    await assert.rejects(
      () => policy.getReadableAttachmentPath(outsideFile),
      /outside MAIL_ALLOWED_ROOTS/,
    );
    assert.equal(
      await policy.prepareWritableDirectory(path.join(allowedRoot, 'downloads')),
      path.join(await realpath(allowedRoot), 'downloads'),
    );
    const firstSaved = await policy.writeNewFile(
      path.join(allowedRoot, 'downloads'),
      '../report.txt',
      Buffer.from('1234'),
    );
    const secondSaved = await policy.writeNewFile(
      path.join(allowedRoot, 'downloads'),
      'report.txt',
      Buffer.from('12'),
    );
    assert.equal(path.basename(firstSaved), 'report.txt');
    assert.equal(path.basename(secondSaved), 'report_1.txt');
    assert.equal((await readFile(firstSaved)).toString(), '1234');

    const downloadsPath = path.join(allowedRoot, 'downloads');
    const movedDownloadsPath = path.join(allowedRoot, 'downloads-moved');
    await rename(downloadsPath, movedDownloadsPath);
    await symlink(outsideRoot, downloadsPath);
    await assert.rejects(
      () => policy.writeNewFile(downloadsPath, 'escaped.txt', Buffer.from('1')),
      /resolves outside MAIL_ALLOWED_ROOTS/,
    );
    await assert.rejects(
      () => stat(path.join(outsideRoot, 'escaped.txt')),
      (error: any) => error.code === 'ENOENT',
    );
    await assert.rejects(
      () =>
        policy.prepareWritableDirectory(path.join(allowedRoot, 'escape-link', 'created-outside')),
      /resolves outside MAIL_ALLOWED_ROOTS/,
    );
    await assert.rejects(
      () => stat(path.join(outsideRoot, 'created-outside')),
      (error: any) => error.code === 'ENOENT',
    );
  } finally {
    await Promise.all([
      rm(allowedRoot, { recursive: true, force: true }),
      rm(outsideRoot, { recursive: true, force: true }),
    ]);
  }
});

test('appendSignature composes plain text and HTML alternatives safely', () => {
  assert.deepEqual(appendSignature('Hello', '<p>Hello</p>'), {
    text: 'Hello',
    html: '<p>Hello</p>',
  });

  assert.deepEqual(appendSignature('Hello', '<p>Hello</p>', { text: 'Regards,\nA < B' }), {
    text: 'Hello\n\nRegards,\nA < B',
    html: '<p>Hello</p><br><br><div class="mcp-mail-signature">Regards,<br>A &lt; B</div>',
  });

  assert.deepEqual(appendSignature('Hello', undefined, { html: '<strong>Sender</strong>' }), {
    text: 'Hello',
    html: 'Hello<br><br><div class="mcp-mail-signature"><strong>Sender</strong></div>',
  });
});

test('applyDefaultHtmlStyle gives HTML mail a cross-platform font stack without overriding explicit styles', () => {
  assert.equal(applyDefaultHtmlStyle(undefined), undefined);
  assert.doesNotMatch(DEFAULT_EMAIL_HTML_STYLE, /["']/);
  assert.equal(
    applyDefaultHtmlStyle('<p>Hello 你好</p>'),
    `<div style="${DEFAULT_EMAIL_HTML_STYLE}"><p>Hello 你好</p></div>`,
  );

  const fullDocument = applyDefaultHtmlStyle(
    '<html><body class="mail" style="font-size: 18px; color: red"><p>Hello</p></body></html>',
  );
  assert.match(fullDocument, /<body class="mail" style="font-family:/);
  assert.match(fullDocument, /color: #222; font-size: 18px; color: red"/);
  assert.equal((fullDocument.match(/<body\b/gi) || []).length, 1);
});

test('ensureHtmlAlternative derives safe HTML from text without removing the plain-text alternative', () => {
  assert.deepEqual(ensureHtmlAlternative({ text: 'Hello <team>\n你好' }), {
    text: 'Hello <team>\n你好',
    html: 'Hello &lt;team&gt;<br>你好',
  });
  assert.deepEqual(ensureHtmlAlternative({ text: 'Hello', html: '<p>Custom HTML</p>' }), {
    text: 'Hello',
    html: '<p>Custom HTML</p>',
  });
  assert.deepEqual(ensureHtmlAlternative({ html: '<p>HTML only</p>' }), {
    text: undefined,
    html: '<p>HTML only</p>',
  });
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
    'author@example.com',
  );

  assert.ok(reply.text.indexOf('Thanks') < reply.text.indexOf('Regards'));
  assert.ok(reply.text.indexOf('Regards') < reply.text.indexOf('On 2026-07-20'));
  assert.ok(reply.html.indexOf('mcp-mail-signature') < reply.html.indexOf('border-left'));
});

test('HTML-only replies preserve one alternative and quote original HTML as safe readable text', () => {
  const reply = appendQuotedOriginal(
    { html: '<p>Reply body</p>' },
    undefined,
    '<p>Original body</p>',
    '2026-07-20',
    'author@example.com',
  );

  assert.equal(reply.text, undefined);
  assert.match(reply.html, /<p>Reply body<\/p>/);
  assert.match(reply.html, /Original body/);
  assert.doesNotMatch(reply.html, /<p>Original body<\/p>/);
  assert.doesNotMatch(reply.html, /&lt;p&gt;Original body/);
});

test('text-only replies quote HTML-only originals and truncate oversized quotes', () => {
  const htmlOnlyOriginal = appendQuotedOriginal(
    { text: 'Reply body' },
    undefined,
    '<p>Original HTML body</p>',
    '2026-07-20',
    'author@example.com',
  );
  assert.match(htmlOnlyOriginal.text, /Original HTML body/);

  const bounded = appendQuotedOriginal(
    { text: 'Reply body', html: '<p>Reply body</p>' },
    'x & < > '.repeat(100),
    undefined,
    '2026-07-20',
    'author@example.com',
    300,
  );
  assert.ok(bounded.text.length <= 300);
  assert.ok(bounded.html.length <= 300);
  assert.match(bounded.text, /quoted content truncated/);
  assert.match(bounded.html, /quoted content truncated/);
});

test('tool input schemas are enforced by Zod registrations', () => {
  const replyTool = MAIL_TOOLS.find(tool => tool.name === 'reply_to_email');
  const sendTool = MAIL_TOOLS.find(tool => tool.name === 'send_email');
  const continueTool = MAIL_TOOLS.find(tool => tool.name === 'continue_email_thread');
  assert.ok(replyTool);
  assert.ok(sendTool);
  assert.ok(continueTool);

  const invalidBoolean = replyTool.inputSchema.safeParse({
    mailbox: 'INBOX',
    originalUid: 1,
    text: 'Reply',
    replyToAll: 'false',
  });
  assert.equal(invalidBoolean.success, false);
  assert.equal(invalidBoolean.error.issues[0].path.join('.'), 'replyToAll');

  const unknownProperty = replyTool.inputSchema.safeParse({
    mailbox: 'INBOX',
    originalUid: 1,
    text: 'Reply',
    unexpected: true,
  });
  assert.equal(unknownProperty.success, false);
  assert.equal(unknownProperty.error.issues[0].code, 'unrecognized_keys');

  const tooManyAttachments = sendTool.inputSchema.safeParse({
    to: 'recipient@example.com',
    subject: 'Test',
    text: 'Body',
    attachments: Array.from({ length: 21 }, (_, index) => `/tmp/${index}`),
  });
  assert.equal(tooManyAttachments.success, false);
  assert.equal(tooManyAttachments.error.issues[0].path.join('.'), 'attachments');

  const oversizedSubject = sendTool.inputSchema.safeParse({
    to: 'recipient@example.com',
    subject: 'x'.repeat(999),
    text: 'Body',
  });
  assert.equal(oversizedSubject.success, false);
  assert.equal(oversizedSubject.error.issues[0].path.join('.'), 'subject');

  const oversizedMailbox = replyTool.inputSchema.safeParse({
    mailbox: 'x'.repeat(1025),
    originalUid: 1,
    text: 'Reply',
  });
  assert.equal(oversizedMailbox.success, false);
  assert.equal(oversizedMailbox.error.issues[0].path.join('.'), 'mailbox');

  assert.deepEqual(
    replyTool.inputSchema.parse({
      mailbox: 'INBOX',
      originalUid: 1,
      html: '<p>Reply</p>',
      replyToAll: false,
    }),
    {
      mailbox: 'INBOX',
      originalUid: 1,
      html: '<p>Reply</p>',
      replyToAll: false,
      includeOriginal: true,
    },
  );
  const missingBody = continueTool.inputSchema.safeParse({
    subject: 'Weekly report',
    recipient: 'team@example.com',
  });
  assert.equal(missingBody.success, false);
  assert.equal(missingBody.error.issues[0].code, 'custom');

  assert.deepEqual(
    continueTool.inputSchema.parse({
      subject: 'Weekly report',
      text: 'This week...',
      replyToAll: true,
      includeOriginal: false,
    }),
    {
      subject: 'Weekly report',
      text: 'This week...',
      replyToAll: true,
      includeOriginal: false,
    },
  );
});

test('SMTPClient clears stale state when live verification fails', async () => {
  const client = new SMTPClient({
    host: 'smtp.example.com',
    port: 465,
    secure: true,
    username: 'sender@example.com',
    password: 'not-used',
  });
  let closed = false;
  client.transporter = {
    async verify() {
      throw new Error('server unavailable');
    },
    close() {
      closed = true;
    },
  };

  await assert.rejects(() => client.verifyConnection(), /server unavailable/);
  assert.equal(closed, true);
  assert.equal(client.isConnected(), false);
});

test('MailConnectionManager revalidates and refreshes a cached sent mailbox', async () => {
  const [{ MailConnectionManager }] = await loadMailRuntime();
  const manager = new MailConnectionManager();
  let boxListCalls = 0;
  const opened = [];
  manager.imapClient = {
    async getBoxes() {
      boxListCalls += 1;
      const name = boxListCalls === 1 ? 'Sent' : 'Sent Items';
      return {
        [name]: { attribs: ['\\Sent'], delimiter: '.', children: null },
      };
    },
    async openBox(mailbox) {
      opened.push(mailbox);
      if (mailbox === 'Sent' && opened.filter(name => name === 'Sent').length > 1) {
        throw new Error('mailbox renamed');
      }
      return { uidvalidity: 9 };
    },
  };

  assert.equal(await manager.findSentMailbox(), 'Sent');
  assert.equal(await manager.findSentMailbox(), 'Sent Items');
  assert.deepEqual(opened, ['Sent', 'Sent', 'Sent Items']);
  assert.equal(boxListCalls, 2);
});

test('MailConnectionManager skips an unselectable mailbox advertised as Sent', async () => {
  const [{ MailConnectionManager }] = await loadMailRuntime();
  const manager = new MailConnectionManager();
  const opened = [];
  manager.imapClient = {
    async getBoxes() {
      return {
        BrokenSent: { attribs: ['\\Sent'], delimiter: '.', children: null },
      };
    },
    async openBox(mailbox) {
      opened.push(mailbox);
      if (mailbox === 'BrokenSent') throw new Error('not selectable');
      if (mailbox === 'Sent') return { uidvalidity: 9 };
      throw new Error('missing');
    },
  };

  assert.equal(await manager.findSentMailbox(), 'Sent');
  assert.deepEqual(opened, ['BrokenSent', 'INBOX.Sent', 'Sent']);
});

test('MailConnectionManager tries every mailbox advertised as Sent before name fallbacks', async () => {
  const [{ MailConnectionManager }] = await loadMailRuntime();
  const manager = new MailConnectionManager();
  const opened = [];
  manager.imapClient = {
    async getBoxes() {
      return {
        BrokenSent: { attribs: ['\\Sent'], delimiter: '.', children: null },
        Archive: {
          attribs: ['\\Noselect'],
          delimiter: '/',
          children: {
            Outbound: { attribs: ['\\Sent'], delimiter: '/', children: null },
          },
        },
      };
    },
    async openBox(mailbox) {
      opened.push(mailbox);
      if (mailbox === 'BrokenSent') throw new Error('not selectable');
      if (mailbox === 'Archive/Outbound') return { uidvalidity: 10 };
      throw new Error('unexpected fallback');
    },
  };

  assert.equal(await manager.findSentMailbox(), 'Archive/Outbound');
  assert.deepEqual(opened, ['BrokenSent', 'Archive/Outbound']);
});

test('MailConnectionManager preserves case-distinct sent mailbox candidates outside INBOX', async () => {
  const [{ MailConnectionManager }] = await loadMailRuntime();
  const manager = new MailConnectionManager();
  manager.imapClient = {
    async getBoxes() {
      return {
        Sent: { attribs: ['\\Sent'], delimiter: '.', children: null },
        SENT: { attribs: ['\\Sent'], delimiter: '.', children: null },
      };
    },
  };

  const candidates = await manager.getSentMailboxCandidates(false);
  assert.deepEqual(candidates.slice(0, 2), ['Sent', 'SENT']);
  assert.equal(candidates.filter(name => name === 'Sent').length, 1);
  assert.equal(candidates.filter(name => name === 'SENT').length, 1);
});

test('MailMCPServer falls back to the next sent mailbox only after a definite non-append', async () => {
  const [, { MailMCPServer }] = await loadMailRuntime();
  const server = new MailMCPServer({ registerProcessHandlers: false });
  const attempts = [];
  let remembered;
  server.connections = {
    ensure: async () => {},
    smtp: {
      async buildRawMessage() {
        return Buffer.from('raw message');
      },
    },
    async getSentMailboxCandidates() {
      return ['ReadOnlySent', 'Sent'];
    },
    imap: {
      async saveMessageToFolder(_raw, mailbox) {
        attempts.push(mailbox);
        if (mailbox === 'ReadOnlySent') {
          throw new SentAppendError('read-only mailbox', 'select', 'not-appended');
        }
      },
    },
    invalidateSentMailbox() {},
    rememberSentMailbox(mailbox) {
      remembered = mailbox;
    },
  };

  const result = await server.saveSentMessage(
    {
      to: 'recipient@example.com',
      subject: 'Sent fallback',
      text: 'Body',
    },
    '<fallback@example.com>',
  );
  assert.deepEqual(result, { saved: true, mailbox: 'Sent' });
  assert.deepEqual(attempts, ['ReadOnlySent', 'Sent']);
  assert.equal(remembered, 'Sent');
});

test('MailMCPServer stops sent fallback when APPEND outcome is ambiguous', async () => {
  const [, { MailMCPServer }] = await loadMailRuntime();
  const server = new MailMCPServer({ registerProcessHandlers: false });
  const attempts = [];
  server.connections = {
    ensure: async () => {},
    smtp: {
      async buildRawMessage() {
        return Buffer.from('raw message');
      },
    },
    async getSentMailboxCandidates() {
      return ['Sent', 'Sent Items'];
    },
    imap: {
      async saveMessageToFolder(_raw, mailbox) {
        attempts.push(mailbox);
        throw new SentAppendError('connection closed during APPEND', 'append', 'unknown');
      },
    },
    invalidateSentMailbox() {},
    rememberSentMailbox() {},
  };

  const result = await server.saveSentMessage({
    to: 'recipient@example.com',
    subject: 'Ambiguous append',
    text: 'Body',
  });
  assert.equal(result.saved, false);
  assert.equal(result.error.code, 'IMAP_APPEND_FAILED');
  assert.equal(result.error.attempts[0].outcome, 'unknown');
  assert.deepEqual(attempts, ['Sent']);
});

test('MailMCPServer classifies all sent mailbox selection failures as detection failure', async () => {
  const [, { MailMCPServer }] = await loadMailRuntime();
  const server = new MailMCPServer({ registerProcessHandlers: false });
  server.connections = {
    ensure: async () => {},
    smtp: {
      async buildRawMessage() {
        return Buffer.from('raw message');
      },
    },
    async getSentMailboxCandidates() {
      return ['MissingSent', 'Sent Items'];
    },
    imap: {
      async saveMessageToFolder(_raw, mailbox) {
        throw new SentAppendError(`${mailbox} is not selectable`, 'select', 'not-appended');
      },
    },
    invalidateSentMailbox() {},
    rememberSentMailbox() {},
  };

  const result = await server.saveSentMessage({
    to: 'recipient@example.com',
    subject: 'No sent mailbox',
    text: 'Body',
  });
  assert.equal(result.saved, false);
  assert.equal(result.error.stage, 'detect');
  assert.equal(result.error.code, 'SENT_MAILBOX_NOT_FOUND');
  assert.equal(result.error.attempts.length, 2);
  await server.server.close();
});

test('MailMCPServer continues the latest sent thread with report-history defaults', async () => {
  const [, { MailMCPServer }] = await loadMailRuntime();
  const server = new MailMCPServer({ registerProcessHandlers: false });
  let lookup;
  let delegatedReply;
  server.searchService = {
    async findLatestSentMessage(args) {
      lookup = args;
      return {
        sourceMailbox: 'Sent',
        uid: 42,
        uidValidity: 9,
        messageId: '<weekly@example.com>',
      };
    },
  };
  server.handleReplyToEmail = async args => {
    delegatedReply = args;
    return { content: [{ type: 'text', text: '{"sent":true}' }] };
  };

  const response = await server.handleContinueEmailThread({
    subject: 'Weekly report',
    recipient: 'team@example.com',
    since: '2026-01-01',
    text: 'This week...',
  });
  assert.deepEqual(lookup, {
    subject: 'Weekly report',
    recipient: 'team@example.com',
    since: '2026-01-01',
  });
  assert.deepEqual(delegatedReply, {
    mailbox: 'Sent',
    originalUid: 42,
    uidValidity: 9,
    text: 'This week...',
    html: undefined,
    signature: undefined,
    replyToAll: true,
    includeOriginal: true,
  });
  assert.equal(JSON.parse(response.content[0].text).sent, true);

  server.searchService.findLatestSentMessage = async () => ({
    sourceMailbox: 'Sent',
    uid: 43,
    uidValidity: 9,
  });
  await assert.rejects(
    () => server.handleContinueEmailThread({ subject: 'Weekly report', text: 'Next' }),
    /has no Message-ID and cannot be continued safely/,
  );
  await server.server.close();
});

test('MailMCPServer rejects incomplete batch reads and returns a complete moved reference', async () => {
  const [, { MailMCPServer }] = await loadMailRuntime();
  const server = new MailMCPServer({ registerProcessHandlers: false });
  let fetchCalled = false;
  server.connections = {
    ensure: async () => {},
    imap: {
      async openBox() {
        return { uidvalidity: 7 };
      },
      async assertUIDsExist() {
        throw new Error('Message with UID 999 was not found in mailbox INBOX');
      },
      async fetchMessages() {
        fetchCalled = true;
        return [];
      },
    },
  };
  await assert.rejects(
    () => server.handleGetMessages({ mailbox: 'INBOX', uids: [1, 999] }),
    /UID 999 was not found/,
  );
  assert.equal(fetchCalled, false);

  server.connections = {
    ensure: async () => {},
    imap: {
      async openBox(mailbox) {
        return { uidvalidity: mailbox === 'INBOX' ? 7 : 9 };
      },
      async moveMessage() {
        return { destinationUid: 88 };
      },
    },
  };
  const response = await server.handleMoveMessage({
    mailbox: 'INBOX',
    uid: 1,
    uidValidity: 7,
    targetMailbox: 'Archive',
  });
  const moved = JSON.parse(response.content[0].text);
  assert.equal(moved.sourceUidValidity, 7);
  assert.equal(moved.destinationUid, 88);
  assert.equal(moved.destinationUidValidity, 9);

  server.connections = {
    ensure: async () => {},
    imap: {
      async openBox(mailbox) {
        return { uidvalidity: mailbox === 'INBOX' ? 7 : 9 };
      },
      async moveMessage() {
        throw new PartialMoveError('IMAP MOVE partially completed: source cleanup failed', 89);
      },
    },
  };
  const partialResponse = await server.handleMoveMessage({
    mailbox: 'INBOX',
    uid: 2,
    uidValidity: 7,
    targetMailbox: 'Archive',
  });
  const partial = JSON.parse(partialResponse.content[0].text);
  assert.equal(partialResponse.isError, true);
  assert.equal(partial.partial, true);
  assert.equal(partial.copySucceeded, true);
  assert.equal(partial.destinationUid, 89);
  assert.equal(partial.destinationUidValidity, 9);
  assert.match(partial.note, /Do not retry blindly/);

  server.connections.imap.moveMessage = async () => {
    throw new PartialMoveError(
      'IMAP MOVE partially completed without COPYUID',
      undefined,
      'present',
    );
  };
  const noCopyUidResponse = await server.handleMoveMessage({
    mailbox: 'INBOX',
    uid: 3,
    uidValidity: 7,
    targetMailbox: 'Archive',
  });
  const noCopyUid = JSON.parse(noCopyUidResponse.content[0].text);
  assert.equal(noCopyUidResponse.isError, true);
  assert.equal(noCopyUid.copySucceeded, true);
  assert.equal(noCopyUid.sourceState, 'present');
  assert.equal(noCopyUid.destinationUid, undefined);
  assert.match(noCopyUid.note, /server did not return its UID/);

  server.connections.imap.moveMessage = async () => {
    throw new PartialMoveError(
      'IMAP MOVE outcome could not be confirmed',
      undefined,
      'unknown',
      undefined,
      'unknown',
    );
  };
  const unknownMoveResponse = await server.handleMoveMessage({
    mailbox: 'INBOX',
    uid: 4,
    uidValidity: 7,
    targetMailbox: 'Archive',
  });
  const unknownMove = JSON.parse(unknownMoveResponse.content[0].text);
  assert.equal(unknownMoveResponse.isError, true);
  assert.equal(unknownMove.copySucceeded, false);
  assert.equal(unknownMove.copyOutcome, 'unknown');
  assert.match(unknownMove.note, /move or copy command could be confirmed/);
  await server.server.close();
});

test('MailMCPServer reports attachment files saved before a later write failure', async () => {
  const [, { MailMCPServer }] = await loadMailRuntime();
  const server = new MailMCPServer({ registerProcessHandlers: false });
  server.connections = {
    ensure: async () => {},
    imap: {
      async fetchMessageAttachments() {
        return [
          {
            index: 0,
            filename: 'first.txt',
            contentType: 'text/plain',
            size: 5,
            content: Buffer.from('first'),
          },
          {
            index: 1,
            filename: 'second.txt',
            contentType: 'text/plain',
            size: 6,
            content: Buffer.from('second'),
          },
        ];
      },
    },
  };
  server.getMessageByRef = async () => ({
    uid: 42,
    sourceMailbox: 'INBOX',
    uidValidity: 7,
    flags: [],
    date: '2026-07-20T00:00:00.000Z',
    size: 100,
    subject: 'Attachments',
    from: 'sender@example.com',
    to: 'recipient@example.com',
  });
  let writes = 0;
  server.fileAccessPolicy = {
    async writeNewFile(_directory, filename) {
      writes += 1;
      if (writes === 2) throw new Error('disk full');
      return `/allowed/${filename}`;
    },
  };

  const response = await server.handleSaveAttachment({
    mailbox: 'INBOX',
    uid: 42,
    uidValidity: 7,
    savePath: '/allowed',
  });
  const result = JSON.parse(response.content[0].text);
  assert.equal(response.isError, true);
  assert.equal(result.partial, true);
  assert.equal(result.savedCount, 1);
  assert.equal(result.savedFiles[0].savedPath, '/allowed/first.txt');
  assert.equal(result.failedAttachment.index, 1);
  assert.match(result.note, /avoid duplicate files/);
  await server.server.close();
});

test('MailMCPServer exposes an ambiguous permanent deletion as a structured error', async () => {
  const [, { MailMCPServer }] = await loadMailRuntime();
  const server = new MailMCPServer({ registerProcessHandlers: false });
  server.connections = {
    ensure: async () => {},
    imap: {
      async openBox() {
        return { uidvalidity: 7 };
      },
      async deleteMessage(uid, uidValidity) {
        assert.equal(uid, 42);
        assert.equal(uidValidity, 7);
        throw new DeleteMessageError(
          'connection closed after UID EXPUNGE',
          'expunge',
          'unknown',
          'unknown',
        );
      },
    },
  };

  const response = await server.handleDeleteMessage({
    mailbox: 'INBOX',
    uid: 42,
    uidValidity: 7,
  });
  const result = JSON.parse(response.content[0].text);
  assert.equal(response.isError, true);
  assert.equal(result.deleted, false);
  assert.equal(result.partial, true);
  assert.equal(result.outcome, 'unknown');
  assert.equal(result.sourceState, 'unknown');
  assert.match(result.note, /Refresh the mailbox reference/);
  await server.server.close();
});

test('reply-all preserves Reply-To, To, and CC recipients while excluding the account', () => {
  assert.deepEqual(
    extractEmailsFromAddressField({
      value: [
        { name: 'First', address: 'first@example.com' },
        {
          name: 'Team',
          group: [{ address: 'second@example.com' }, { address: 'third@example.com' }],
        },
      ],
      text: 'First <first@example.com>, Team: second@example.com, third@example.com;',
    }),
    ['first@example.com', 'second@example.com', 'third@example.com'],
  );

  assert.deepEqual(
    buildReplyRecipients(
      'Sender <sender@example.com>',
      'team@example.com, backup@example.com',
      'Me <me@example.com>, colleague@example.com',
      'Other <other@example.com>, TEAM@example.com',
      ['me@example.com', 'imap-login'],
      true,
    ),
    {
      to: ['team@example.com', 'backup@example.com'],
      cc: ['colleague@example.com', 'other@example.com'],
    },
  );

  assert.deepEqual(
    buildReplyRecipients(
      'me@example.com',
      undefined,
      'recipient@example.com',
      undefined,
      ['me@example.com'],
      false,
    ),
    { to: ['recipient@example.com'], cc: [] },
  );
});

test('raw sent copy preserves attachments and reply threading headers', async () => {
  const client = new SMTPClient({
    host: 'smtp.example.com',
    port: 465,
    secure: true,
    username: 'smtp-login',
    password: 'not-used',
    fromAddress: 'sender@example.com',
  });

  const raw = await client.buildRawMessage(
    {
      to: 'recipient@example.com',
      subject: 'Attachment test',
      text: 'Hello',
      inReplyTo: '<original@example.com>',
      references: ['<root@example.com>', '<original@example.com>'],
      attachments: [
        {
          filename: 'evidence.txt',
          content: Buffer.from('attachment-content'),
        },
      ],
    },
    '<reply@example.com>',
  );

  const message = raw.toString('utf8');
  assert.match(message, /From: sender@example\.com/i);
  assert.match(message, /Message-ID: <reply@example\.com>/i);
  assert.match(message, /In-Reply-To: <original@example\.com>/i);
  assert.match(message, /References: <root@example\.com> <original@example\.com>/i);
  assert.match(message, /filename=evidence\.txt/i);
  assert.match(message, /YXR0YWNobWVudC1jb250ZW50/);
});

test('raw MIME output contains the composed signature and default HTML typography', async () => {
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
    html: applyDefaultHtmlStyle(content.html),
  });
  const message = raw.toString('utf8');

  assert.match(message, /Regards, Sender/);
  assert.match(message, /mcp-mail-signature/);
  assert.match(message, /font-family: -apple-system/);
  assert.match(message, /PingFang SC/);
});

test('text-only input can produce a styled multipart alternative without losing text/plain', async () => {
  const client = new SMTPClient({
    host: 'smtp.example.com',
    port: 465,
    secure: true,
    username: 'sender@example.com',
    password: 'not-used',
  });
  const content = ensureHtmlAlternative({ text: 'Hello <team>\n你好' });

  const raw = await client.buildRawMessage({
    to: 'recipient@example.com',
    subject: 'Text alternative test',
    text: content.text,
    html: applyDefaultHtmlStyle(content.html),
  });
  const message = raw.toString('utf8');
  const parsed = await simpleParser(raw);
  const parsedHtml = typeof parsed.html === 'string' ? parsed.html : '';

  assert.match(message, /Content-Type: multipart\/alternative/i);
  assert.match(message, /Content-Type: text\/plain/i);
  assert.match(message, /Content-Type: text\/html/i);
  assert.equal(parsed.text?.trim(), 'Hello <team>\n你好');
  assert.match(parsedHtml, /font-family: -apple-system/);
  assert.match(parsedHtml, /Hello &lt;team&gt;<br>你好/);
});

test('MailSearchService finds the newest exact sent thread after normalizing reply prefixes', async () => {
  let connectionChecks = 0;
  let searchCriteria;
  const service = new MailSearchService({
    ensureIMAPConnection: async () => {
      connectionChecks += 1;
    },
    getIMAPClient: () => ({
      async openBox(mailbox) {
        assert.equal(mailbox, 'Sent');
        return { uidvalidity: 91 };
      },
      async search(criteria) {
        searchCriteria = criteria;
        return [1, 2, 3];
      },
      async fetchMessages() {
        return [
          {
            uid: 1,
            sourceMailbox: 'Sent',
            uidValidity: 91,
            date: '2026-07-20T12:00:00Z',
            subject: 'Weekly report extra',
          },
          {
            uid: 2,
            sourceMailbox: 'Sent',
            uidValidity: 91,
            date: '2026-07-18T12:00:00Z',
            subject: 'Weekly report',
          },
          {
            uid: 3,
            sourceMailbox: 'Sent',
            uidValidity: 91,
            date: '2026-07-19T12:00:00Z',
            subject: 'Re: Weekly report',
          },
        ];
      },
    }),
    findSentMailbox: async () => 'Sent',
    maxBodyCharacters: 100,
    maxResponseCharacters: 1000,
    maxSearchCandidates: 10,
    maxSearchHeaderBytes: 1024,
  });

  const message = await service.findLatestSentMessage({
    subject: 'Re: Weekly report',
    recipient: 'team@example.com',
    since: '2026-07-01',
  });
  assert.equal(connectionChecks, 1);
  assert.equal(message.uid, 3);
  assert.deepEqual(searchCriteria.slice(0, 2), [
    ['TO', 'team@example.com'],
    ['SUBJECT', 'Weekly report'],
  ]);
  assert.equal(searchCriteria[2][0], 'SINCE');
});

test('MailSearchService applies the limit after sorting all bounded candidates by date', async () => {
  const fetchedUIDs = [];
  const service = new MailSearchService({
    ensureIMAPConnection: async () => {},
    getIMAPClient: () => ({
      async openBox() {
        return { uidvalidity: 91 };
      },
      async search() {
        return [1, 2];
      },
      async fetchMessages(uids) {
        fetchedUIDs.push(...uids);
        return [
          { uid: 1, sourceMailbox: 'INBOX', uidValidity: 91, date: '2026-07-20T12:00:00Z' },
          { uid: 2, sourceMailbox: 'INBOX', uidValidity: 91, date: '2026-07-19T12:00:00Z' },
        ];
      },
    }),
    findSentMailbox: async () => null,
    maxBodyCharacters: 100,
    maxResponseCharacters: 1000,
    maxSearchCandidates: 10,
    maxSearchHeaderBytes: 1024,
  });

  const response = await service.searchMessages({ mailboxes: ['INBOX'], limit: 1 });
  const result = JSON.parse(response.content[0].text);
  assert.deepEqual(fetchedUIDs, [1, 2]);
  assert.equal(result.totalMatches, 2);
  assert.equal(result.returnedCount, 1);
  assert.equal(result.messages[0].uid, 1);
});

test('MailSearchService applies exact date ranges before the response limit', async () => {
  let currentMailbox;
  const fetches = [];
  const fakeIMAPClient = {
    async openBox(mailbox) {
      assert.equal(mailbox, 'INBOX');
      currentMailbox = mailbox;
      return { uidvalidity: 91 };
    },
    async search(criteria) {
      assert.deepEqual(criteria.slice(0, 1), [['FROM', 'sender@example.com']]);
      assert.equal(criteria[1][0], 'SINCE');
      assert.equal(criteria[2][0], 'BEFORE');
      assert.deepEqual(
        [criteria[1][1].getFullYear(), criteria[1][1].getMonth(), criteria[1][1].getDate()],
        [2025, 11, 30],
      );
      assert.deepEqual(
        [criteria[2][1].getFullYear(), criteria[2][1].getMonth(), criteria[2][1].getDate()],
        [2026, 0, 4],
      );
      return [1, 2, 3];
    },
    async fetchMessages(uids, options) {
      assert.equal(currentMailbox, 'INBOX');
      fetches.push({ uids, options });
      if (options.bodies?.length === 1 && options.bodies[0].startsWith('HEADER.FIELDS')) {
        return [
          {
            uid: 1,
            sourceMailbox: 'INBOX',
            uidValidity: 91,
            date: '2026-01-01T12:00:00Z',
            text: 'header only',
          },
          {
            uid: 2,
            sourceMailbox: 'INBOX',
            uidValidity: 91,
            date: '2026-01-02T12:00:00Z',
            text: 'outside range',
          },
          {
            uid: 3,
            sourceMailbox: 'INBOX',
            uidValidity: 91,
            date: '2026-01-03T12:00:00Z',
            text: 'outside range',
          },
        ];
      }
      return [
        {
          uid: 1,
          sourceMailbox: 'INBOX',
          uidValidity: 91,
          date: '2026-01-01T12:00:00Z',
          text: '123456789',
        },
      ];
    },
  };
  let connectionChecks = 0;
  const service = new MailSearchService({
    ensureIMAPConnection: async () => {
      connectionChecks += 1;
    },
    getIMAPClient: () => fakeIMAPClient,
    findSentMailbox: async () => null,
    maxBodyCharacters: 5,
    maxResponseCharacters: 1000,
    maxSearchCandidates: 5000,
    maxSearchHeaderBytes: 1024 * 1024,
  });

  const response = await service.searchMessages({
    mailboxes: ['INBOX'],
    from: 'sender@example.com',
    since: '2026-01-01',
    before: '2026-01-02',
    limit: 1,
    includeBody: true,
  });
  const result = JSON.parse(response.content[0].text);

  assert.equal(connectionChecks, 1);
  assert.equal(result.totalMatches, 1);
  assert.equal(result.returnedCount, 1);
  assert.equal(result.hasMore, false);
  assert.equal(result.messages[0].sourceMailbox, 'INBOX');
  assert.equal(result.messages[0].uidValidity, 91);
  assert.equal(result.messages[0].text, '12345\n\n[truncated]');
  assert.equal(result.messages[0].textTruncated, true);
  assert.deepEqual(
    fetches.map(fetch => fetch.uids),
    [[1, 2, 3], [1]],
  );
});

test('MailSearchService rejects unbounded exact-date candidate sets', async () => {
  const service = new MailSearchService({
    ensureIMAPConnection: async () => {},
    getIMAPClient: () => ({
      async openBox() {
        return { uidvalidity: 91 };
      },
      async search() {
        return [1, 2];
      },
    }),
    findSentMailbox: async () => null,
    maxBodyCharacters: 100,
    maxResponseCharacters: 1000,
    maxSearchCandidates: 1,
    maxSearchHeaderBytes: 1024 * 1024,
  });

  await assert.rejects(
    () => service.searchMessages({ mailboxes: ['INBOX'], since: '2026-01-01' }),
    /MAIL_MAX_SEARCH_CANDIDATES=1/,
  );
  await assert.rejects(
    () => service.searchMessages({ mailboxes: ['INBOX'], since: '2026-02-30' }),
    /valid calendar date/,
  );
});

test('MailSearchService enforces one candidate budget across all mailboxes', async () => {
  let currentMailbox;
  const service = new MailSearchService({
    ensureIMAPConnection: async () => {},
    getIMAPClient: () => ({
      async openBox(mailbox) {
        currentMailbox = mailbox;
        return { uidvalidity: mailbox === 'INBOX' ? 91 : 92 };
      },
      async search() {
        return currentMailbox === 'INBOX' ? [1, 2] : [3, 4];
      },
      async fetchMessages(uids) {
        return uids.map(uid => ({
          uid,
          sourceMailbox: currentMailbox,
          uidValidity: currentMailbox === 'INBOX' ? 91 : 92,
          date: '2026-01-01T12:00:00Z',
        }));
      },
    }),
    findSentMailbox: async () => null,
    maxBodyCharacters: 100,
    maxResponseCharacters: 1000,
    maxSearchCandidates: 3,
    maxSearchHeaderBytes: 1024 * 1024,
  });

  await assert.rejects(
    () =>
      service.searchMessages({
        mailboxes: ['INBOX', 'Archive'],
        since: '2026-01-01',
      }),
    /would inspect 4 message headers across the request/,
  );
});

test('MailSearchService enforces the candidate budget without date filters', async () => {
  let fetchCalled = false;
  const service = new MailSearchService({
    ensureIMAPConnection: async () => {},
    getIMAPClient: () => ({
      async openBox() {
        return { uidvalidity: 91 };
      },
      async search() {
        return [1, 2];
      },
      async fetchMessages() {
        fetchCalled = true;
        return [];
      },
    }),
    findSentMailbox: async () => null,
    maxBodyCharacters: 100,
    maxResponseCharacters: 1000,
    maxSearchCandidates: 1,
    maxSearchHeaderBytes: 1024 * 1024,
  });

  await assert.rejects(
    () => service.searchMessages({ mailboxes: ['INBOX', 'Archive'], limit: 2 }),
    /would inspect 2 message headers/,
  );
  assert.equal(fetchCalled, false);
});

test('MailSearchService enforces an aggregate inspected-header byte budget', async () => {
  let fetchCalls = 0;
  const service = new MailSearchService({
    ensureIMAPConnection: async () => {},
    getIMAPClient: () => ({
      async openBox() {
        return { uidvalidity: 91 };
      },
      async search() {
        return [1];
      },
      async fetchMessages(_uids, options) {
        fetchCalls += 1;
        assert.deepEqual(options.byteBudget, { used: 0, limit: 16 });
        options.byteBudget.used = options.byteBudget.limit;
        throw new FetchByteLimitError(options.byteBudget.used, options.byteBudget.limit);
      },
    }),
    findSentMailbox: async () => null,
    maxBodyCharacters: 100,
    maxResponseCharacters: 1000,
    maxSearchCandidates: 10,
    maxSearchHeaderBytes: 16,
  });

  await assert.rejects(
    () => service.searchMessages({ mailboxes: ['INBOX'], limit: 1 }),
    (error: any) => {
      assert.match(error.message, /MAIL_MAX_SEARCH_HEADER_BYTES=16/);
      assert.doesNotMatch(error.message, /or limit/);
      return true;
    },
  );
  assert.equal(fetchCalls, 1);
});

test('MailSearchService rejects unsafe custom IMAP keywords before connecting', async () => {
  let connectionChecks = 0;
  const service = new MailSearchService({
    ensureIMAPConnection: async () => {
      connectionChecks += 1;
    },
    getIMAPClient: () => {
      throw new Error('must not connect');
    },
    findSentMailbox: async () => null,
    maxBodyCharacters: 100,
    maxResponseCharacters: 1000,
    maxSearchCandidates: 10,
    maxSearchHeaderBytes: 1024,
  });

  await assert.rejects(
    () =>
      service.searchMessages({
        mailboxes: ['INBOX'],
        keywords: ['safe\r\nA1 NOOP'],
      }),
    /unsafe in an IMAP keyword/,
  );
  await assert.rejects(
    () =>
      service.searchMessages({
        mailboxes: ['INBOX'],
        keywords: ['\\Seen'],
      }),
    /unsafe in an IMAP keyword/,
  );
  assert.equal(connectionChecks, 0);
});

test('MailSearchService preserves case-distinct mailbox names except INBOX', async () => {
  const opened = [];
  let currentMailbox = '';
  const service = new MailSearchService({
    ensureIMAPConnection: async () => {},
    getIMAPClient: () => ({
      async openBox(mailbox) {
        currentMailbox = mailbox;
        opened.push(mailbox);
        return { uidvalidity: mailbox === 'Archive' ? 91 : 92 };
      },
      async search() {
        return [currentMailbox === 'Archive' ? 1 : 2];
      },
      async fetchMessages(uids) {
        return uids.map(uid => ({
          uid,
          sourceMailbox: currentMailbox,
          uidValidity: currentMailbox === 'Archive' ? 91 : 92,
          date: '2026-01-01T12:00:00Z',
          subject: currentMailbox,
        }));
      },
    }),
    findSentMailbox: async () => null,
    maxBodyCharacters: 100,
    maxResponseCharacters: 1000,
    maxSearchCandidates: 10,
    maxSearchHeaderBytes: 1024 * 1024,
  });

  const response = await service.searchMessages({
    mailboxes: ['Archive', 'archive', 'INBOX', 'inbox'],
    limit: 10,
  });
  const result = JSON.parse(response.content[0].text);

  assert.deepEqual(opened, ['Archive', 'archive', 'inbox']);
  assert.equal(result.totalMatches, 3);
});

test('MailSearchService hydrates full bodies one message at a time', async () => {
  const fetches = [];
  const service = new MailSearchService({
    ensureIMAPConnection: async () => {},
    getIMAPClient: () => ({
      async openBox() {
        return { uidvalidity: 91 };
      },
      async search() {
        return [1, 2];
      },
      async fetchMessages(uids, options) {
        fetches.push({ uids: [...uids], includeBody: !options.bodies });
        return uids.map(uid => ({
          uid,
          sourceMailbox: 'INBOX',
          uidValidity: 91,
          date: `2026-01-0${uid}T12:00:00Z`,
          subject: `Message ${uid}`,
          text: '123456789',
        }));
      },
    }),
    findSentMailbox: async () => null,
    maxBodyCharacters: 5,
    maxResponseCharacters: 1000,
    maxSearchCandidates: 10,
    maxSearchHeaderBytes: 1024 * 1024,
  });

  const response = await service.searchMessages({
    mailboxes: ['INBOX'],
    limit: 2,
    includeBody: true,
  });
  const result = JSON.parse(response.content[0].text);

  assert.deepEqual(
    fetches.map(fetch => fetch.uids),
    [[1, 2], [2], [1]],
  );
  assert.deepEqual(
    result.messages.map(message => message.text),
    ['12345\n\n[truncated]', '12345\n\n[truncated]'],
  );
});

test('MailSearchService enforces one aggregate response-body budget', async () => {
  const service = new MailSearchService({
    ensureIMAPConnection: async () => {},
    getIMAPClient: () => ({
      async openBox() {
        return { uidvalidity: 91 };
      },
      async search() {
        return [1, 2];
      },
      async fetchMessages(uids, options) {
        if (options.bodies) {
          return uids.map(uid => ({
            uid,
            sourceMailbox: 'INBOX',
            uidValidity: 91,
            date: `2026-01-0${uid}T12:00:00Z`,
            subject: `Message ${uid}`,
          }));
        }
        return uids.map(uid => ({
          uid,
          sourceMailbox: 'INBOX',
          uidValidity: 91,
          date: `2026-01-0${uid}T12:00:00Z`,
          subject: `Message ${uid}`,
          text: '12345',
        }));
      },
    }),
    findSentMailbox: async () => null,
    maxBodyCharacters: 100,
    maxResponseCharacters: 8,
    maxSearchCandidates: 10,
    maxSearchHeaderBytes: 1024 * 1024,
  });

  await assert.rejects(
    () =>
      service.searchMessages({
        mailboxes: ['INBOX'],
        limit: 2,
        includeBody: true,
      }),
    /MAIL_MAX_RESPONSE_CHARACTERS=8/,
  );
});

test('MailSearchService fails when a selected message disappears during body hydration', async () => {
  let fetchCall = 0;
  const service = new MailSearchService({
    ensureIMAPConnection: async () => {},
    getIMAPClient: () => ({
      async openBox() {
        return { uidvalidity: 91 };
      },
      async search() {
        return [1];
      },
      async fetchMessages(_uids, options) {
        fetchCall += 1;
        if (options.bodies) {
          return [
            {
              uid: 1,
              sourceMailbox: 'INBOX',
              uidValidity: 91,
              date: '2026-01-01T12:00:00Z',
              subject: 'Disappearing message',
              flags: [],
            },
          ];
        }
        return [];
      },
    }),
    findSentMailbox: async () => null,
    maxBodyCharacters: 100,
    maxResponseCharacters: 1000,
    maxSearchCandidates: 10,
    maxSearchHeaderBytes: 1024,
  });

  await assert.rejects(
    () => service.searchMessages({ mailboxes: ['INBOX'], includeBody: true }),
    /disappeared before full-body hydration: INBOX\/UID 1/,
  );
  assert.equal(fetchCall, 2);
});

test('MailSearchService determines reply state from thread headers without subject guessing', async () => {
  let currentMailbox;
  const fakeIMAPClient = {
    async openBox(mailbox) {
      currentMailbox = mailbox;
      return { uidvalidity: mailbox === 'INBOX' ? 91 : 92 };
    },
    async search() {
      return currentMailbox === 'INBOX' ? [1, 2, 3] : [10, 11];
    },
    async fetchMessages() {
      if (currentMailbox === 'INBOX') {
        return [
          {
            uid: 1,
            sourceMailbox: 'INBOX',
            uidValidity: 91,
            date: '2026-01-01T12:00:00Z',
            subject: 'Same subject',
            messageId: '<a@example.com>',
          },
          {
            uid: 2,
            sourceMailbox: 'INBOX',
            uidValidity: 91,
            date: '2026-01-02T12:00:00Z',
            subject: 'Replied',
            messageId: '<b@example.com>',
          },
          {
            uid: 3,
            sourceMailbox: 'INBOX',
            uidValidity: 91,
            date: '2026-01-03T12:00:00Z',
            subject: 'No ID',
          },
        ];
      }
      return [
        {
          uid: 10,
          sourceMailbox: 'Sent',
          uidValidity: 92,
          date: '2026-01-05T12:00:00Z',
          subject: 'Completely different',
          references: ['<b@example.com>'],
        },
        {
          uid: 11,
          sourceMailbox: 'Sent',
          uidValidity: 92,
          date: '2026-01-06T12:00:00Z',
          subject: 'Same subject',
        },
      ];
    },
  };
  const service = new MailSearchService({
    ensureIMAPConnection: async () => {},
    getIMAPClient: () => fakeIMAPClient,
    findSentMailbox: async () => 'Sent',
    maxBodyCharacters: 100,
    maxResponseCharacters: 1000,
    maxSearchCandidates: 5000,
    maxSearchHeaderBytes: 1024 * 1024,
  });

  const response = await service.findUnrepliedMessages({
    sender: 'sender@example.com',
    since: '2026-01-01',
    before: '2026-01-04',
    limit: 10,
  });
  const result = JSON.parse(response.content[0].text);

  assert.equal(result.repliedCount, 1);
  assert.equal(result.unrepliedCount, 1);
  assert.equal(result.unknownCount, 1);
  assert.equal(result.messages[0].uid, 1);
  assert.equal(result.unknownMessages[0].uid, 3);
});

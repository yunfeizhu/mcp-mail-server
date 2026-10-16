import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import Imap from 'imap';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';

import { FetchByteLimitError, IMAPClient, type EmailMessage } from '../src/imap-client';
import {
  DEFAULT_EMAIL_HTML_STYLE,
  buildReplyRecipients,
  extractEmailsFromAddressField,
} from '../src/mail-utils';
import { parseMessageRef, parseMoveMessageRef } from '../src/message-ref';
import { MailSearchService } from '../src/search-service';
import { SMTPClient } from '../src/smtp-client';

// Private transport seams are used only to exercise real handlers offline.
let runtimePromise: Promise<any> | undefined;
/** Load configuration-dependent handlers with dummy credentials and deterministic limits. */
function loadRuntime(): Promise<any> {
  if (!runtimePromise) {
    const env = {
      IMAP_HOST: 'localhost',
      IMAP_PORT: '993',
      IMAP_SECURE: 'true',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      EMAIL_USER: 'me@example.com',
      EMAIL_ADDRESS: 'me@example.com',
      EMAIL_PASS: 'not-used',
      MAIL_MAX_BODY_CHARACTERS: '200000',
    };
    const previous = new Map(Object.keys(env).map(name => [name, process.env[name]]));
    Object.assign(process.env, env);
    runtimePromise = import('../src/mail-mcp-server').finally(() => {
      for (const [name, value] of previous) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    });
  }
  return runtimePromise;
}

/** Build a complete message with mailbox-local identity, allowing focused overrides. */
function message(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    uid: 7,
    sourceMailbox: 'INBOX',
    uidValidity: 91,
    flags: [],
    date: '2026-10-01T10:00:00Z',
    size: 100,
    subject: 'Boundary regression',
    from: 'sender@example.com',
    to: 'me@example.com',
    text: 'Original message',
    messageId: '<original@example.com>',
    ...overrides,
  };
}

const specialAddresses = [
  "o'connor@example.com",
  'a!b@example.com',
  'user=tag@example.com',
  'a/b@example.com',
  '用户alice@example.com',
  '"a,b"@example.com',
  '"two words"@example.com',
  '"user@example.com"@real.example',
  '"a\\"b"@example.com',
  '"a\\\\b"@example.com',
];

for (const address of specialAddresses) {
  test('MIME and SMTP preserve the complete reply address: ' + address, async () => {
    const originalHeader = '"Doe, Jane" <' + address + '>';
    const parsed = await simpleParser(
      'From: ' + originalHeader + '\r\nTo: me@example.com\r\n\r\nOriginal',
    );
    const extracted = extractEmailsFromAddressField(parsed.from);
    assert.deepEqual(extracted, [address]);

    const recipients = buildReplyRecipients(
      extracted.join(', '),
      undefined,
      'me@example.com',
      undefined,
      ['me@example.com'],
      false,
    );
    assert.deepEqual(recipients.to, [address]);
    assert.deepEqual(extractEmailsFromAddressField(address), [address]);

    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    try {
      const expected = await transport.sendMail({
        from: 'me@example.com',
        to: originalHeader,
        subject: 'Original address',
        text: 'Offline',
      });
      const smtp = new SMTPClient({
        host: 'localhost',
        port: 465,
        username: 'me@example.com',
        password: 'not-used',
      }) as any;
      const actual = await transport.sendMail(
        smtp.createMailOptions({ ...recipients, subject: 'Reply', text: 'Offline' }),
      );
      assert.deepEqual(actual.envelope.to, expected.envelope.to);
      assert.equal(actual.envelope.to.length, 1);
      const roundTrip = await simpleParser(actual.message as Buffer);
      assert.deepEqual(extractEmailsFromAddressField(roundTrip.to), [address]);
    } finally {
      transport.close();
    }
  });
}

test('reply-all flattens groups and preserves special Reply-To, To, and CC addresses', () => {
  assert.deepEqual(
    buildReplyRecipients(
      'ignored@example.com',
      'Team: "Doe, Jane" <o\'connor@example.com>, "a,b"@example.com;',
      'Me <ME@example.com>, a/b@example.com',
      "user=tag@example.com, O'CONNOR@example.com",
      ['me@example.com'],
      true,
    ),
    {
      to: ["o'connor@example.com", '"a,b"@example.com'],
      cc: ['a/b@example.com', 'user=tag@example.com'],
    },
  );
  assert.deepEqual(extractEmailsFromAddressField('"not-an-address"'), []);
  assert.deepEqual(extractEmailsFromAddressField({ value: [{ name: 'No address' }] }), []);
});

/** Exercise real mailbox selection and UID mutation using an in-memory IMAP transport. */
async function mailboxFixture(nativeMove: boolean = true) {
  const { MailMCPServer } = await loadRuntime();
  const boxes = new Map(
    ['Archive', 'Archive ', ' Archive', 'Target', 'Target '].map(name => [
      name,
      new Map<number, boolean>(
        name.startsWith('Target')
          ? []
          : [
              [7, false],
              [8, false],
            ],
      ),
    ]),
  );
  let selected = '';
  let nextDestinationUid = 100;
  const operations: Array<{ operation: string; mailbox: string; target?: string }> = [];
  const transport = new EventEmitter() as any;
  transport.serverSupports = capability =>
    capability === 'UIDPLUS' || (nativeMove && capability === 'MOVE');
  transport.openBox = (name, _readOnly, callback) => {
    assert.ok(boxes.has(name), 'unexpected mailbox: ' + name);
    selected = name;
    operations.push({ operation: 'select', mailbox: name });
    callback(null, { uidvalidity: 91, uidnext: 100, messages: {}, permFlags: [] });
  };
  transport.search = (criteria, callback) => {
    const requested = criteria.find(item => Array.isArray(item) && item[0] === 'UID').slice(1);
    callback(
      null,
      requested.filter(
        uid =>
          boxes.get(selected).has(uid) &&
          (!criteria.includes('DELETED') || boxes.get(selected).get(uid)),
      ),
    );
  };
  transport.addFlags = (uid, _flags, callback) => {
    operations.push({ operation: 'delete-flag', mailbox: selected });
    boxes.get(selected).set(uid, true);
    callback(null);
  };
  transport.delFlags = (uid, _flags, callback) => {
    boxes.get(selected).set(uid, false);
    callback(null);
  };
  transport.expunge = (uid, callback) => {
    boxes.get(selected).delete(uid);
    callback(null);
  };
  const copy = (uid, target, callback) => {
    operations.push({ operation: 'copy', mailbox: selected, target });
    const destinationUid = nextDestinationUid++;
    boxes.get(target).set(destinationUid, false);
    callback(null, String(destinationUid));
  };
  transport.copy = copy;
  transport.move = (uid, target, callback) => {
    copy(uid, target, callback);
    boxes.get(selected).delete(uid);
  };
  const imap = new IMAPClient({
    host: 'localhost',
    port: 993,
    username: 'me@example.com',
    password: 'not-used',
  }) as any;
  imap.imap = transport;
  imap.connected = true;
  imap.authenticated = true;
  imap.fetchMessages = async uids =>
    uids
      .filter(uid => boxes.get(selected).has(uid))
      .map(uid => message({ uid, sourceMailbox: selected }));
  const server = new MailMCPServer({ registerProcessHandlers: false }) as any;
  server.connections = { ensure: async () => {}, imap };
  return { server, imap, boxes, operations };
}

test('message references preserve significant whitespace without weakening validation', () => {
  for (const mailbox of ['Archive ', ' Archive', ' Archive ']) {
    assert.equal(parseMessageRef({ mailbox, uid: 7 }).mailbox, mailbox);
    assert.equal(
      parseMoveMessageRef({ mailbox: 'Archive', uid: 7, targetMailbox: mailbox }).targetMailbox,
      mailbox,
    );
  }
  for (const mailbox of ['', '   ', undefined]) {
    assert.throws(() => parseMessageRef({ mailbox, uid: 7 }), /non-empty string/);
  }
  assert.throws(
    () => parseMoveMessageRef({ mailbox: 'inbox', uid: 7, targetMailbox: 'INBOX' }),
    /different/,
  );
});

for (const mailbox of ['Archive ', ' Archive']) {
  for (const plural of [false, true]) {
    for (const operation of ['get', 'delete', 'move'] as const) {
      test(
        operation + ' preserves ' + JSON.stringify(mailbox) + ' (batch=' + plural + ')',
        async t => {
          const { server, boxes, operations } = await mailboxFixture();
          t.after(() => server.server.close());
          const args = plural ? { mailbox, uids: [7, 8] } : { mailbox, uid: 7 };
          const handler = {
            get: plural ? 'handleGetMessages' : 'handleGetMessage',
            delete: plural ? 'handleDeleteMessages' : 'handleDeleteMessage',
            move: plural ? 'handleMoveMessages' : 'handleMoveMessage',
          }[operation];
          const response = await server[handler]({ ...args, targetMailbox: 'Target ' });
          assert.notEqual(response.isError, true);
          assert.deepEqual(
            [...boxes.get('Archive')],
            [
              [7, false],
              [8, false],
            ],
          );
          assert.deepEqual([...boxes.get('Target')], []);
          assert.ok(
            operations.every(event => event.mailbox === mailbox || event.mailbox === 'Target '),
          );
          if (operation === 'get') {
            const result = JSON.parse(response.content[0].text);
            const messages = plural ? result : [result];
            assert.ok(messages.every(entry => entry.sourceMailbox === mailbox));
          } else {
            const movedUIDs = plural ? [7, 8] : [7];
            for (const uid of movedUIDs) {
              assert.equal(boxes.get(mailbox).has(uid), false);
            }
            assert.equal(boxes.get('Target ').size, operation === 'move' ? movedUIDs.length : 0);
          }
        },
      );
    }
  }
}

test('UIDPLUS fallback also preserves destination whitespace and rejects stale UIDVALIDITY', async t => {
  const { server, boxes } = await mailboxFixture(false);
  t.after(() => server.server.close());
  await assert.rejects(
    () => server.handleDeleteMessage({ mailbox: 'Archive ', uid: 7, uidValidity: 90 }),
    /UIDVALIDITY changed/,
  );
  assert.equal(boxes.get('Archive ').has(7), true);
  const response = await server.handleMoveMessage({
    mailbox: 'Archive',
    uid: 7,
    targetMailbox: 'Archive ',
  });
  const result = JSON.parse(response.content[0].text);
  assert.equal(result.targetMailbox, 'Archive ');
  assert.equal(result.moved, true);
  assert.equal(boxes.get('Archive').has(7), false);
  assert.equal(boxes.get('Archive ').has(7), true);
  assert.equal(boxes.get('Archive ').has(result.destinationUid), true);
});

/** Stub only connection and delivery boundaries around the actual reply handler. */
async function replyFixture(original: Partial<EmailMessage> = {}) {
  const { MailMCPServer } = await loadRuntime();
  const sent: any[] = [];
  const server = new MailMCPServer({ registerProcessHandlers: false }) as any;
  server.connections = {
    ensure: async () => {},
    imap: {
      openBox: async name => {
        assert.equal(name, 'INBOX');
        return { uidvalidity: 91 };
      },
      getMessage: async () => message(original),
    },
    smtp: {
      sendMail: async options => {
        sent.push(options);
        return { messageId: '<reply@example.com>', accepted: options.to, rejected: [] };
      },
    },
  };
  server.saveSentMessage = async () => ({ saved: true, mailbox: 'Sent' });
  return { server, sent };
}

test('reply handler delivers and saves the same special recipients without a real SMTP connection', async t => {
  const original = await simpleParser(
    [
      'From: Sender <sender@example.com>',
      'Reply-To: Team: <o\'connor@example.com>, <"a,b"@example.com>;',
      'To: Me <me@example.com>, <a/b@example.com>',
      'Cc: <user=tag@example.com>',
      'Message-ID: <original@example.com>',
      '',
      'Original body',
    ].join('\r\n'),
  );
  const { server } = await replyFixture({
    from: extractEmailsFromAddressField(original.from).join(', '),
    replyTo: extractEmailsFromAddressField(original.replyTo).join(', '),
    to: extractEmailsFromAddressField(original.to).join(', '),
    cc: extractEmailsFromAddressField(original.cc).join(', '),
  });
  t.after(() => server.server.close());
  const stream = nodemailer.createTransport({ streamTransport: true, buffer: true });
  t.after(() => stream.close());
  const smtp = new SMTPClient({
    host: 'localhost',
    port: 465,
    username: 'me@example.com',
    password: 'not-used',
  }) as any;
  let delivered: any;
  let saved: Buffer;
  smtp.transporter = {
    async sendMail(options) {
      delivered = await stream.sendMail(options);
      return { ...delivered, accepted: delivered.envelope.to, rejected: [] };
    },
  };
  server.connections.smtp = smtp;
  server.saveSentMessage = async (options, messageId) => {
    saved = await smtp.buildRawMessage(options, messageId);
    return { saved: true, mailbox: 'Sent' };
  };
  await server.handleReplyToEmail({
    mailbox: 'INBOX',
    originalUid: 7,
    text: 'New reply',
    replyToAll: true,
  });
  assert.deepEqual(delivered.envelope.to, [
    "o'connor@example.com",
    '"a,b"@example.com',
    'a/b@example.com',
    'user=tag@example.com',
  ]);
  for (const raw of [delivered.message, saved]) {
    const parsed = await simpleParser(raw);
    assert.deepEqual(extractEmailsFromAddressField(parsed.to), [
      "o'connor@example.com",
      '"a,b"@example.com',
    ]);
    assert.deepEqual(extractEmailsFromAddressField(parsed.cc), [
      'a/b@example.com',
      'user=tag@example.com',
    ]);
    assert.equal(parsed.inReplyTo, '<original@example.com>');
    assert.equal(parsed.messageId, delivered.messageId);
  }
});

for (const htmlOnly of [false, true]) {
  for (const fullDocument of [false, true]) {
    test(
      'reply clips the quote after HTML styling (htmlOnly=' +
        htmlOnly +
        ', document=' +
        fullDocument +
        ')',
      async t => {
        const { server, sent } = await replyFixture(
          htmlOnly
            ? { text: undefined, html: '<p>' + '&amp;&lt;&gt;'.repeat(90000) + '</p>' }
            : { text: '<&>'.repeat(100000) },
        );
        t.after(() => server.server.close());
        const html = fullDocument
          ? '<html><body style="color: red">New reply</body></html>'
          : '<p>New reply</p>';
        await server.handleReplyToEmail({
          mailbox: 'INBOX',
          originalUid: 7,
          text: htmlOnly ? undefined : 'New reply',
          html,
          signature: { text: 'Signature', html: '<p>Signature</p>' },
        });
        assert.equal(sent.length, 1);
        assert.ok(sent[0].html.length <= 200000);
        assert.ok(!sent[0].text || sent[0].text.length <= 200000);
        assert.match(sent[0].html, /New reply/);
        assert.match(sent[0].html, /Signature/);
        assert.match(sent[0].html, /quoted content truncated/);
        assert.equal(sent[0].html.split(DEFAULT_EMAIL_HTML_STYLE).length - 1, 1);
        if (fullDocument) {
          assert.match(sent[0].html, /color: red/);
        }
      },
    );
  }
}

test('a full new reply is preserved when the styled quote header cannot fit', async t => {
  const { server, sent } = await replyFixture({ text: 'x'.repeat(300000) });
  t.after(() => server.server.close());
  const html = 'x'.repeat(200000 - ('<div style="' + DEFAULT_EMAIL_HTML_STYLE + '"></div>').length);
  await server.handleReplyToEmail({ mailbox: 'INBOX', originalUid: 7, html });
  assert.equal(sent[0].html.length, 200000);
  assert.ok(sent[0].html.includes(html));
  assert.doesNotMatch(sent[0].html, /quoted content truncated/);
});

test('reply without original applies styling once; oversized new content still fails before delivery', async t => {
  const { server, sent } = await replyFixture({ text: 'x'.repeat(300000) });
  t.after(() => server.server.close());
  await server.handleReplyToEmail({
    mailbox: 'INBOX',
    originalUid: 7,
    text: 'Only new reply',
    includeOriginal: false,
  });
  assert.equal(sent[0].html.split(DEFAULT_EMAIL_HTML_STYLE).length - 1, 1);
  assert.doesNotMatch(sent[0].html, /quoted content|Original/);
  for (const content of [{ text: 'x'.repeat(200001) }, { html: 'x'.repeat(200000) }]) {
    await assert.rejects(
      () => server.handleReplyToEmail({ mailbox: 'INBOX', originalUid: 7, ...content }),
      /body exceeds/,
    );
  }
  assert.equal(sent.length, 1);
});

/** Evaluate the protocol criteria used here, leaving exact date filtering to production code. */
function matchesCriterion(record: EmailMessage, criterion: any): boolean {
  if (criterion === 'ALL') {
    return true;
  }
  const [kind, ...args] = criterion;
  if (kind === 'OR') {
    return args.some(child => matchesCriterion(record, child));
  }
  if (kind === 'HEADER') {
    const header = args[0].toUpperCase();
    const value = header === 'IN-REPLY-TO' ? record.inReplyTo : record.references?.join(' ');
    return value !== undefined && value.toLowerCase().includes(args[1].toLowerCase());
  }
  if (kind === 'FROM') {
    return record.from.includes(args[0]);
  }
  if (kind === 'SINCE' || kind === 'BEFORE') {
    return true;
  }
  throw new Error('Unexpected search criterion: ' + JSON.stringify(criterion));
}

/** Emulate bounded header searches and record actual criteria, selections, and fetches. */
function searchFixture(boxes: Record<string, EmailMessage[]>, limits: Record<string, number> = {}) {
  let selected = '';
  const queries: Array<{ mailbox: string; criteria: any[] }> = [];
  const fetches: Array<{ mailbox: string; uids: number[]; options: any }> = [];
  const imap = {
    async openBox(mailbox) {
      assert.ok(Object.hasOwn(boxes, mailbox));
      selected = mailbox;
      return { uidvalidity: 91 };
    },
    async search(criteria) {
      queries.push({ mailbox: selected, criteria });
      return boxes[selected]
        .filter(record => criteria.every(criterion => matchesCriterion(record, criterion)))
        .map(record => record.uid);
    },
    async fetchMessages(uids, options) {
      fetches.push({ mailbox: selected, uids, options });
      if (options.byteBudget) {
        options.byteBudget.used += 10 * uids.length;
        if (options.byteBudget.used > options.byteBudget.limit) {
          throw new FetchByteLimitError(options.byteBudget.used, options.byteBudget.limit);
        }
      }
      return boxes[selected].filter(record => uids.includes(record.uid));
    },
  };
  const service = new MailSearchService({
    ensureIMAPConnection: async () => {},
    getIMAPClient: () => imap as any,
    findSentMailbox: async () => 'Sent',
    maxBodyCharacters: 200000,
    maxResponseCharacters: 1000000,
    maxSearchCandidates: 5000,
    maxSearchHeaderBytes: 1024 * 1024,
    ...limits,
  });
  return { service, queries, fetches, imap };
}

test('search and hydration keep distinct mailbox names, including significant whitespace', async () => {
  const names = ['Archive', 'Archive ', ' Archive', 'archive', 'inbox'];
  const boxes = Object.fromEntries(
    names.map(sourceMailbox => [sourceMailbox, [message({ sourceMailbox })]]),
  );
  const { service, queries, fetches } = searchFixture(boxes);
  const response = await service.searchMessages({
    mailboxes: [...names, 'INBOX', 'inbox'],
    includeBody: true,
  });
  const result = JSON.parse(response.content[0].text);
  assert.equal(result.returnedCount, names.length);
  assert.deepEqual(result.messages.map(entry => entry.sourceMailbox).sort(), [...names].sort());
  // INBOX is the only case-insensitive mailbox; the last spelling is retained.
  assert.deepEqual(
    queries.map(query => query.mailbox),
    names,
  );
  assert.equal(fetches.length, 2 * names.length);
});

for (const sentDate of ['2026-10-01T10:00:00Z', '2026-09-01T10:00:00Z', 'invalid-date']) {
  test('thread headers prove a reply independently of Sent INTERNALDATE: ' + sentDate, async () => {
    const { service, queries } = searchFixture({
      INBOX: [message()],
      Sent: [
        message({
          uid: 20,
          sourceMailbox: 'Sent',
          date: sentDate,
          inReplyTo: '<original@example.com>',
        }),
      ],
    });
    const response = await service.findUnrepliedMessages({
      sender: 'sender@example.com',
      since: '2026-10-01',
      before: '2026-10-02',
    });
    const result = JSON.parse(response.content[0].text);
    assert.equal(result.repliedCount, 1);
    assert.equal(result.unrepliedCount, 0);
    assert.doesNotMatch(
      JSON.stringify(queries.filter(query => query.mailbox === 'Sent')),
      /SINCE|BEFORE/,
    );
  });
}

const messageIdCases = [
  { incoming: '<ABC@example.com>', reference: '<abc@example.com>', replied: false },
  { incoming: '<abc@EXAMPLE.com>', reference: '<abc@example.com>', replied: false },
  {
    incoming: '<"01KF8JCEOCBS0045PS"@xxx.yyy.com>',
    reference: '<01KF8JCEOCBS0045PS@xxx.yyy.com>',
    replied: true,
  },
  {
    incoming: '<01KF8JCEOCBS0045PS@xxx.yyy.com>',
    reference: '<"01KF8JCEOCBS0045PS"@xxx.yyy.com>',
    replied: true,
  },
  { incoming: '<"a\\"b"@example.com>', reference: '<"a\\"b"@example.com>', replied: true },
  { incoming: '<"ab\\c"@example.com>', reference: '<abc@example.com>', replied: true },
  { incoming: '<abc@example.com>', reference: '<"ab\\c"@example.com>', replied: true },
  { incoming: ' <Case@example.com> ', reference: '<Case@example.com>', replied: true },
];

for (const { incoming, reference, replied } of messageIdCases) {
  for (const header of ['inReplyTo', 'references']) {
    test(
      'Message-ID matching preserves case and normalizes quoting: ' + incoming + ' via ' + header,
      async () => {
        const { service } = searchFixture({
          INBOX: [message({ messageId: incoming })],
          Sent: [
            message({
              uid: 20,
              sourceMailbox: 'Sent',
              date: '2026-10-02T10:00:00Z',
              [header]: header === 'references' ? [reference] : reference,
            }),
          ],
        });
        const result = JSON.parse(
          (await service.findUnrepliedMessages({ sender: 'sender@example.com' })).content[0].text,
        );
        assert.equal(result.repliedCount, replied ? 1 : 0);
        assert.equal(result.unrepliedCount, replied ? 0 : 1);
      },
    );
  }
}

test('historical reply searches exclude unthreaded Sent mail and serialize through node-imap', async () => {
  const { service, queries, fetches } = searchFixture(
    {
      INBOX: [
        message(),
        message({ uid: 8, messageId: '<second@example.com>', date: '2026-09-01T10:00:00Z' }),
      ],
      Sent: [
        ...Array.from({ length: 6000 }, (_, uid) =>
          message({ uid: uid + 100, sourceMailbox: 'Sent' }),
        ),
        message({
          uid: 20,
          sourceMailbox: 'Sent',
          date: '2026-09-01T10:00:00Z',
          references: ['<original@example.com>'],
        }),
      ],
    },
    { maxSearchCandidates: 3 },
  );
  const response = await service.findUnrepliedMessages({
    sender: 'sender@example.com',
    since: '2026-10-01',
  });
  const result = JSON.parse(response.content[0].text);
  assert.equal(result.totalCandidates, 1);
  assert.equal(result.repliedCount, 1);
  assert.deepEqual(
    fetches.filter(fetch => fetch.mailbox === 'Sent').flatMap(fetch => fetch.uids),
    [20],
  );
  const protocol = new Imap({ user: 'offline', password: 'not-used', host: 'localhost' }) as any;
  protocol._box = {};
  protocol._caps = [];
  const commands: string[] = [];
  protocol._enqueue = command => commands.push(command);
  for (const query of queries.filter(query => query.mailbox === 'Sent')) {
    protocol.search(query.criteria, () => {});
  }
  assert.ok(commands.length > 0);
  assert.ok(
    commands.every(
      command =>
        command.includes('HEADER "IN-REPLY-TO"') && command.includes('HEADER "REFERENCES"'),
    ),
  );
  assert.ok(commands.every(command => !command.includes('SINCE') && !command.includes(' ALL')));
});

test('thread header searches share incoming budgets and fetch each Sent UID once', async () => {
  const incoming = Array.from({ length: 45 }, (_, index) =>
    message({ uid: index + 1, messageId: '<thread-' + index + '@example.com>' }),
  );
  const { service, queries, fetches } = searchFixture(
    {
      INBOX: incoming,
      Sent: [
        message({
          uid: 100,
          sourceMailbox: 'Sent',
          references: incoming.map(record => record.messageId),
        }),
      ],
    },
    { maxSearchCandidates: 46, maxSearchHeaderBytes: 460 },
  );
  const response = await service.findUnrepliedMessages({ sender: 'sender@example.com', limit: 50 });
  const result = JSON.parse(response.content[0].text);
  assert.equal(result.repliedCount, incoming.length);
  assert.deepEqual(
    fetches.filter(fetch => fetch.mailbox === 'Sent').flatMap(fetch => fetch.uids),
    [100],
  );
  assert.equal(queries.filter(query => query.mailbox === 'Sent').length, 1);
});

test('reply analysis fails closed on candidate/header budgets or an unreadable Sent mailbox', async () => {
  for (const limits of [{ maxSearchCandidates: 1 }, { maxSearchHeaderBytes: 10 }]) {
    const { service } = searchFixture(
      {
        INBOX: [message()],
        Sent: [message({ uid: 20, sourceMailbox: 'Sent', inReplyTo: '<original@example.com>' })],
      },
      limits,
    );
    await assert.rejects(
      () => service.findUnrepliedMessages({ sender: 'sender@example.com' }),
      /MAIL_MAX_SEARCH_CANDIDATES|MAIL_MAX_SEARCH_HEADER_BYTES/,
    );
  }
  const { service, imap } = searchFixture({ INBOX: [message()], Sent: [] });
  const openBox = imap.openBox;
  imap.openBox = async name => {
    if (name === 'Sent') {
      throw new Error('Sent unavailable');
    }
    return openBox(name);
  };
  await assert.rejects(
    () => service.findUnrepliedMessages({ sender: 'sender@example.com' }),
    /Sent unavailable/,
  );
});

test('missing Message-ID remains unknown rather than guessed from a matching subject', async () => {
  const { service, queries } = searchFixture({
    INBOX: [message({ messageId: undefined })],
    Sent: [message({ uid: 20, sourceMailbox: 'Sent' })],
  });
  const result = JSON.parse(
    (await service.findUnrepliedMessages({ sender: 'sender@example.com' })).content[0].text,
  );
  assert.equal(result.unknownCount, 1);
  assert.equal(result.repliedCount, 0);
  assert.equal(result.unrepliedCount, 0);
  assert.equal(queries.filter(query => query.mailbox === 'Sent').length, 0);
});

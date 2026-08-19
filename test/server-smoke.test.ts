import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import test from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const CHILD_START_TIMEOUT_MS = 10_000;
const CHILD_EXIT_TIMEOUT_MS = 5_000;
const MAX_DIAGNOSTIC_LENGTH = 4_000;

function waitForStderrMessage(
  child: ChildProcess,
  expectedMessage: string,
  timeoutMs: number,
): Promise<void> {
  if (!child.stderr) {
    return Promise.reject(new Error('stdio child stderr is unavailable'));
  }

  return new Promise<void>((resolve, reject) => {
    let stderr = '';
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      child.stderr?.off('data', onData);
      child.off('error', onError);
      child.off('close', onClose);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const diagnostic = () => stderr.trim() || 'no stderr output';
    const onData = (chunk: Buffer | string) => {
      stderr = `${stderr}${String(chunk)}`.slice(-MAX_DIAGNOSTIC_LENGTH);
      if (stderr.includes(expectedMessage)) finish();
    };
    const onError = (error: Error) => finish(error);
    const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
      finish(
        new Error(
          `stdio child exited before startup (code: ${String(code)}, signal: ${String(signal)}): ${diagnostic()}`,
        ),
      );
    };
    const timeout = setTimeout(() => {
      finish(new Error(`stdio child did not start within ${timeoutMs}ms: ${diagnostic()}`));
    }, timeoutMs);

    child.stderr.on('data', onData);
    child.once('error', onError);
    child.once('close', onClose);
  });
}

function waitForChildClose(
  child: ChildProcess,
  timeoutMs: number,
): Promise<readonly [number | null, NodeJS.Signals | null]> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve([child.exitCode, child.signalCode]);
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`stdio child remained alive ${timeoutMs}ms after EOF`)),
      timeoutMs,
    );
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      resolve([code, signal]);
    });
  });
}

test('stdio server initializes and exposes mailbox-scoped message tools', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/index.js'],
    env: {
      ...process.env,
      IMAP_HOST: 'localhost',
      IMAP_PORT: '993',
      IMAP_SECURE: 'true',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      EMAIL_USER: 'smoke@example.com',
      EMAIL_PASS: 'not-used',
      MAIL_ALLOWED_ROOTS: '/tmp',
    },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'mcp-mail-smoke-test', version: '1.0.0' });

  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion()?.version, '2.0.2');
    const result = await client.listTools();
    const tools = result.tools as any[];
    assert.equal(tools.length, 12);

    const toolNames = tools.map(tool => tool.name);
    assert.deepEqual(toolNames, [
      'check_connection',
      'list_mailboxes',
      'search_messages',
      'find_unreplied_messages',
      'get_message',
      'get_messages',
      'send_email',
      'reply_to_email',
      'continue_email_thread',
      'move_message',
      'delete_message',
      'save_attachment',
    ]);
    assert.equal(toolNames.includes('open_mailbox'), false);
    assert.equal(toolNames.includes('disconnect_all'), false);
    assert.equal(toolNames.includes('get_attachments'), false);

    const searchMessages = tools.find(tool => tool.name === 'search_messages');
    const getMessage = tools.find(tool => tool.name === 'get_message');
    const getMessages = tools.find(tool => tool.name === 'get_messages');
    const deleteMessage = tools.find(tool => tool.name === 'delete_message');
    const moveMessage = tools.find(tool => tool.name === 'move_message');
    const sendEmail = tools.find(tool => tool.name === 'send_email');
    const replyToEmail = tools.find(tool => tool.name === 'reply_to_email');
    const continueEmailThread = tools.find(tool => tool.name === 'continue_email_thread');
    assert.ok(searchMessages);
    assert.ok(getMessage);
    assert.ok(getMessages);
    assert.ok(deleteMessage);
    assert.ok(moveMessage);
    assert.ok(sendEmail);
    assert.ok(replyToEmail);
    assert.ok(continueEmailThread);
    assert.deepEqual(getMessage.inputSchema.required, ['mailbox', 'uid']);
    assert.deepEqual(deleteMessage.inputSchema.required, ['mailbox', 'uid']);
    assert.deepEqual(moveMessage.inputSchema.required, ['mailbox', 'uid', 'targetMailbox']);
    assert.equal(moveMessage.annotations.destructiveHint, true);
    assert.equal(deleteMessage.annotations.destructiveHint, true);
    assert.equal(searchMessages.annotations.readOnlyHint, true);
    assert.equal(searchMessages.annotations.openWorldHint, true);
    assert.equal(getMessage.annotations.openWorldHint, true);
    assert.equal(moveMessage.annotations.openWorldHint, true);
    assert.equal(searchMessages.inputSchema.additionalProperties, false);
    assert.equal(searchMessages.inputSchema.properties.includeBody.default, false);
    assert.equal(searchMessages.inputSchema.properties.mailboxes.uniqueItems, true);
    assert.equal(getMessages.inputSchema.properties.uids.uniqueItems, true);
    assert.deepEqual(sendEmail.inputSchema.properties.signature.anyOf, [
      { required: ['text'] },
      { required: ['html'] },
    ]);
    assert.deepEqual(sendEmail.inputSchema.anyOf, [{ required: ['text'] }, { required: ['html'] }]);
    assert.equal(sendEmail.inputSchema.properties.signature.additionalProperties, false);
    assert.equal(continueEmailThread.inputSchema.properties.replyToAll.default, true);
    assert.equal(continueEmailThread.inputSchema.properties.includeOriginal.default, true);
    assert.deepEqual(replyToEmail.inputSchema.properties.signature.anyOf, [
      { required: ['text'] },
      { required: ['html'] },
    ]);
    assert.deepEqual(replyToEmail.inputSchema.anyOf, [
      { required: ['text'] },
      { required: ['html'] },
    ]);

    const invalidCall = await client.callTool({
      name: 'check_connection',
      arguments: { unexpected: true },
    });
    assert.equal(invalidCall.isError, true);
    const invalidContent = invalidCall.content as Array<{ text: string }>;
    assert.match(invalidContent[0].text, /Input validation error/);
    assert.match(invalidContent[0].text, /unexpected/);

    const missingUid = await client.callTool({
      name: 'get_message',
      arguments: { mailbox: 'INBOX' },
    });
    assert.equal(missingUid.isError, true);
    const missingUidContent = missingUid.content as Array<{ text: string }>;
    assert.match(missingUidContent[0].text, /Input validation error/);
    assert.match(missingUidContent[0].text, /uid/);
  } finally {
    await client.close();
  }
});

test('stdio EOF performs graceful connection cleanup without leaving the process alive', async t => {
  const childSource = [
    'const { MailMCPServer } = await import("./src/mail-mcp-server");',
    'const server = new MailMCPServer();',
    'const keepalive = setInterval(() => {}, 1000);',
    'server.connections = { disconnectAll: async () => { clearInterval(keepalive); return []; } };',
    'await server.run();',
  ].join('\n');
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', childSource],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        IMAP_HOST: 'localhost',
        IMAP_PORT: '993',
        IMAP_SECURE: 'true',
        SMTP_HOST: 'localhost',
        SMTP_PORT: '465',
        SMTP_SECURE: 'true',
        EMAIL_USER: 'smoke@example.com',
        EMAIL_PASS: 'not-used',
      },
      stdio: ['pipe', 'ignore', 'pipe'],
    },
  );
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });

  await waitForStderrMessage(child, 'MCP Mail server running on stdio', CHILD_START_TIMEOUT_MS);

  const closePromise = waitForChildClose(child, CHILD_EXIT_TIMEOUT_MS);
  child.stdin.end();
  const [exitCode, signal] = await closePromise;
  assert.equal(exitCode, 0);
  assert.equal(signal, null);
});

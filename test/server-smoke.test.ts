import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

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
    assert.equal(client.getServerVersion()?.version, '2.0.0');
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
    if (child.exitCode === null) child.kill('SIGKILL');
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('stdio child did not start')), 1000);
    child.stderr.on('data', chunk => {
      if (String(chunk).includes('MCP Mail server running on stdio')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  child.stdin.end();
  const [exitCode, signal] = await new Promise<readonly [number | null, NodeJS.Signals | null]>(
    (resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('stdio child remained alive after EOF')),
        1000,
      );
      child.once('close', (code, closeSignal) => {
        clearTimeout(timeout);
        resolve([code, closeSignal]);
      });
    },
  );
  assert.equal(exitCode, 0);
  assert.equal(signal, null);
});

import assert from 'node:assert/strict';
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
    assert.equal(client.getServerVersion()?.version, '1.2.3');
    const result = await client.listTools();
    assert.equal(result.tools.length, 25);

    const getMessage = result.tools.find(tool => tool.name === 'get_message');
    const deleteMessage = result.tools.find(tool => tool.name === 'delete_message');
    const moveMessage = result.tools.find(tool => tool.name === 'move_message');
    const sendEmail = result.tools.find(tool => tool.name === 'send_email');
    const replyToEmail = result.tools.find(tool => tool.name === 'reply_to_email');
    assert.ok(getMessage);
    assert.ok(deleteMessage);
    assert.ok(moveMessage);
    assert.ok(sendEmail);
    assert.ok(replyToEmail);
    assert.deepEqual(getMessage.inputSchema.required, ['mailbox', 'uid']);
    assert.deepEqual(deleteMessage.inputSchema.required, ['mailbox', 'uid']);
    assert.deepEqual(moveMessage.inputSchema.required, ['mailbox', 'uid', 'targetMailbox']);
    assert.equal(moveMessage.annotations.destructiveHint, true);
    assert.deepEqual(sendEmail.inputSchema.properties.signature.anyOf, [
      { required: ['text'] },
      { required: ['html'] },
    ]);
    assert.equal(sendEmail.inputSchema.properties.signature.additionalProperties, false);
    assert.deepEqual(replyToEmail.inputSchema.properties.signature.anyOf, [
      { required: ['text'] },
      { required: ['html'] },
    ]);
  } finally {
    await client.close();
  }
});

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
    assert.equal(client.getServerVersion()?.version, '1.2.2');
    const result = await client.listTools();
    assert.equal(result.tools.length, 24);

    const getMessage = result.tools.find(tool => tool.name === 'get_message');
    const deleteMessage = result.tools.find(tool => tool.name === 'delete_message');
    assert.ok(getMessage);
    assert.ok(deleteMessage);
    assert.deepEqual(getMessage.inputSchema.required, ['mailbox', 'uid']);
    assert.deepEqual(deleteMessage.inputSchema.required, ['mailbox', 'uid']);
  } finally {
    await client.close();
  }
});

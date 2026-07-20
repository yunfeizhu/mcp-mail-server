<div align="center">

# MCP Mail Server

**Give your AI assistant a local bridge to your email.**

Search, read, organize, reply to, and send email through any standards-based IMAP/SMTP account—from Claude, Cursor, Codex, and other MCP clients.

[![npm version](https://img.shields.io/npm/v/mcp-mail-server?logo=npm&color=CB3837)](https://www.npmjs.com/package/mcp-mail-server)
[![npm downloads](https://img.shields.io/npm/dm/mcp-mail-server?logo=npm&color=CB3837)](https://www.npmjs.com/package/mcp-mail-server)
[![Node.js](https://img.shields.io/node/v/mcp-mail-server?logo=node.js&color=339933)](https://www.npmjs.com/package/mcp-mail-server)
[![License: MIT](https://img.shields.io/npm/l/mcp-mail-server?color=blue)](LICENSE)

**English** · [简体中文](README-zh.md)

[Why this server](#why-this-server) · [Quick start](#quick-start) · [Client setup](#client-setup) · [Tools](#tools-at-a-glance) · [Configuration](#configuration) · [Development](#development)

</div>

> “Find the unread messages from Alice this week, summarize them, and move the finished thread to Archive.”

## Why this server?

<table>
  <tr>
    <td width="50%"><strong>🔎 Find what matters</strong><br>Search across folders by sender, recipient, subject, body, date, read state, and reply state.</td>
    <td width="50%"><strong>✉️ Act without leaving the conversation</strong><br>Read, send, reply, move, and delete messages using natural language.</td>
  </tr>
  <tr>
    <td width="50%"><strong>📎 Work with attachments</strong><br>Inspect metadata, download files, and send local attachments through explicit filesystem allowlists.</td>
    <td width="50%"><strong>🔐 Keep control</strong><br>Run locally, connect directly to your mail provider, verify TLS certificates, and enforce payload limits.</td>
  </tr>
</table>

## What can I ask?

| Goal | Example prompt |
|---|---|
| Catch up | “Summarize my unread email from today.” |
| Find a message | “Find messages from finance@example.com about the Q3 budget.” |
| Organize the inbox | “Move the completed thread from INBOX to Archive.” |
| Reply with context | “Reply to the latest message from Alex and keep it in the same thread.” |
| Handle files | “Save the PDF attachment from that message to my Downloads folder.” |
| Send polished email | “Send the project update with my text and HTML signature.” |

## Quick Start

> [!IMPORTANT]
> Enable IMAP and SMTP for your account before starting. This server currently supports password or app-password authentication; OAuth2 is not yet supported.

1. **Prepare** your IMAP/SMTP server details and an app password where supported.
2. **Add** the server to your MCP client using one of the configurations below.
3. **Restart or reconnect** the client, then ask: *“Show me unread emails from today.”*

All examples use `npx -y mcp-mail-server`, so there is nothing to install globally.

## Client setup

<details>
<summary>Claude Desktop</summary>

Open **Settings > Developer > Edit Config** and add the server to `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mcp-mail-server": {
      "command": "npx",
      "args": ["-y", "mcp-mail-server"],
      "env": {
        "IMAP_HOST": "your-imap-server.com",
        "IMAP_PORT": "993",
        "IMAP_SECURE": "true",
        "SMTP_HOST": "your-smtp-server.com",
        "SMTP_PORT": "465",
        "SMTP_SECURE": "true",
        "EMAIL_USER": "your-email@domain.com",
        "EMAIL_PASS": "your-app-password"
      }
    }
  }
}
```

Save the file, completely quit Claude Desktop, and start it again. See the [official local MCP server guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers) for current client instructions.

</details>

<details>
<summary>Cursor</summary>

Add the server to one of Cursor's MCP configuration files:

- Project: `.cursor/mcp.json`
- Global: `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "mcp-mail-server": {
      "command": "npx",
      "args": ["-y", "mcp-mail-server"],
      "env": {
        "IMAP_HOST": "your-imap-server.com",
        "IMAP_PORT": "993",
        "IMAP_SECURE": "true",
        "SMTP_HOST": "your-smtp-server.com",
        "SMTP_PORT": "465",
        "SMTP_SECURE": "true",
        "EMAIL_USER": "your-email@domain.com",
        "EMAIL_PASS": "your-app-password"
      }
    }
  }
}
```

See the [Cursor MCP documentation](https://docs.cursor.com/context/model-context-protocol) for current configuration locations and behavior.

</details>

<details>
<summary>Claude Code</summary>

Add the server at user scope so it is available across projects:

```bash
claude mcp add \
  --scope user \
  --env IMAP_HOST=your-imap-server.com \
  --env IMAP_PORT=993 \
  --env IMAP_SECURE=true \
  --env SMTP_HOST=your-smtp-server.com \
  --env SMTP_PORT=465 \
  --env SMTP_SECURE=true \
  --env EMAIL_USER=your-email@domain.com \
  --env EMAIL_PASS=your-app-password \
  --transport stdio \
  mcp-mail-server \
  -- npx -y mcp-mail-server
```

Use `--scope local` for the current project only (the default), or `--scope project` to create a shared `.mcp.json` in the project root. Claude Code does not read MCP servers from `.claude/settings.json`. Run `claude mcp get mcp-mail-server` or use `/mcp` inside Claude Code to verify the connection. See the [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) for scope and configuration details.

</details>

<details>
<summary>OpenAI Codex</summary>

Add the server with the Codex CLI:

```bash
codex mcp add mcp-mail-server \
  --env IMAP_HOST=your-imap-server.com \
  --env IMAP_PORT=993 \
  --env IMAP_SECURE=true \
  --env SMTP_HOST=your-smtp-server.com \
  --env SMTP_PORT=465 \
  --env SMTP_SECURE=true \
  --env EMAIL_USER=your-email@domain.com \
  --env EMAIL_PASS=your-app-password \
  -- npx -y mcp-mail-server
```

Codex stores user configuration in `~/.codex/config.toml`. For a trusted project-only configuration, use `.codex/config.toml`:

```toml
[mcp_servers.mcp-mail-server]
command = "npx"
args = ["-y", "mcp-mail-server"]
env_vars = [
  "IMAP_HOST",
  "IMAP_PORT",
  "IMAP_SECURE",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "EMAIL_USER",
  "EMAIL_PASS"
]
```

Export those variables before starting Codex. The ChatGPT desktop app, Codex CLI, and Codex IDE extension share this configuration. See the [Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp) for current options.

</details>

<details>
<summary>Other MCP Clients</summary>

Use your client's current MCP configuration format and register a local **STDIO** server with:

- Command: `npx`
- Arguments: `-y`, `mcp-mail-server`
- Environment: the required IMAP, SMTP, and account variables listed under [Configuration](#configuration)

Configuration file names and schemas are client-specific; do not assume every client accepts the `mcpServers` JSON format.

</details>

## Tools at a glance

| Capability | Tools |
|---|---|
| Connection | `connect_all`, `get_connection_status`, `disconnect_all` |
| Mailboxes | `open_mailbox`, `list_mailboxes`, `get_message_count` |
| Search | `get_unseen_messages`, `get_recent_messages`, `search_by_sender`, `search_by_subject`, `search_by_recipient`, `search_by_body`, `search_since_date`, `search_unread_from_sender`, `search_unreplied_from_sender`, `search_with_keyword`, `search_all_messages` |
| Messages | `get_message`, `get_messages`, `move_message`, `delete_message` |
| Compose | `send_email`, `reply_to_email` |
| Attachments | `get_attachments`, `save_attachment` |

<details>
<summary>View the complete tool reference</summary>

### Connection Management
- **connect_all**: No parameters required
- **get_connection_status**: No parameters required  
- **disconnect_all**: No parameters required

### Mailbox Operations  
- **open_mailbox**: `mailboxName` (string, default: "INBOX"), `readOnly` (boolean)
- **list_mailboxes**: No parameters required

### Search Operations
- **search_by_sender**: `sender` (string, email address), `startDate` (string, optional), `endDate` (string, optional)
- **search_by_subject**: `subject` (string, keywords), `startDate` (string, optional), `endDate` (string, optional)
- **search_by_recipient**: `recipient` (string, email address), `startDate` (string, optional), `endDate` (string, optional)
- **search_by_body**: `text` (string, search text), `startDate` (string, optional), `endDate` (string, optional)
- **search_since_date**: `date` (string, date format)
- **search_unread_from_sender**: `sender` (string, email address), `startDate` (string, optional), `endDate` (string, optional)
- **search_unreplied_from_sender**: `sender` (string, email address), `startDate` (string, optional), `endDate` (string, optional), `limit` (number, optional)
- **search_with_keyword**: `keyword` (string, keyword), `startDate` (string, optional), `endDate` (string, optional)
- **search_all_messages**: `startDate` (string, optional), `endDate` (string, optional), `limit` (number, optional, default: 50)

### Message Operations
- **get_message_count**: No parameters required
- **get_unseen_messages**: No parameters required
- **get_recent_messages**: No parameters required
- **get_message**: `mailbox` (string), `uid` (number), `uidValidity` (number, optional), `markSeen` (boolean, optional)
- **get_messages**: `mailbox` (string), `uids` (array), `uidValidity` (number, optional), `markSeen` (boolean, optional)
- **move_message**: `mailbox` (string), `uid` (number), `targetMailbox` (string), `uidValidity` (number, optional). The target mailbox must already exist.
- **delete_message**: `mailbox` (string), `uid` (number), `uidValidity` (number, optional)

### Email Sending
- **send_email**: `to` (string), `subject` (string), `text` (string, optional), `html` (string, optional), `signature` (object, optional: `text` and/or `html`), `cc` (string, optional), `bcc` (string, optional), `attachments` (string[], optional, absolute file paths)
- **reply_to_email**: `mailbox` (string), `originalUid` (number), `uidValidity` (number, optional), `text` (string), `html` (string, optional), `signature` (object, optional: `text` and/or `html`), `replyToAll` (boolean, optional), `includeOriginal` (boolean, optional)

Signatures are appended after the new message body. In replies, the signature is placed before the quoted original message. Provide both `signature.text` and `signature.html` for the best compatibility across mail clients; HTML signatures are treated as trusted email markup.

### Attachment Operations
- **get_attachments**: `mailbox` (string), `uid` (number), `uidValidity` (number, optional) — Returns metadata: filename, contentType, size, index
- **save_attachment**: `mailbox` (string), `uid` (number), `uidValidity` (number, optional), `savePath` (string, absolute path), `attachmentIndex` (number, optional, 0-based), `returnBase64` (boolean, optional, default: false)

</details>

## Configuration

### Environment Variables

**Core mail variables are required. File and security policy variables are optional.**

| Variable | Description | Example |
|----------|-------------|---------|
| `IMAP_HOST` | IMAP server address | `imap.gmail.com` |
| `IMAP_PORT` | IMAP port number | `993` |
| `IMAP_SECURE` | Enable TLS | `true` |
| `SMTP_HOST` | SMTP server address | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port number | `465` |
| `SMTP_SECURE` | Use implicit TLS, normally `true` for port 465 and `false` for STARTTLS on port 587 | `true` |
| `EMAIL_USER` | Email username | `your-email@gmail.com` |
| `EMAIL_PASS` | Email password/app password | `your-app-password` |
| `IMAP_TLS_REJECT_UNAUTHORIZED` | Verify the IMAP TLS certificate; defaults to `true` | `true` |
| `MAIL_ALLOWED_ROOTS` | Existing attachment read/write roots. Local attachment access is disabled when unset. Separate roots with `:` on macOS/Linux or `;` on Windows | `/Users/me/Documents:/tmp/mail` |
| `MAIL_MAX_ATTACHMENT_BYTES` | Per-attachment and total attachment limit; defaults to 25 MiB | `26214400` |
| `MAIL_MAX_MESSAGE_BYTES` | Maximum bytes parsed in memory for one message; defaults to 25 MiB | `26214400` |
| `MAIL_MAX_BASE64_BYTES` | Maximum attachment size returned as Base64; defaults to 1 MiB | `1048576` |
| `MAIL_MAX_BODY_CHARACTERS` | Maximum returned characters for each text or HTML body; defaults to 200000 | `200000` |

Search results include `sourceMailbox`, `uid`, and `uidValidity`. Pass these values back unchanged when reading, replying, downloading attachments, or deleting so identical UIDs in different mailboxes cannot resolve to the wrong message.

### Common Email Providers

<details>
<summary>Gmail Configuration</summary>

```bash
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

**Note**: This server currently supports password-based authentication, not OAuth2. A regular Google account password will not work; use an [App Password](https://support.google.com/accounts/answer/185833) if your account permits one. Google recommends OAuth-based sign-in, and managed accounts may disable app passwords.

</details>

<details>
<summary>Outlook/Hotmail (not currently supported)</summary>

Outlook.com and Exchange Online require OAuth2/Modern Authentication for IMAP and SMTP. This server currently accepts only a username and password, so Outlook/Hotmail accounts are not currently supported.

Outlook SMTP also uses STARTTLS on port 587, which would require `SMTP_SECURE=false`; changing that flag alone does not solve the OAuth requirement. See [Microsoft's current IMAP and SMTP settings](https://support.microsoft.com/en-US/Outlook/pop-imap-and-smtp-settings-for-outlook-com).

</details>

### Security Notes

- **Authentication limitation**: This server currently supports password or app-password authentication only, not OAuth2
- **Use app passwords where supported**: Never use your primary account password when a provider offers a scoped app password
- **Match the SMTP security mode to the port**: Use `SMTP_SECURE=true` for implicit TLS (normally port 465) and `false` for STARTTLS (normally port 587)
- **Protect stored credentials**: MCP clients may save `EMAIL_PASS` in their local configuration. Restrict file permissions and never commit credentials to version control

## Development

<details>
<summary>Local Development Setup</summary>

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yunfeizhu/mcp-mail-server.git
   cd mcp-mail-server
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the project**:
   ```bash
   npm run build
   ```

4. **Set environment variables**:
   ```bash
   export IMAP_HOST=your-imap-server.com
   export IMAP_PORT=993
   export IMAP_SECURE=true
   export SMTP_HOST=your-smtp-server.com
   export SMTP_PORT=465
   export SMTP_SECURE=true
   export EMAIL_USER=your-email@domain.com
   export EMAIL_PASS=your-app-password
   ```

5. **Run the server**:
   ```bash
   npm start
   ```

</details>

### Interactive testing with MCP Inspector

Run:

```bash
npm run dev:inspector
```

The command builds the project and opens the MCP Inspector UI. In the connection pane, configure:

- Transport Type: `STDIO`
- Command: `node`
- Arguments: `dist/index.js`
- Environment Variables: the IMAP, SMTP, username, and password variables listed above

Click **Connect**, open **Tools**, and call `connect_all` and `get_connection_status` before testing search, read, or send tools. Attachment tools also require `MAIL_ALLOWED_ROOTS`.

The current MCP Inspector requires Node.js 22. This affects only the interactive development UI; the MCP server itself continues to support Node.js 18+.

## Release notes

<details>
<summary><strong>v1.2.3</strong> — move messages, add signatures, and get started faster</summary>

**Added**

- Added `move_message` to move a mailbox-scoped message into an existing target mailbox.
- Added optional plain-text and HTML signatures to `send_email` and `reply_to_email`.

**Improved**

- Return the destination UID after a move when the IMAP server provides it, with a refresh hint otherwise.
- Place reply signatures after the new content and before the quoted original while preserving MIME alternatives.
- Validate move targets and reject moves into the current mailbox.

**Documentation**

- Redesigned the README around common workflows, a shorter quick start, grouped tools, and clearer client configuration.

</details>

See [CHANGELOG.md](CHANGELOG.md) for the complete version history.

## Contributing

Bug reports, feature ideas, and pull requests are welcome. Start with the [issue tracker](https://github.com/yunfeizhu/mcp-mail-server/issues) or open a pull request directly.

## License

Released under the [MIT License](LICENSE).

---

<div align="center">

[npm](https://www.npmjs.com/package/mcp-mail-server) · [GitHub](https://github.com/yunfeizhu/mcp-mail-server) · [Issues](https://github.com/yunfeizhu/mcp-mail-server/issues) · [Changelog](CHANGELOG.md)

</div>

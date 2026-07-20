# MCP Mail Server

![NPM Version](https://img.shields.io/npm/v/mcp-mail-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Language:** English | [中文](README-zh.md)

A Model Context Protocol server for IMAP/SMTP email operations with Claude, Cursor, and other AI assistants.

## Features

- **IMAP Operations**: Search, read, and manage emails across mailboxes
- **SMTP Support**: Send emails with HTML/text content and attachments  
- **Attachment Management**: View attachment metadata and save attachments to local files
- **Secure Configuration**: Environment-based setup with TLS/SSL support
- **AI-Friendly**: Natural language commands for email operations
- **Auto Connection Management**: Automatic IMAP/SMTP connection handling
- **Multi-Mailbox Support**: Access INBOX, Sent, and custom folders

## Changelog

### [1.2.2] - 2026-07-20

**Breaking Changes**
- Message-specific tools now require `mailbox` alongside UID and return `sourceMailbox` plus `uidValidity`
- Local attachment reads and writes now require an explicit `MAIL_ALLOWED_ROOTS` allowlist

**Security**
- Enabled IMAP certificate verification by default and added canonical-path and payload-size limits
- Upgraded the MCP SDK, Nodemailer, Mailparser, Rollup, and transitive dependencies; removed the vulnerable minification plugin

**Fixed**
- Serialized stateful IMAP tool calls and fixed sent-folder state drift, SMTP initialization cleanup, read-only `markSeen`, reply threading, and unreplied-message ordering
- Preserved attachments and threading headers in sent-folder MIME copies

**Added**
- Split the monolithic entry point into MCP orchestration, connection management, search services, tool definitions, shared types, and utilities
- Added browser-based tool testing through `npm run dev:inspector` and expanded automated regression coverage

For the full version history, see [CHANGELOG.md](CHANGELOG.md).

---

## Quick Start

1. **Install**: `npm install -g mcp-mail-server`
2. **Configure** environment variables (see [Configuration](#configuration))
3. **Add** to your MCP client configuration
4. **Use** natural language: *"Show me unread emails from today"*

## Installation

<details>
<summary>Claude Desktop</summary>

Add to your `claude_desktop_config.json`:

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
        "EMAIL_PASS": "your-password"
      }
    }
  }
}
```

</details>

<details>
<summary>Cursor</summary>

Add to your Cursor MCP settings:

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
        "EMAIL_PASS": "your-password"
      }
    }
  }
}
```

</details>

<details>
<summary>Claude Code</summary>

Add using the `claude mcp add` command:

```bash
claude mcp add mcp-mail-server \
  -e IMAP_HOST=your-imap-server.com \
  -e IMAP_PORT=993 \
  -e IMAP_SECURE=true \
  -e SMTP_HOST=your-smtp-server.com \
  -e SMTP_PORT=465 \
  -e SMTP_SECURE=true \
  -e EMAIL_USER=your-email@domain.com \
  -e EMAIL_PASS=your-password \
  -- npx -y mcp-mail-server
```

Or manually add to `.claude/settings.json`:

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
        "EMAIL_PASS": "your-password"
      }
    }
  }
}
```

</details>

<details>
<summary>OpenAI Codex</summary>

Add to `codex.json` in your project root:

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
        "EMAIL_PASS": "your-password"
      }
    }
  }
}
```

</details>

<details>
<summary>Other MCP Clients</summary>

Other MCP clients can be configured similarly. The core configuration is:

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
        "EMAIL_PASS": "your-password"
      }
    }
  }
}
```

Refer to your specific client's documentation for the appropriate configuration file location.

</details>

## Available Tools

| Tool | Description |
|------|-------------|
| `connect_all` | Connect to both IMAP and SMTP servers |
| `get_connection_status` | Check connection status and server info |
| `disconnect_all` | Disconnect from all servers |
| `open_mailbox` | Open specific mailbox/folder |
| `list_mailboxes` | List available mail folders |
| `get_message_count` | Get total message count in current mailbox |
| `get_unseen_messages` | Get all unread emails |
| `get_recent_messages` | Get recent emails |
| `search_by_sender` | Find emails from specific sender |
| `search_by_subject` | Search by subject keywords |
| `search_by_recipient` | Find emails sent to specific recipient |
| `search_by_body` | Search message body content |
| `search_since_date` | Find emails since date |
| `search_unread_from_sender` | Find unread emails from specific sender |
| `search_unreplied_from_sender` | Find unreplied emails from specific sender |
| `search_with_keyword` | Search emails by keyword/flag |
| `search_all_messages` | Search all messages with optional date range and limit |
| `get_message` | Retrieve email by UID |
| `get_messages` | Retrieve multiple emails |
| `delete_message` | Delete email by UID |
| `send_email` | Send email via SMTP (with optional attachments) |
| `reply_to_email` | Reply to specific email |
| `get_attachments` | Get attachment metadata for an email |
| `save_attachment` | Download and save attachments to local files |

<details>
<summary>Detailed Tool Parameters</summary>

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
- **delete_message**: `mailbox` (string), `uid` (number), `uidValidity` (number, optional)

### Email Sending
- **send_email**: `to` (string), `subject` (string), `text` (string, optional), `html` (string, optional), `cc` (string, optional), `bcc` (string, optional), `attachments` (string[], optional, absolute file paths)
- **reply_to_email**: `mailbox` (string), `originalUid` (number), `uidValidity` (number, optional), `text` (string), `html` (string, optional), `replyToAll` (boolean, optional), `includeOriginal` (boolean, optional)

### Attachment Operations
- **get_attachments**: `mailbox` (string), `uid` (number), `uidValidity` (number, optional) — Returns metadata: filename, contentType, size, index
- **save_attachment**: `mailbox` (string), `uid` (number), `uidValidity` (number, optional), `savePath` (string, absolute path), `attachmentIndex` (number, optional, 0-based), `returnBase64` (boolean, optional, default: false)

</details>


## Usage Examples

Use natural language commands with your AI assistant:

### Basic Operations
- *"Connect to my email servers"*
- *"Show me all unread emails"*  
- *"Search for emails from boss@company.com"*
- *"Send an email to team@company.com about the meeting"*
- *"Reply to email with UID 123"*

### Advanced Searches
- *"Find emails with 'urgent' in the subject from last week"*
- *"Show me unreplied emails from boss@company.com"*
- *"Search emails sent to team@company.com"*
- *"Get all emails from the Sales folder"*
- *"Show unread emails from boss@company.com"*
- *"Show me all emails from the last 7 days"*
- *"List all messages, limit to 20"*

### Email Management  
- *"Delete the email with UID 123"*
- *"Mark recent emails as read"*
- *"List all my email folders"*

### Attachment Operations
- *"Show me the attachments of email UID 456"*
- *"Save all attachments from email UID 456 to D:/Downloads"*
- *"Download the first attachment from email UID 789"*
- *"Send an email to team@company.com with attachment D:/report.pdf"*

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
| `SMTP_SECURE` | Enable SSL | `true` |
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

**Note**: Use [App Passwords](https://support.google.com/accounts/answer/185833) instead of your regular password.

</details>

<details>
<summary>Outlook/Hotmail Configuration</summary>

```bash
IMAP_HOST=outlook.office365.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=true
EMAIL_USER=your-email@outlook.com
EMAIL_PASS=your-password
```

</details>

### Security Notes

- **Use App Passwords**: Enable 2FA and use app-specific passwords when available
- **TLS/SSL Required**: Always use secure connections (IMAP_SECURE=true, SMTP_SECURE=true)
- **Environment Variables**: Never hardcode credentials in configuration files

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
   export EMAIL_PASS=your-password
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

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Package Information:**
- Package: `mcp-mail-server`
- Node.js: ≥18.0.0
- Repository: [GitHub](https://github.com/yunfeizhu/mcp-mail-server)
- Issues: [Report bugs](https://github.com/yunfeizhu/mcp-mail-server/issues)

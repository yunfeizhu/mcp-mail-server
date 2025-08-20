# MCP Mail Server

![NPM Version](https://img.shields.io/npm/v/mcp-mail-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Language:** English | [中文](README-zh.md)

A Model Context Protocol server for IMAP/SMTP email operations with Claude, Cursor, and other AI assistants.

## Features

- **IMAP Operations**: Search, read, and manage emails across mailboxes
- **SMTP Support**: Send emails with HTML/text content and attachments  
- **Secure Configuration**: Environment-based setup with TLS/SSL support
- **AI-Friendly**: Natural language commands for email operations
- **Auto Connection Management**: Automatic IMAP/SMTP connection handling
- **Multi-Mailbox Support**: Access INBOX, Sent, and custom folders

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
      "args": ["mcp-mail-server"],
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
      "args": ["mcp-mail-server"],
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

For global installation:

```bash
npm install -g mcp-mail-server
```

Then configure with:

```json
{
  "mcpServers": {
    "mcp-mail-server": {
      "command": "mcp-mail-server"
    }
  }
}
```

</details>

## Available Tools

| Tool | Description |
|------|-------------|
| `connect_all` | Connect to both IMAP and SMTP servers |
| `get_connection_status` | Check connection status and server info |
| `disconnect_all` | Disconnect from all servers |
| `open_mailbox` | Open specific mailbox/folder |
| `list_mailboxes` | List available mail folders |
| `search_messages` | Search emails with IMAP criteria |
| `search_by_sender` | Find emails from specific sender |
| `search_by_subject` | Search by subject keywords |
| `search_by_body` | Search message content |
| `search_since_date` | Find emails since date |
| `search_larger_than` | Find emails by size |
| `get_message` | Retrieve email by UID |
| `get_messages` | Retrieve multiple emails |
| `delete_message` | Delete email by UID |
| `get_unseen_messages` | Get all unread emails |
| `get_recent_messages` | Get recent emails |
| `send_email` | Send email via SMTP |
| `reply_to_email` | Reply to specific email |

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
- **search_messages**: `criteria` (array, IMAP search criteria)
- **search_by_sender**: `sender` (string, email address)
- **search_by_subject**: `subject` (string, keywords)
- **search_by_body**: `text` (string, search text)
- **search_since_date**: `date` (string, date format)
- **search_larger_than**: `size` (number, bytes)

### Message Operations
- **get_message**: `uid` (number), `markSeen` (boolean, optional)
- **get_messages**: `uids` (array), `markSeen` (boolean, optional)
- **delete_message**: `uid` (number)

### Email Sending
- **send_email**: `to` (string), `subject` (string), `text` (string, optional), `html` (string, optional), `cc` (string, optional), `bcc` (string, optional)
- **reply_to_email**: `originalUid` (number), `text` (string), `html` (string, optional), `replyToAll` (boolean, optional), `includeOriginal` (boolean, optional)

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
- *"Show me large emails over 5MB"*
- *"Get all emails from the Sales folder"*

### Email Management  
- *"Delete the email with UID 123"*
- *"Mark recent emails as read"*
- *"List all my email folders"*

## Configuration

### Environment Variables

**⚠️ All variables are required**

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


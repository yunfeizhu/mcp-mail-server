# Mcp Mail Server

<!-- mcp-name: mcp-mail-server -->

[![NPM Version](https://img.shields.io/npm/v/mcp-mail-server)](https://www.npmjs.com/package/mcp-mail-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Language:** English | [中文](README-zh.md)

A Model Context Protocol (MCP) server that provides email capabilities through IMAP and SMTP protocols. This server enables LLMs to search, read, manage, and send emails on behalf of users.

### Features

- Read/search/delete emails via IMAP
- Send and reply to emails via SMTP
- Read and export email attachments to local files
- Multi-mailbox support (INBOX, Sent, custom folders)
- Automatic IMAP/SMTP connection management
- Secure TLS/SSL connections

## Installation

<details>
<summary>Claude Desktop</summary>

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-mail-server": {
      "command": "npx",
      "args": ["-y", "mcp-mail-server"],
      "env": {
        "IMAP_HOST": "imap.gmail.com",
        "IMAP_PORT": "993",
        "IMAP_SECURE": "true",
        "SMTP_HOST": "smtp.gmail.com",
        "SMTP_PORT": "465",
        "SMTP_SECURE": "true",
        "EMAIL_USER": "your-email@gmail.com",
        "EMAIL_PASS": "your-app-password"
      }
    }
  }
}
```

</details>

<details>
<summary>Claude Code</summary>

Run the following command in your terminal:

```bash
claude mcp add mail \
  -e IMAP_HOST=imap.gmail.com \
  -e IMAP_PORT=993 \
  -e IMAP_SECURE=true \
  -e SMTP_HOST=smtp.gmail.com \
  -e SMTP_PORT=465 \
  -e SMTP_SECURE=true \
  -e EMAIL_USER=your-email@gmail.com \
  -e EMAIL_PASS=your-app-password \
  -- npx -y mcp-mail-server
```

For more details, see the [Claude Code MCP documentation](https://docs.anthropic.com/en/docs/claude-code/mcp).

</details>

<details>
<summary>VS Code</summary>

For quick installation, click the install button below:

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=mail&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-mail-server%22%5D%7D)
[![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=mail&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-mail-server%22%5D%7D&quality=insiders)

For manual installation, add the following JSON block to your User Settings (JSON) file in VS Code. You can do this by pressing `Ctrl + Shift + P` and typing `Preferences: Open User Settings (JSON)`.

Optionally, you can add it to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

> Note that the `mcp` key is needed when using the `mcp.json` file.

```json
{
  "mcp": {
    "servers": {
      "mcp-mail-server": {
        "command": "npx",
        "args": ["-y", "mcp-mail-server"],
        "env": {
          "IMAP_HOST": "imap.gmail.com",
          "IMAP_PORT": "993",
          "IMAP_SECURE": "true",
          "SMTP_HOST": "smtp.gmail.com",
          "SMTP_PORT": "465",
          "SMTP_SECURE": "true",
          "EMAIL_USER": "your-email@gmail.com",
          "EMAIL_PASS": "your-app-password"
        }
      }
    }
  }
}
```

> For more details about MCP configuration in VS Code, see the [official VS Code MCP documentation](https://code.visualstudio.com/docs/copilot/customization/mcp-servers).

</details>

<details>
<summary>Cursor</summary>

Add to your Cursor MCP settings (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "mcp-mail-server": {
      "command": "npx",
      "args": ["-y", "mcp-mail-server"],
      "env": {
        "IMAP_HOST": "imap.gmail.com",
        "IMAP_PORT": "993",
        "IMAP_SECURE": "true",
        "SMTP_HOST": "smtp.gmail.com",
        "SMTP_PORT": "465",
        "SMTP_SECURE": "true",
        "EMAIL_USER": "your-email@gmail.com",
        "EMAIL_PASS": "your-app-password"
      }
    }
  }
}
```

</details>

<details>
<summary>Windsurf</summary>

Add to your Windsurf MCP configuration file (`~/.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "mcp-mail-server": {
      "command": "npx",
      "args": ["-y", "mcp-mail-server"],
      "env": {
        "IMAP_HOST": "imap.gmail.com",
        "IMAP_PORT": "993",
        "IMAP_SECURE": "true",
        "SMTP_HOST": "smtp.gmail.com",
        "SMTP_PORT": "465",
        "SMTP_SECURE": "true",
        "EMAIL_USER": "your-email@gmail.com",
        "EMAIL_PASS": "your-app-password"
      }
    }
  }
}
```

</details>

<details>
<summary>Cline</summary>

Open Cline settings in VS Code, navigate to **MCP Servers**, click **Configure MCP Servers**, and add:

```json
{
  "mcpServers": {
    "mcp-mail-server": {
      "command": "npx",
      "args": ["-y", "mcp-mail-server"],
      "env": {
        "IMAP_HOST": "imap.gmail.com",
        "IMAP_PORT": "993",
        "IMAP_SECURE": "true",
        "SMTP_HOST": "smtp.gmail.com",
        "SMTP_PORT": "465",
        "SMTP_SECURE": "true",
        "EMAIL_USER": "your-email@gmail.com",
        "EMAIL_PASS": "your-app-password"
      }
    }
  }
}
```

</details>

<details>
<summary>Cherry Studio</summary>

Open Cherry Studio settings, navigate to **MCP Servers**, click **Add Server**, select type as **STDIO**, then fill in:

- **Command**: `npx`
- **Args**: `-y mcp-mail-server`
- **Env Variables**: Add all required environment variables (see [Configuration](#configuration))

</details>

<details>
<summary>Other MCP Clients (Augment Code, Trae, Zed, Amazon Q Developer, etc.)</summary>

Most MCP clients follow a similar JSON configuration pattern. The standard `mcpServers` config block works across nearly all clients:

```json
{
  "mcpServers": {
    "mcp-mail-server": {
      "command": "npx",
      "args": ["-y", "mcp-mail-server"],
      "env": {
        "IMAP_HOST": "imap.gmail.com",
        "IMAP_PORT": "993",
        "IMAP_SECURE": "true",
        "SMTP_HOST": "smtp.gmail.com",
        "SMTP_PORT": "465",
        "SMTP_SECURE": "true",
        "EMAIL_USER": "your-email@gmail.com",
        "EMAIL_PASS": "your-app-password"
      }
    }
  }
}
```

Just place it in the MCP configuration file for your specific client. Refer to your client's documentation for the exact file location.

Alternatively, install globally and use `mcp-mail-server` as the command directly:

```bash
npm install -g mcp-mail-server
```

</details>

## Tools

### Connection Management

| Tool                    | Description                                     |
| ----------------------- | ----------------------------------------------- |
| `connect_all`           | Connect to both IMAP and SMTP servers           |
| `get_connection_status` | Check current connection status and server info |
| `disconnect_all`        | Disconnect from all email servers               |

### Mailbox Management

| Tool             | Description                     | Parameters                                                       |
| ---------------- | ------------------------------- | ---------------------------------------------------------------- |
| `open_mailbox`   | Open a specific mailbox/folder  | `mailboxName` (optional, default "INBOX"), `readOnly` (optional) |
| `list_mailboxes` | List all available mail folders | —                                                                |

### Email Search

| Tool                           | Description                                  | Parameters                                             |
| ------------------------------ | -------------------------------------------- | ------------------------------------------------------ |
| `search_messages`              | Search emails using IMAP search criteria     | `criteria` (array)                                     |
| `search_by_sender`             | Find emails from a specific sender           | `sender`                                               |
| `search_by_subject`            | Search emails by subject keywords            | `subject`                                              |
| `search_by_body`               | Search within email message content          | `text`                                                 |
| `search_since_date`            | Find emails since a specific date            | `date`                                                 |
| `search_unreplied_from_sender` | Find unreplied emails from a specific sender | `sender`, `startDate` (optional), `endDate` (optional) |
| `search_larger_than`           | Find emails larger than a specific size      | `size` (bytes)                                         |

### Email Reading

| Tool                  | Description                      | Parameters                                                                                                                     |
| --------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `get_message`         | Retrieve a single email by UID   | `uid`, `markSeen` (optional), `includeAttachmentContent` (optional, default `true`), `attachmentMaxBytes` (optional)           |
| `get_messages`        | Retrieve multiple emails by UIDs | `uids` (array), `markSeen` (optional), `includeAttachmentContent` (optional, default `false`), `attachmentMaxBytes` (optional) |
| `get_unseen_messages` | Get all unread emails            | —                                                                                                                              |
| `get_recent_messages` | Get recently received emails     | —                                                                                                                              |

> Attachment fields in message objects: `filename`, `contentType`, `size`, `contentBase64` (only when `includeAttachmentContent=true` and within size limit), `contentTruncated` (true when exceeds `attachmentMaxBytes`)

### Attachment & Message Management

| Tool                | Description                                | Parameters                                                                          |
| ------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `export_attachment` | Export an email attachment to a local file | `uid`, `filePath`, `attachmentIndex` (optional, default `0`), `filename` (optional) |
| `delete_message`    | Delete an email by UID                     | `uid`                                                                               |

### Sending & Replying

| Tool             | Description               | Parameters                                                                                                         |
| ---------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `send_email`     | Send an email via SMTP    | `to`, `subject`, `text` (optional), `html` (optional), `cc` (optional), `bcc` (optional), `attachments` (optional) |
| `reply_to_email` | Reply to a specific email | `originalUid`, `text`, `html` (optional), `replyToAll` (optional), `includeOriginal` (optional)                    |

## Usage Examples

Use natural language commands with your AI assistant:

### Basic Operations

- _"Connect to my email servers"_
- _"Show me all unread emails"_
- _"Search for emails from boss@company.com"_
- _"Send an email to team@company.com about the meeting"_
- _"Reply to email with UID 123"_

### Advanced Searches

- _"Find emails with 'urgent' in the subject from last week"_
- _"Show me unreplied emails from boss@company.com"_
- _"Show me large emails over 5MB"_
- _"Get all emails from the Sales folder"_

### Attachment Operations

- _"Get message 123 with attachment content included"_
- _"Get messages 101 and 102 without attachment content"_
- _"Export the first attachment of message 123 to /tmp/report.pdf"_
- _"Export attachment named invoice.pdf from message 123 to /tmp/invoice.pdf"_

### Email Management

- _"Delete the email with UID 123"_
- _"Mark recent emails as read"_
- _"List all my email folders"_

## Configuration

### Environment Variables

All environment variables are **required**:

| Variable      | Description                    | Example                |
| ------------- | ------------------------------ | ---------------------- |
| `IMAP_HOST`   | IMAP server address            | `imap.gmail.com`       |
| `IMAP_PORT`   | IMAP port number               | `993`                  |
| `IMAP_SECURE` | Enable TLS/SSL                 | `true`                 |
| `SMTP_HOST`   | SMTP server address            | `smtp.gmail.com`       |
| `SMTP_PORT`   | SMTP port number               | `465`                  |
| `SMTP_SECURE` | Enable TLS/SSL                 | `true`                 |
| `EMAIL_USER`  | Email username                 | `your-email@gmail.com` |
| `EMAIL_PASS`  | Email password or app password | `your-app-password`    |

### Provider-Specific Setup

<details>
<summary>Gmail</summary>

```
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
```

> [!IMPORTANT]
> Gmail requires an [App Password](https://support.google.com/accounts/answer/185833). Enable 2-Step Verification first, then generate an app-specific password.

</details>

<details>
<summary>Outlook / Hotmail</summary>

```
IMAP_HOST=outlook.office365.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=true
```

</details>

<details>
<summary>Yahoo Mail</summary>

```
IMAP_HOST=imap.mail.yahoo.com
IMAP_PORT=993
IMAP_SECURE=true
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=465
SMTP_SECURE=true
```

> [!IMPORTANT]
> Yahoo requires an [App Password](https://help.yahoo.com/kb/generate-manage-third-party-passwords-sln15241.html). Enable 2-Step Verification first.

</details>

### Security Best Practices

- **Use App Passwords**: Always use app-specific passwords instead of your main password
- **Enable 2FA**: Enable two-factor authentication on your email account
- **Use TLS/SSL**: Always set `IMAP_SECURE=true` and `SMTP_SECURE=true`
- **Environment Variables Only**: Never hardcode credentials in configuration files

## Debugging

You can use the [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) to debug the server:

```bash
npx @modelcontextprotocol/inspector npx mcp-mail-server
```

Set the required environment variables in the Inspector's environment configuration panel before connecting.

## Development

1. Clone the repository:

   ```bash
   git clone https://github.com/yunfeizhu/mcp-mail-server.git
   cd mcp-mail-server
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the project:

   ```bash
   npm run build
   ```

4. Run tests:
   ```bash
   npm test
   ```

## Contributing

Contributions are welcome! Whether you want to add new tools, enhance existing functionality, or improve documentation — pull requests are appreciated.

For examples of other MCP servers and implementation patterns, see:
https://github.com/modelcontextprotocol/servers

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the [LICENSE](LICENSE) file in the project repository.

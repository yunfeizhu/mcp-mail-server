# Mail MCP Server

<!-- mcp-name: mcp-mail-server -->

[![NPM Version](https://img.shields.io/npm/v/mcp-mail-server)](https://www.npmjs.com/package/mcp-mail-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Language:** English | [中文](README-zh.md)

A Model Context Protocol (MCP) server that provides email capabilities through IMAP and SMTP protocols. This server enables LLMs to search, read, manage, and send emails on behalf of users.

> [!NOTE]
> This server requires access to your email account credentials. Use **app-specific passwords** whenever possible, and never hardcode credentials. Exercise caution to ensure your email data is handled securely.

### Features

- Read/search/delete emails via IMAP
- Send and reply to emails via SMTP
- Read and export email attachments to local files
- Multi-mailbox support (INBOX, Sent, custom folders)
- Automatic IMAP/SMTP connection management
- Secure TLS/SSL connections

### Tools

- **connect_all**
  - Connect to both IMAP and SMTP servers
  - No parameters required

- **get_connection_status**
  - Check current connection status and server info
  - No parameters required

- **disconnect_all**
  - Disconnect from all email servers
  - No parameters required

- **open_mailbox**
  - Open a specific mailbox/folder
  - Inputs:
    - `mailboxName` (string, optional): Folder name (default: "INBOX")
    - `readOnly` (boolean, optional): Open in read-only mode

- **list_mailboxes**
  - List all available mail folders
  - No parameters required

- **search_messages**
  - Search emails using IMAP search criteria
  - Inputs:
    - `criteria` (array): IMAP search criteria

- **search_by_sender**
  - Find emails from a specific sender
  - Inputs:
    - `sender` (string): Email address of sender

- **search_by_subject**
  - Search emails by subject keywords
  - Inputs:
    - `subject` (string): Subject keywords

- **search_by_body**
  - Search within email message content
  - Inputs:
    - `text` (string): Search text

- **search_since_date**
  - Find emails since a specific date
  - Inputs:
    - `date` (string): Date string

- **search_unreplied_from_sender**
  - Find unreplied emails from a specific sender
  - Inputs:
    - `sender` (string): Email address
    - `startDate` (string, optional): Start date filter
    - `endDate` (string, optional): End date filter

- **search_larger_than**
  - Find emails larger than a specific size
  - Inputs:
    - `size` (number): Size threshold in bytes

- **get_message**
  - Retrieve a single email by UID
  - Inputs:
    - `uid` (number): Email UID
    - `markSeen` (boolean, optional): Mark as read
    - `includeAttachmentContent` (boolean, optional): Include attachment data (default: true)
    - `attachmentMaxBytes` (number, optional): Max attachment size to include

- **get_messages**
  - Retrieve multiple emails by UIDs
  - Inputs:
    - `uids` (number[]): Array of email UIDs
    - `markSeen` (boolean, optional): Mark as read
    - `includeAttachmentContent` (boolean, optional): Include attachment data (default: false)
    - `attachmentMaxBytes` (number, optional): Max attachment size to include

  Attachment fields returned in message objects:
  - `attachments[].filename`
  - `attachments[].contentType`
  - `attachments[].size`
  - `attachments[].contentBase64` (only when `includeAttachmentContent=true` and within size limit)
  - `attachments[].contentTruncated` (true when attachment exceeds `attachmentMaxBytes`)

- **export_attachment**
  - Export an email attachment to a local file
  - Inputs:
    - `uid` (number): Email UID
    - `filePath` (string): Destination file path
    - `attachmentIndex` (number, optional): Attachment index (default: 0)
    - `filename` (string, optional): Match attachment by filename

- **delete_message**
  - Delete an email by UID
  - Inputs:
    - `uid` (number): Email UID

- **get_unseen_messages**
  - Get all unread emails
  - No parameters required

- **get_recent_messages**
  - Get recently received emails
  - No parameters required

- **send_email**
  - Send an email via SMTP
  - Inputs:
    - `to` (string, required): Recipient email address
    - `subject` (string, required): Email subject
    - `text` (string, optional): Plain text body
    - `html` (string, optional): HTML body
    - `cc` (string, optional): CC recipients
    - `bcc` (string, optional): BCC recipients
    - `attachments` (array, optional): File attachments
      - `filename` (string, required): Attachment filename
      - `content` (string, required): File content
      - `contentType` (string, optional): MIME type
      - `encoding` ("utf8" | "base64", optional): Content encoding (default: "utf8")

- **reply_to_email**
  - Reply to a specific email
  - Inputs:
    - `originalUid` (number, required): UID of the email to reply to
    - `text` (string, required): Reply text body
    - `html` (string, optional): Reply HTML body
    - `replyToAll` (boolean, optional): Reply to all recipients
    - `includeOriginal` (boolean, optional): Include original message

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

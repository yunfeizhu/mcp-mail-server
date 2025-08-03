# MCP Mail Server

**Language:** English | [中文](README-zh.md)

A Model Context Protocol (MCP) server that enables email operations through IMAP and SMTP protocols in Cursor AI. Features secure environment-based configuration for seamless email management.

### ✨ Features

#### 📥 IMAP Features (Receive Emails)
- Connect to IMAP email servers with TLS support
- Open and manage multiple mailboxes (folders)
- Advanced email search with multiple criteria
- Retrieve messages by UID with full content parsing via mailparser
- Mark messages as seen/unseen
- Delete messages from server
- Get message counts and mailbox information
- List all available mailboxes
- Get unseen and recent messages
- Automatic connection management
- Real-time connection status monitoring

#### 📤 SMTP Features (Send Emails)  
- Connect to SMTP email servers
- Send emails (text and HTML formats)
- Support for CC and BCC recipients
- SSL/TLS encryption support
- Comprehensive error handling

### 📦 Installation

#### Method 1: Install via npm
```bash
npm install -g mcp-mail-server
```

#### Method 2: Use with npx (Recommended)
No installation required:
```bash
npx mcp-mail-server
```

### ⚙️ Cursor Configuration

Add the following configuration to your Cursor MCP settings:

#### Using npx (Recommended):
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

#### Using global installation:
```json
{
  "mcpServers": {
    "mcp-mail-server": {
      "command": "mcp-mail-server",
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

### 🛠️ Available Tools

#### Connection Management

#### `connect_all`
Connect to both IMAP and SMTP servers simultaneously using preconfigured settings.

#### `get_connection_status`
Check the current connection status of both IMAP and SMTP servers, including server information and current mailbox.

#### `disconnect_imap`
Disconnect from the IMAP server only.

#### `disconnect_all`
Disconnect from both IMAP and SMTP servers.

#### Mailbox Operations

#### `open_mailbox`
Open a specific mailbox (folder) for operations.

**Parameters:**
- `mailboxName` (string, optional): Name of the mailbox to open (default: "INBOX")
- `readOnly` (boolean, optional): Open mailbox in read-only mode (default: false)

#### `list_mailboxes`
List all available mailboxes (folders) on the server.

#### Email Search Tools

#### `search_messages`
Search messages using IMAP search criteria.

**Parameters:**
- `criteria` (array, optional): IMAP search criteria (default: ["ALL"])
  - Examples: `["UNSEEN"]`, `["SINCE", "2024-01-01"]`, `["FROM", "sender@example.com"]`

#### `search_by_sender`
Search messages from a specific sender.

**Parameters:**
- `sender` (string): Email address of the sender to search for

#### `search_by_subject`
Search messages by subject keywords.

**Parameters:**
- `subject` (string): Keywords to search in email subject

#### `search_by_body`
Search messages containing specific text in the body.

**Parameters:**
- `text` (string): Text to search for in message body

#### `search_since_date`
Search messages since a specific date.

**Parameters:**
- `date` (string): Date in various formats like "April 20, 2010", "20-Apr-2010", or "2010-04-20"

#### `search_larger_than`
Search messages larger than specified size.

**Parameters:**
- `size` (number): Size in bytes

#### `search_with_keyword`
Search messages with specific keyword/flag.

**Parameters:**
- `keyword` (string): Keyword to search for

#### `search_unread_from_sender`
Search unread messages from a specific sender (demonstrates AND logic).

**Parameters:**
- `sender` (string): Email address of the sender

#### `get_messages`
Retrieve multiple messages by their UIDs.

**Parameters:**
- `uids` (array): Array of message UIDs to retrieve
- `markSeen` (boolean, optional): Mark messages as seen when retrieving (default: false)

#### `get_message`
Retrieve complete content of a specific email by UID.

**Parameters:**
- `uid` (number): Message UID to retrieve
- `markSeen` (boolean, optional): Mark message as seen when retrieving (default: false)

#### `delete_message`
Delete a specific email message by UID.

**Parameters:**
- `uid` (number): Message UID to delete

#### `get_message_count`
Get the total number of messages in current mailbox.

#### `get_unseen_messages`
Get all unseen (unread) messages in current mailbox.

#### `get_recent_messages`
Get all recent messages in current mailbox.

#### Email Sending

#### `send_email`
Send an email via SMTP.

**Parameters:**
- `to` (string): Recipient email address(es), comma-separated
- `subject` (string): Email subject
- `text` (string, optional): Plain text email body
- `html` (string, optional): HTML email body
- `cc` (string, optional): CC recipients, comma-separated
- `bcc` (string, optional): BCC recipients, comma-separated


### 💡 Usage Examples

**Note: This project uses preconfigured email server settings via environment variables.**

In Cursor, you can use natural language commands:

#### 🚀 Quick Start

1. Connect to all email servers at once:
```
Connect to email servers
```
or
```
Connect to all mail servers
```

2. Check connection status:
```
Show email connection status
```
or
```
Check mail server connections
```

#### 📥 Receiving Emails

**Note: IMAP connection is established automatically when needed**

1. Open a mailbox:
```
Open INBOX mailbox
```
or
```
Open Sent mailbox in read-only mode
```

2. Search for emails:
```
Search for unseen messages
```
or
```
Search for messages from sender@example.com
```
or
```
Search for messages with "urgent" in the body
```
or
```
Search for messages larger than 1MB
```
or
```
Search for unread messages from boss@company.com
```

3. Get specific email by UID:
```
Show me the content of email with UID 123
```

4. Get all unseen messages:
```
Show me all unread emails
```

5. List available mailboxes:
```
Show me all email folders
```

6. Delete email by UID:
```
Delete email with UID 123
```

#### 📤 Sending Emails

**Note: SMTP connection is established automatically when needed**

1. Send simple email:
```
Send email to recipient@example.com with subject "Test Email" and message "Hello, this is a test email"
```

2. Send HTML email:
```
Send HTML email to recipient@example.com with subject "Welcome" and HTML content "<h1>Welcome!</h1><p>This is an HTML email</p>"
```

3. Send email with CC and BCC:
```
Send email to primary@example.com, CC to cc@example.com, BCC to bcc@example.com with subject "Team Update" and message "Weekly team update"
```

### 🔧 Environment Configuration

#### Required Environment Variables

**⚠️ All environment variables are required - no defaults provided!**

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `IMAP_HOST` | IMAP server address | your-imap-server.com |
| `IMAP_PORT` | IMAP port number | 993 |
| `IMAP_SECURE` | Enable TLS (true/false) | true |
| `SMTP_HOST` | SMTP server address | your-smtp-server.com |
| `SMTP_PORT` | SMTP port number | 465 |
| `SMTP_SECURE` | Enable SSL (true/false) | true |
| `EMAIL_USER` | Email username | your-email@domain.com |
| `EMAIL_PASS` | Email password | your-password |

#### Configuration Validation

- Server will fail to start if any required environment variable is missing
- Boolean values must be `true` or `false` (case-insensitive)
- Port numbers must be valid integers
- Configuration summary is displayed on startup (passwords are hidden)

### ⚠️ Security Considerations

- Use app-specific passwords when available (Gmail, Outlook, etc.)
- Ensure secure network connections in production
- Environment variables are the recommended configuration method
- TLS/SSL encryption is strongly recommended for both protocols

### 🔨 Development

To modify or develop this project:

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

4. Local testing:
```bash
# Set environment variables
export IMAP_HOST=your-imap-server.com
export IMAP_PORT=993
export IMAP_SECURE=true
export SMTP_HOST=your-smtp-server.com
export SMTP_PORT=465
export SMTP_SECURE=true
export EMAIL_USER=your-email@domain.com
export EMAIL_PASS=your-password

# Run the server
npm start
```

### 📊 Package Information

- **Package Name**: `mcp-mail-server`
- **Executable**: `mcp-mail-server`
- **Node.js Version**: >=18.0.0
- **License**: MIT
- **Repository**: [GitHub](https://github.com/yunfeizhu/mcp-mail-server)


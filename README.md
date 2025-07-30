# MCP Mail Server

**Language:** English | [中文](README-zh.md)

A Model Context Protocol (MCP) server that enables email operations through POP3 and SMTP protocols in Cursor AI. Features secure environment-based configuration for seamless email management.

### ✨ Features

#### 📥 POP3 Features (Receive Emails)
- Connect to POP3 email servers
- User authentication with TLS support
- List all messages in mailbox
- Retrieve specific email content
- Delete messages from server
- Get total message count
- Secure connection management

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
        "POP3_HOST": "your-pop3-server.com",
        "POP3_PORT": "995",
        "POP3_SECURE": "true",
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
        "POP3_HOST": "your-pop3-server.com",
        "POP3_PORT": "995",
        "POP3_SECURE": "true",
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

#### `connect_pop3`
Connect to POP3 email server using preconfigured settings.

#### `list_messages`
List all messages in the mailbox with metadata.

#### `get_message`
Retrieve complete content of a specific email.

**Parameters:**
- `messageId` (number): Message ID to retrieve

#### `delete_message`
Delete a specific email message.

**Parameters:**
- `messageId` (number): Message ID to delete

#### `get_message_count`
Get the total number of messages in the mailbox.

#### `disconnect`
Disconnect from the POP3 server.

#### `connect_smtp`
Connect to SMTP email server using preconfigured settings.

#### `send_email`
Send an email via SMTP.

**Parameters:**
- `to` (string): Recipient email address(es), comma-separated
- `subject` (string): Email subject
- `text` (string, optional): Plain text email body
- `html` (string, optional): HTML email body
- `cc` (string, optional): CC recipients, comma-separated
- `bcc` (string, optional): BCC recipients, comma-separated

#### `disconnect_smtp`
Disconnect from the SMTP server.

#### `quick_connect`
Connect to both POP3 and SMTP servers simultaneously using preconfigured settings.

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
Quick connect to mail
```

#### 📥 Receiving Emails

1. Connect to POP3 server (if not using quick connect):
```
Connect to POP3 server
```

2. List emails:
```
Show me my email list
```

3. Get specific email:
```
Show me the content of email ID 1
```

4. Delete email:
```
Delete email with ID 1
```

#### 📤 Sending Emails

1. Connect to SMTP server (if not using quick connect):
```
Connect to SMTP server
```

2. Send simple email:
```
Send email to recipient@example.com with subject "Test Email" and message "Hello, this is a test email"
```

3. Send HTML email:
```
Send HTML email to recipient@example.com with subject "Welcome" and HTML content "<h1>Welcome!</h1><p>This is an HTML email</p>"
```

### 🔧 Environment Configuration

#### Required Environment Variables

**⚠️ All environment variables are required - no defaults provided!**

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `POP3_HOST` | POP3 server address | your-pop3-server.com |
| `POP3_PORT` | POP3 port number | 995 |
| `POP3_SECURE` | Enable TLS (true/false) | true |
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
export POP3_HOST=your-pop3-server.com
export POP3_PORT=995
export POP3_SECURE=true
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


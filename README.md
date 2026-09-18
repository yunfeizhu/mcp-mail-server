<div align="center">

# MCP Mail Server

**Give your AI assistant a local bridge to your email.**

Search, read, organize, reply to, and send email through supported password- or app-password-based IMAP/SMTP accounts—from Claude, Cursor, Codex, and other MCP clients.

[![npm version](https://img.shields.io/npm/v/mcp-mail-server?logo=npm)](https://www.npmjs.com/package/mcp-mail-server)
[![npm downloads](https://img.shields.io/npm/dm/mcp-mail-server?logo=npm)](https://www.npmjs.com/package/mcp-mail-server)
[![Node.js](https://img.shields.io/node/v/mcp-mail-server?logo=node.js)](https://www.npmjs.com/package/mcp-mail-server)
[![License: MIT](https://img.shields.io/npm/l/mcp-mail-server)](LICENSE)

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

| Goal                | Example prompt                                                          |
| ------------------- | ----------------------------------------------------------------------- |
| Catch up            | “Summarize my unread email from today.”                                 |
| Find a message      | “Find messages from finance@example.com about the Q3 budget.”           |
| Organize the inbox  | “Move the completed thread from INBOX to Archive.”                      |
| Reply with context  | “Reply to the latest message from Alex and keep it in the same thread.” |
| Handle files        | “Save the PDF attachment from that message to my Downloads folder.”     |
| Send polished email | “Send the project update with my text and HTML signature.”              |

## Quick Start

> [!IMPORTANT]
> Enable IMAP and SMTP for your account before starting. This server currently supports password or app-password authentication; OAuth2 is not yet supported.

1. **Prepare** your IMAP/SMTP server details and an app password where supported.
2. **Add** the server to your MCP client using one of the configurations below.
3. **Restart or reconnect** the client, then ask: _“Show me unread emails from today.”_

Install **Node.js 22.13.0 or newer** before configuring your MCP client. All examples use `npx -y mcp-mail-server`, so there is no need to install the server globally.

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
        "EMAIL_ADDRESS": "your-email@domain.com",
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
        "EMAIL_ADDRESS": "your-email@domain.com",
        "EMAIL_PASS": "your-app-password"
      }
    }
  }
}
```

See the [Cursor MCP documentation](https://cursor.com/docs/mcp) for current configuration locations and behavior.

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
  --env EMAIL_ADDRESS=your-email@domain.com \
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
  --env EMAIL_ADDRESS=your-email@domain.com \
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
  "EMAIL_ADDRESS",
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

| Capability  | Tools                                                                 |
| ----------- | --------------------------------------------------------------------- |
| Connection  | `check_connection`                                                    |
| Mailboxes   | `list_mailboxes`                                                      |
| Search      | `search_messages`, `find_unreplied_messages`                          |
| Messages    | `get_message`, `get_messages`, `move_message`, `delete_message`       |
| Compose     | `send_email`, `reply_to_email`, `continue_email_thread`               |
| Attachments | Attachment metadata in `get_message`, files through `save_attachment` |

<details>
<summary>View the complete tool reference</summary>

### Connection Management

- **check_connection**: Connects to IMAP when needed, actively verifies SMTP, and returns structured status

### Mailbox Operations

- **list_mailboxes**: No parameters required

### Search Operations

- **search_messages**: Combines `mailboxes`, `from`, `to`, `subject`, `body`, IMAP `keywords`, `unread`, inclusive `since`, exclusive `before`, `limit`, and `includeBody`. Omit `mailboxes` to search INBOX and the detected sent mailbox. Date/time searches widen the IMAP calendar-day query by two days on each side, then apply the exact instant locally so the full UTC+14 to UTC-12 INTERNALDATE spread cannot discard valid messages early. All candidates within `MAIL_MAX_SEARCH_CANDIDATES` are sorted by internal date before `limit` is applied; wider searches fail with a narrowing hint instead of guessing from UID order. Results are summaries by default. Keywords must be atom-safe custom IMAP keywords; whitespace, control characters, IMAP syntax characters, and system flags are rejected. When `includeBody` is true, the call fails explicitly if a selected message disappears before hydration or the request-wide response-body budget would be exceeded.
- **find_unreplied_messages**: `sender` (required), `mailboxes` (optional, defaults to INBOX), `since`, `before`, and `limit`. Uses `In-Reply-To` and `References`; messages without `Message-ID` are returned as `unknownMessages` instead of being guessed from their subject.

```json
{
  "mailboxes": ["INBOX", "Archive"],
  "from": "alice@example.com",
  "unread": true,
  "since": "2026-07-01",
  "before": "2026-08-01",
  "limit": 20
}
```

### Message Operations

- **get_message**: `mailbox` (string), `uid` (number), `uidValidity` (number, optional), `markSeen` (boolean, optional)
- **get_messages**: `mailbox` (string), `uids` (array), `uidValidity` (number, optional), `markSeen` (boolean, optional). The call fails before fetching bodies if any requested UID is missing, and fails explicitly if the combined returned bodies exceed `MAIL_MAX_RESPONSE_CHARACTERS`.
- **move_message**: `mailbox` (string), `uid` (number), `targetMailbox` (string), `uidValidity` (number, optional). The source UID and target mailbox must already exist. Fails safely unless the server supports MOVE or UIDPLUS. When the server returns a destination UID, the result also refreshes `destinationUidValidity` so the target reference can be reused safely. If a UIDPLUS fallback creates the destination copy but source cleanup reports an error, the tool reopens the source mailbox, verifies the UID and rolls back `\\Deleted` when possible. A connection loss before MOVE or COPY confirmation returns `isError: true`, `partial: true`, and `copyOutcome: "unknown"`; a confirmed copy followed by uncertain cleanup returns `copyOutcome: "succeeded"` plus the verified `sourceState`, optional `sourceDeletedFlag`, and destination reference when available. Inspect both mailboxes before retrying either result.
- **delete_message**: `mailbox` (string), `uid` (number), `uidValidity` (number, optional). Verifies the UID exists and permanently deletes only that UID. If STORE or UID EXPUNGE reports an error, the tool verifies the source UID and rolls back `\\Deleted` when possible. A transport failure that cannot be confirmed returns a structured `outcome: "unknown"` instead of claiming the message was not deleted.

### Email Sending

- **send_email**: `to` (string), `subject` (string), `text` (string, optional), `html` (string, optional), `signature` (object, optional: `text` and/or `html`), `cc` (string, optional), `bcc` (string, optional), `attachments` (string[], optional, absolute file paths). At least one of `text` or `html` is required.
- **reply_to_email**: `mailbox` (string), `originalUid` (number), `uidValidity` (number, optional), `text` (string, optional), `html` (string, optional), `signature` (object, optional: `text` and/or `html`), `replyToAll` (boolean, default: false), `includeOriginal` (boolean, default: true). At least one of `text` or `html` is required.
- **continue_email_thread**: `subject` (string), `recipient` (string, optional narrowing match), `since` (string, optional), `text` (string, optional), `html` (string, optional), `signature` (object, optional), `replyToAll` (boolean, default: true), and `includeOriginal` (boolean, default: true). Finds the newest exact normalized subject in the detected sent mailbox, requires a Message-ID, then replies to that sent message so recurring reports remain in one thread and carry the complete previous body forward, subject to `MAIL_MAX_BODY_CHARACTERS`.

Natural-language example for a recurring report:

> Continue the "Development Daily Report" thread that I sent to `manager@example.com` today. Do not start a new thread. Add: "Completed the mail reply fix today; plan to finish regression testing tomorrow." Keep the complete previous message content and reply to all recipients.

Include "continue/reply to the previous message", the exact subject, a recipient or date, and the new body to help the client select `continue_email_thread` instead of starting a new thread with `send_email`.

Signatures are appended after the new message body. In replies, the signature is placed before the quoted original message. Provide both `signature.text` and `signature.html` for the best compatibility across mail clients; HTML signatures are treated as trusted email markup.

Outgoing HTML inherits a cross-platform system font stack (`Segoe UI`/`PingFang SC`/`Microsoft YaHei`/`Noto Sans CJK SC` with Arial and sans-serif fallbacks), a 14px base size, and a 1.6 line height. Explicit styles inside supplied HTML still override these defaults. When callers provide only `text`, the server preserves the `text/plain` body and automatically derives an equivalent styled `text/html` alternative, so HTML-capable clients do not fall back to a monospace plain-text display.

When `includeOriginal` is enabled, an HTML-only original is converted to readable plain text for the text alternative. Oversized quoted content is truncated to `MAIL_MAX_BODY_CHARACTERS` while preserving the new reply and signature.

After SMTP accepts a message, sending tools report `sentFolderSaved` and the detected `sentFolder`. Sent-mailbox candidates are retried only after a definite non-append; an ambiguous transport failure stops immediately to avoid duplicates. If saving fails, SMTP success is preserved and `sentFolderError` reports a password-redacted `stage`, `code`, `message`, `mailbox`, and per-candidate `attempts` when available.

### Attachment Operations

- **get_message** returns attachment filename, content type, size, and index with the message
- **save_attachment**: `mailbox` (string), `uid` (number), `uidValidity` (number, optional), `savePath` (string, absolute path), `attachmentIndex` (number, optional, 0-based), `attachmentFilename` (string, optional, exact match), `returnBase64` (boolean, optional, default: false). Select by index or filename, not both; duplicate filenames must be selected by index. Omit both selectors to save all attachments. When saving multiple attachments, a later write failure returns `isError: true`, `partial`, `savedFiles`, and `failedAttachment` so a retry does not silently duplicate files.

</details>

## Configuration

### Environment Variables

**Core mail variables are required. File and security policy variables are optional.**

| Variable                       | Description                                                                                                                                    | Example                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `IMAP_HOST`                    | IMAP server address                                                                                                                            | `imap.gmail.com`                |
| `IMAP_PORT`                    | IMAP port number, 1-65535                                                                                                                      | `993`                           |
| `IMAP_SECURE`                  | Must be `true`; use an implicit TLS IMAP endpoint, normally port 993                                                                           | `true`                          |
| `SMTP_HOST`                    | SMTP server address                                                                                                                            | `smtp.gmail.com`                |
| `SMTP_PORT`                    | SMTP port number, 1-65535                                                                                                                      | `465`                           |
| `SMTP_SECURE`                  | Use implicit TLS on port 465; set `false` on port 587 to require STARTTLS before authentication                                                | `true`                          |
| `EMAIL_USER`                   | Email username                                                                                                                                 | `your-email@gmail.com`          |
| `EMAIL_PASS`                   | Email password/app password                                                                                                                    | `your-app-password`             |
| `EMAIL_ADDRESS`                | Outgoing From address and reply-all account identity; defaults to `EMAIL_USER`                                                                 | `your-email@gmail.com`          |
| `IMAP_TLS_REJECT_UNAUTHORIZED` | Verify the IMAP TLS certificate; defaults to `true`                                                                                            | `true`                          |
| `SMTP_TLS_REJECT_UNAUTHORIZED` | Verify the SMTP TLS certificate; defaults to `true`                                                                                            | `true`                          |
| `MAIL_ALLOWED_ROOTS`           | Existing attachment read/write roots. Local attachment access is disabled when unset. Separate roots with `:` on macOS/Linux or `;` on Windows | `/Users/me/Documents:/tmp/mail` |
| `MAIL_MAX_ATTACHMENT_BYTES`    | Per-attachment and total attachment limit; defaults to 25 MiB, maximum 1 GiB                                                                   | `26214400`                      |
| `MAIL_MAX_MESSAGE_BYTES`       | Maximum bytes parsed in memory for one message; defaults to 25 MiB, maximum 1 GiB                                                              | `26214400`                      |
| `MAIL_MAX_BASE64_BYTES`        | Maximum attachment size returned as Base64; defaults to 1 MiB, maximum 100 MiB                                                                 | `1048576`                       |
| `MAIL_MAX_BODY_CHARACTERS`     | Maximum returned characters for each text or HTML body; defaults to 200000, maximum 10000000                                                   | `200000`                        |
| `MAIL_MAX_RESPONSE_CHARACTERS` | Maximum combined text and HTML characters returned by one body-reading tool call; defaults to 2000000, maximum 100000000                       | `2000000`                       |
| `MAIL_MAX_SEARCH_CANDIDATES`   | Maximum message headers inspected across one search or reply-state tool call; defaults to 5000, maximum 100000                                 | `5000`                          |
| `MAIL_MAX_SEARCH_HEADER_BYTES` | Maximum raw requested-header bytes buffered across one search or reply-state tool call; defaults to 16 MiB, maximum 1 GiB                      | `16777216`                      |

Search results include `sourceMailbox`, `uid`, and `uidValidity`. Pass these values back unchanged when reading, replying, moving, downloading attachments, or deleting so identical UIDs in different mailboxes cannot resolve to the wrong message. Unstable IMAP sequence numbers are not exposed as message IDs. `size` is the server-provided RFC822 byte size and is `null` when the server omits it. Search returns summaries by default; use `get_message` for full bodies and attachment metadata, or set `includeBody: true` explicitly.

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
EMAIL_ADDRESS=your-email@gmail.com
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
- **Require transport encryption**: IMAP requires implicit TLS. SMTP uses implicit TLS when `SMTP_SECURE=true` and requires STARTTLS before authentication when it is `false`
- **Keep certificate verification enabled**: Leave both TLS `REJECT_UNAUTHORIZED` settings at their default `true` unless you control and explicitly trust a private certificate authority
- **Protect stored credentials**: MCP clients may save `EMAIL_PASS` in their local configuration. Restrict file permissions and never commit credentials to version control
- **Keep local env files private**: `.env` and `.env.*` are ignored by Git; use a sanitized `.env.example` only when sharing configuration templates

## Development

Development and runtime require Node.js 22.13 or newer. The repository pins Node.js 22.23.0 LTS in `.nvmrc` for local development.

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

   Run the complete local quality gate with:

   ```bash
   npm run check
   ```

   Use `npm run format`, `npm run lint:fix`, `npm run format:check`, and `npm run lint` for focused formatting and linting workflows.

   Rollup resolves and transpiles `src/*.ts` directly into the single-file release bundle. Local TypeScript imports omit file extensions, while third-party package subpaths retain the extensions published by those packages. `tsc` performs type checking only and tests load source through `tsx`. Runtime libraries remain external and are installed from the package's declared `dependencies`.

4. **Set environment variables**:

   ```bash
   export IMAP_HOST=your-imap-server.com
   export IMAP_PORT=993
   export IMAP_SECURE=true
   export SMTP_HOST=your-smtp-server.com
   export SMTP_PORT=465
   export SMTP_SECURE=true
   export EMAIL_USER=your-email@domain.com
   export EMAIL_ADDRESS=your-email@domain.com
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

The command builds the project and opens the version-pinned MCP Inspector 1.0.0 UI. In the connection pane, configure:

- Transport Type: `STDIO`
- Command: `node`
- Arguments: `dist/index.js`
- Environment Variables: the IMAP, SMTP, username, and password variables listed above

Click **Connect**, open **Tools**, and call `check_connection` to verify IMAP and SMTP before testing search, read, or send tools. Other tools auto-connect as needed. Attachment tools also require `MAIL_ALLOWED_ROOTS`.

The MCP server and the version-pinned Inspector both require Node.js 22.13 or newer.

## Release notes

<details open>
<summary><strong>v2.0.2</strong> — restore complete message and attachment parsing</summary>

**Fixed**

- Fetch each complete RFC822 message as one IMAP body stream so providers such as Gmail cannot reorder separately requested header and text sections, restoring headers, Message-ID, attachment metadata, and attachment downloads.

</details>

<details>
<summary><strong>v2.0.1</strong> — restore Sent-folder saves on current Node.js releases</summary>

**Fixed**

- Restore IMAP APPEND on Node.js 23 and newer by letting the mail server assign `INTERNALDATE`, avoiding the removed `util.isDate` API in `imap@0.8.19`.

</details>

<details>
<summary><strong>v2.0.0</strong> — smaller tool surface and safer mail operations</summary>

**Breaking changes**

- Replaced 25 overlapping tools with 12 focused tools, including unified `search_messages`, `check_connection`, `find_unreplied_messages`, and recurring-report `continue_email_thread`.
- Removed implicit mailbox state and redundant connection, search, count, and attachment-metadata tools.

**Fixed**

- Apply exact date ranges before result limits, preserve reply-all recipients, and determine reply state from thread headers.
- Use targeted UID EXPUNGE so deleting one message cannot expunge other messages already marked `\\Deleted`.
- Return lightweight search summaries by default and fetch full bodies only for selected results.
- Return RFC822 message sizes when available (`null` otherwise) and structured, password-redacted diagnostics when saving a sent copy fails.
- Reject missing UIDs before move/delete, bound header and batch memory, verify SMTP live, and enforce one candidate budget across every search path.
- Keep runtime libraries as declared npm dependencies and reject undeclared external imports from the release bundle.

</details>

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

## Star History

<a href="https://www.star-history.com/?repos=yunfeizhu%2Fmcp-mail-server&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=yunfeizhu/mcp-mail-server&type=date&theme=dark&legend=top-left&sealed_token=D25BFoz0nGKX7s4KmXe3x8mPcUiHq4HcwGCJr8LRZ1bOh3O9kYp1Ghc9B3bangB64vdDMw2eKlYH0ZLHl-R6suQD-c8A9G_FlEgziC3ANIGhsyXsv2w74pHl7LvDH0ZNji88Td7y8rf38gK4XEw7Faog6Rs82mrxQGJjvD10bWiuOECL4gUazenKKGVc" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=yunfeizhu/mcp-mail-server&type=date&legend=top-left&sealed_token=D25BFoz0nGKX7s4KmXe3x8mPcUiHq4HcwGCJr8LRZ1bOh3O9kYp1Ghc9B3bangB64vdDMw2eKlYH0ZLHl-R6suQD-c8A9G_FlEgziC3ANIGhsyXsv2w74pHl7LvDH0ZNji88Td7y8rf38gK4XEw7Faog6Rs82mrxQGJjvD10bWiuOECL4gUazenKKGVc" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=yunfeizhu/mcp-mail-server&type=date&legend=top-left&sealed_token=D25BFoz0nGKX7s4KmXe3x8mPcUiHq4HcwGCJr8LRZ1bOh3O9kYp1Ghc9B3bangB64vdDMw2eKlYH0ZLHl-R6suQD-c8A9G_FlEgziC3ANIGhsyXsv2w74pHl7LvDH0ZNji88Td7y8rf38gK4XEw7Faog6Rs82mrxQGJjvD10bWiuOECL4gUazenKKGVc" />
 </picture>
</a>

## Contributing

Bug reports, feature ideas, and pull requests are welcome. Start with the [issue tracker](https://github.com/yunfeizhu/mcp-mail-server/issues) or open a pull request directly.

## License

Released under the [MIT License](LICENSE).

---

<div align="center">

[npm](https://www.npmjs.com/package/mcp-mail-server) · [GitHub](https://github.com/yunfeizhu/mcp-mail-server) · [Issues](https://github.com/yunfeizhu/mcp-mail-server/issues) · [Changelog](CHANGELOG.md)

</div>

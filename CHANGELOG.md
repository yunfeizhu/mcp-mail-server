# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-07-21

### Breaking Changes

- Raised the minimum supported Node.js version from 18 to 22.13
- Reduced the public MCP surface from 25 overlapping tools to 12 focused tools
- Replaced connection tools with `check_connection`, search variants with `search_messages`, and the old unreplied search with `find_unreplied_messages`
- Removed `open_mailbox`, `disconnect_all`, `get_message_count`, `get_attachments`, and the legacy search aliases; mailbox selection is now explicit in search and message references
- Search results now omit message bodies by default; use `get_message` or set `includeBody: true` when full content is required

### Fixed

- Inspect all bounded candidates, sort by IMAP internal date, and apply exact date/time filtering before the result limit so imported messages and valid older matches are not discarded
- Widen IMAP calendar-day search criteria before exact timestamp filtering so INTERNALDATE timezone offsets cannot exclude valid boundary messages
- Determine unreplied state from `In-Reply-To` and `References`, keep replies outside the received-message date range, and report missing Message-ID as unknown
- Preserve Reply-To, To, and CC recipients in reply-all while excluding the configured account address
- Permanently delete only the requested UID with UIDPLUS and roll back the `\\Deleted` flag when targeted expunge fails
- Add stricter schemas and runtime bounds for batch reads, mailbox lists, keywords, attachment indexes, and boolean options
- Request RFC822 message sizes during IMAP fetches and return `size: null`, rather than a misleading zero, when a server omits the value
- Preserve the reason a sent-copy save failed through a password-redacted, structured `sentFolderError`
- Reject plaintext IMAP configurations and require STARTTLS before SMTP authentication when implicit TLS is disabled
- Fail moving safely when the server has neither MOVE nor UIDPLUS instead of using a global-EXPUNGE fallback
- Enforce every advertised tool input schema on the server, including booleans, array bounds, required alternatives, and unknown properties
- Preserve HTML-only replies without creating an empty plain-text alternative, and convert quoted HTML to safe readable text
- Bound attachment MIME buffering even when a server omits RFC822 size metadata
- Resolve attachment directories one component at a time, create downloads exclusively, and verify the opened inode and canonical path before reading or writing so parent-directory swaps and symlink paths cannot escape `MAIL_ALLOWED_ROOTS`
- Reject IMAP initialization when the connection ends before `ready` instead of leaving the tool call pending forever
- Verify a UID still exists before reporting a move or permanent delete as successful
- Bound oversized headers and hydrate full-message batches one message at a time so per-message limits cannot multiply into multi-gigabyte peaks
- Enforce `MAIL_MAX_SEARCH_CANDIDATES` for every inspected header, including searches without date filters and both phases of reply-state analysis
- Preserve case-distinct mailbox names other than the RFC-defined case-insensitive `INBOX`
- Actively re-verify SMTP on every `check_connection` call instead of treating a cached transporter as a live connection
- Handle IMAP `close` as a terminal connection event both before and after `ready`, and force-release sockets when graceful disconnect times out
- Reject incomplete `get_messages` batches before fetching bodies instead of silently omitting missing UIDs
- Preserve HTML-only originals in plain-text replies and truncate oversized quoted content without discarding the new reply or signature
- Shut down IMAP, SMTP, and MCP transports on stdio EOF, SIGINT, SIGTERM, or SIGHUP so client disconnects do not leave a mail process running
- Disable unused IMAP ENVELOPE/BODYSTRUCTURE fetches, request only required search headers, and cap aggregate inspected header bytes with `MAIL_MAX_SEARCH_HEADER_BYTES`
- Revalidate cached sent mailboxes before reuse and refresh `destinationUidValidity` after a successful move when a destination UID is available
- Mark external mailbox tools with accurate MCP open-world annotations
- Reject unsafe IMAP keyword atoms before connecting so whitespace, control characters, and protocol syntax cannot alter or inject search commands
- Enforce `MAIL_MAX_SEARCH_HEADER_BYTES` while IMAP header streams are buffered instead of checking only after every candidate has already been fetched
- Implement the UIDPLUS move fallback explicitly and return a structured partial error whenever COPY succeeded but source cleanup failed, even if the server omitted COPYUID
- Reopen and verify the source UID after UIDPLUS move or delete cleanup errors; roll back `\\Deleted` when possible and report a structured unknown deletion outcome when transport failure prevents confirmation
- Verify every mailbox advertised with the RFC 6154 `\\Sent` attribute before caching it, then continue to conventional name fallbacks only when none is selectable
- Fail `includeBody` searches explicitly when a selected message disappears during hydration instead of silently returning a header-only summary
- Let Rollup resolve and transpile TypeScript source directly without temporary JavaScript output or compiler file watchers; keep `tsc` as a no-emit type checker
- Bound tool string lengths, require safe-integer resource limits and valid 1-65535 ports, and cap configurable memory/search limits
- Restore and smoke-test the release bundle after every test run, and rebuild it during `npm pack`, so the published entry point cannot reference omitted TypeScript output files
- Return structured partial attachment-save results with already-created paths instead of hiding files written before a later failure
- Classify all sent-mailbox selection failures as `SENT_MAILBOX_NOT_FOUND` instead of an APPEND failure
- Stop exposing unstable IMAP sequence numbers as message `id`, remove ineffective `limit` advice from header-budget errors, and ignore local `.env` files
- Reject in-flight IMAP operations when the underlying connection errors, ends, or closes so one lost socket cannot deadlock the serialized tool queue
- Recheck UIDVALIDITY inside permanent deletion after its read-write SELECT, preventing a mailbox rebuild from reusing the requested UID
- Enforce `MAIL_MAX_RESPONSE_CHARACTERS` across all text and HTML bodies returned by one tool call instead of multiplying the per-body cap across a batch
- Widen exact-time IMAP candidate dates by two days for the full UTC+14 to UTC-12 spread, preserve case-distinct sent mailbox names outside INBOX, and normalize text-only messages to omit HTML instead of returning `false`
- Pin MCP Inspector 1.0.0 as a development dependency instead of executing an unversioned latest package
- Apply a consistent cross-platform system font stack, 14px base size, and 1.6 line height to outgoing HTML while preserving explicit nested styles
- Preserve `text/plain` while automatically deriving a styled `text/html` alternative for text-only outgoing messages, avoiding monospace rendering in HTML-capable mail clients

### Improved

- Added ESLint 10 Flat Config and Prettier with single quotes, trailing commas, deterministic formatting, and an `npm run check` quality gate
- Fetch lightweight headers for search candidates, then hydrate bodies only for the final selected messages
- Fail with a narrowing hint instead of guessing newest results from UID order; `MAIL_MAX_SEARCH_CANDIDATES` caps all inspected headers across the whole tool call
- Added optional `EMAIL_ADDRESS` as the outgoing From address and reply-all identity for accounts whose login username is not their email address
- Select sent-mailbox candidates read-write before APPEND, retry the next candidate only after a definite non-append, and stop on ambiguous transport failures to avoid duplicate sent copies
- Return per-mailbox APPEND attempts in `sentFolderError`, cache the first successful candidate, and match the RFC 6154 `\\Sent` attribute case-insensitively
- Updated the English and Chinese documentation for the consolidated tool contract
- Added `continue_email_thread` to find the newest exact-subject message in Sent and continue recurring report threads with reply-all and the complete previous body enabled by default
- Standardized all repository-authored source, build configuration, scripts, and tests on TypeScript; JavaScript is now generated only as the published runtime bundle
- Allow extensionless local TypeScript imports in source and tests, with Rollup owning module resolution and tests loading source directly through `tsx`
- Keep runtime libraries external to the application bundle and declare them as npm `dependencies`, producing a small Node.js-native release entry while rejecting undeclared external imports during tests
- Minify production bundles with Terser while keeping development watch output readable and third-party runtime dependencies external
- Align root TypeScript project coverage with editor discovery so source, Rollup/ESLint configuration, and build scripts receive the same strict Node-aware diagnostics; keep only test-double implicit parameters and null assertions relaxed in the test project
- Migrated the deprecated low-level MCP `Server` and manual request handlers to `McpServer.registerTool()`, with Zod-backed schemas and SDK-native input validation

## [1.2.3] - 2026-07-20

### Added

- Added `move_message` to move a mailbox-scoped message to an existing target mailbox, with optional UIDVALIDITY validation
- Added optional plain-text and HTML signatures to `send_email` and `reply_to_email`

### Improved

- Return the destination UID after a move when the IMAP server provides it, with a refresh hint when it does not
- Place reply signatures after the new message body and before the quoted original, while preserving text/plain and text/html alternatives
- Validate move targets and reject attempts to move a message into its current mailbox

### Documentation

- Redesigned the English and Chinese READMEs around use cases, quick setup, grouped tool capabilities, and compact release notes
- Updated Claude Desktop, Cursor, Claude Code, and Codex configuration examples and clarified current authentication and SMTP TLS limitations

## [1.2.2] - 2026-07-20

### Breaking Changes

- Message-specific tools now require `mailbox` alongside UID; responses include `sourceMailbox` and `uidValidity` so messages cannot resolve to a same-numbered UID in another mailbox
- Local attachment reads and writes are disabled unless `MAIL_ALLOWED_ROOTS` is configured

### Security

- Enabled IMAP certificate verification by default, with an explicit opt-out for self-signed deployments
- Added canonical-path allowlists and size limits for local attachments, Base64 output, message parsing, and returned bodies
- Upgraded the MCP SDK, Nodemailer, Mailparser, Rollup, and transitive dependencies; removed the vulnerable minification plugin

### Fixed

- Serialized tool execution to prevent concurrent requests from changing the selected IMAP mailbox mid-operation
- Preserved attachments and reply threading headers in sent-folder copies by generating MIME through Nodemailer
- Fixed stale SMTP initialization state, read-only `markSeen` behavior, sent-folder mailbox state drift, repeated `Re:` prefixes, and oldest-first unreplied analysis

### Added

- Split the former monolithic entry point into MCP orchestration, tool definitions, connection management, search services, shared types, and mail utilities
- Added `npm run dev:inspector` for browser-based MCP connection and tool testing
- Added unit coverage for serialization, message references, path policy, MIME generation, search behavior, and an end-to-end MCP stdio handshake

## [1.2.1] - 2026-03-18

### Fixed

- Fixed search criteria (FROM/TO/SUBJECT/BODY/KEYWORD/SINCE) not using nested array format, causing errors on TO and other searches
- Fixed `search()` wrapping criteria in an extra array, breaking compound search conditions
- Fixed `deleteMessage()` failing silently when the mailbox was opened in read-only mode
- Fixed `getRecentMessages()` misusing the IMAP `RECENT` flag; now fetches latest N messages by UID
- Fixed `getRecentMessages()` / `getUnseenMessages()` relying on leftover mailbox state from previous operations
- Fixed `cleanReplySubject()` only stripping one `Re:` prefix layer, causing false negatives in unreplied detection
- Fixed email date stored as locale string causing inconsistent `new Date()` parsing across platforms; changed to ISO 8601
- Fixed `ensureIMAPConnection()` having no timeout while waiting for concurrent initialization
- Fixed `saveSentMessage()` always returning `sentFolderSaved: true` even when save failed
- Fixed `handleGetMessages()` / `handleDeleteMessage()` relying on `currentBox` state to locate messages
- Fixed `reply_to_email` writing literal `"undefined"` into the body when `text` is empty

### Added

- All search tools now support an `inboxOnly` parameter to restrict search to INBOX only

### Improved

- `ensureSMTPConnection()` now has concurrency guard with 30-second timeout, consistent with IMAP
- Sent mailbox auto-detected via RFC 6154 `\Sent` special-use attribute with result caching, compatible with all mail providers
- `saveMessageToFolder()` simplified; skips saving if no sent folder is found
- Search now uses `slice(-limit)` to fetch the newest messages first, preventing empty results after date filtering
- HTML-escape applied to quoted content in reply emails to prevent XSS injection

## [1.2.0] - 2026-03-08

### Added

- Attachment management: retrieve attachment metadata and download attachments to local path
- Enhanced multi-mailbox search capabilities

### Fixed

- Added `socketTimeout` to IMAP connection to prevent hangs
- Limited batch message fetching to prevent IMAP timeout on large mailboxes

## [1.1.16] - 2026-03-08

### Changed

- Reverted to 1.1.13 codebase, discarding experimental changes

## [1.1.15] - 2026-03-05

### Documentation

- Restructured README and reformatted tools section

## [1.1.14] - 2026-03-05

### Added

- New `export_attachment` tool to save attachments to a local path

### Documentation

- Overhauled README with improved attachment documentation and tool descriptions

## [1.1.13] - 2025-12-18

### Added

- Support for reading email attachment content
- IMAP connection now supports self-signed certificates (via PR #1)

## [1.1.12] - 2025-09-22

### Improved

- Added result count limit to search to avoid returning too many messages
- Improved unreplied message detection algorithm

## [1.1.11] - 2025-09-05

### Fixed

- Improved message lookup logic across multiple mailboxes
- Fixed error when marking messages as read

## [1.1.10] - 2025-08-25

### Improved

- Implemented improved unreplied message detection algorithm with better accuracy

## [1.1.9] - 2025-08-21

### Added

- New tool to search for unreplied messages from a specific sender

## [1.1.8] - 2025-08-20

### Changed

- Refactored unreplied message search and related flag operations
- Simplified reply subject construction logic

## [1.1.7] - 2025-08-20

### Added

- New email flag management (mark as read/unread, etc.)
- New unreplied message search functionality

## [1.1.6] - 2025-08-20

### Fixed

- Removed required body content validation when replying to emails

## [1.1.5] - 2025-08-20

### Improved

- Added account consistency check
- Optimized IMAP/SMTP connection management logic

## [1.1.4] - 2025-08-20

### Added

- New reply-to-email feature with original message quoting
- Improved email processing flow

## [1.1.3] - 2025-08-08

### Documentation

- Improved build configuration and documentation

## [1.1.2] - 2025-08-08

### Improved

- Enhanced email search with expanded search criteria support

## [1.1.1] - 2025-08-03

### Improved

- Improved email client connection management and error handling
- Removed standalone IMAP disconnect, enhanced environment variable handling

## [1.1.0] - 2025-07-30

### Changed

- Migrated from POP3 to IMAP protocol for more complete email operations
- Integrated mailparser library for improved email parsing

## [1.0.1] - 2025-07-30

### Changed

- Updated rollup build configuration
- Added Chinese README documentation

## [1.0.0] - 2025-07-30

### Added

- Initial release
- MCP-based mail server core functionality
- Support for sending, receiving, searching, and connection management

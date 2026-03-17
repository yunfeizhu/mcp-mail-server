# Changelog

All notable changes to this project will be documented in this file.

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

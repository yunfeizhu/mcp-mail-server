import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const MAIL_TOOLS: Tool[] = [
          // === 连接管理 ===
          {
            name: 'connect_all',
            description: 'Connect to both IMAP and SMTP servers simultaneously',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          // === 邮箱浏览 ===
          {
            name: 'list_mailboxes',
            description: 'List all available mailboxes (folders). Auto-connects if not already connected.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'open_mailbox',
            description: 'Open a specific mailbox (folder) and optionally retrieve sent mailbox info. Due to IMAP protocol limitations, only one mailbox stays open. Auto-connects if not already connected.',
            inputSchema: {
              type: 'object',
              properties: {
                mailboxName: {
                  type: 'string',
                  description: 'Name of the mailbox to open (default: INBOX)',
                  default: 'INBOX'
                },
                readOnly: {
                  type: 'boolean',
                  description: 'Open mailbox in read-only mode (default: false)',
                  default: false
                },
                openSent: {
                  type: 'boolean',
                  description: 'Also retrieve sent mailbox information (default: true)',
                  default: true
                }
              },
            },
          },
          // === 邮件搜索 ===
          {
            name: 'get_message_count',
            description: 'Get the total number of messages in INBOX. Auto-connects if not already connected.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_unseen_messages',
            description: 'Get unseen (unread) messages. Returns the most recent unseen messages up to the specified limit. Auto-connects if not already connected.',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of messages to fetch (default: 50)',
                  default: 50,
                  minimum: 1,
                  maximum: 200,
                },
              },
            },
          },
          {
            name: 'get_recent_messages',
            description: 'Get recent messages. Returns the most recent messages up to the specified limit. Auto-connects if not already connected.',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of messages to fetch (default: 50)',
                  default: 50,
                  minimum: 1,
                  maximum: 200
                },
              },
            },
          },
          {
            name: 'search_by_sender',
            description: 'Search messages from a specific sender with optional date range. Auto-connects if not already connected.',
            inputSchema: {
              type: 'object',
              properties: {
                sender: {
                  type: 'string',
                  description: 'Email address of the sender to search for'
                },
                startDate: {
                  type: 'string',
                  description: 'Optional start date/time for filtering. Supports multiple formats: "2025-07-01", "2025-07-01 14:30:00", "01-Jul-2025", or ISO format. Leave empty to not filter by start date.'
                },
                endDate: {
                  type: 'string',
                  description: 'Optional end date/time for filtering. Supports multiple formats: "2025-08-01", "2025-08-01 23:59:59", "01-Aug-2025", or ISO format. Leave empty to not filter by end date.'
                },
                inboxOnly: {
                  type: 'boolean',
                  description: 'If true, only search INBOX and skip the sent folder (default: false).',
                  default: false
                }
              },
              required: ['sender'],
            },
          },
          {
            name: 'search_by_subject',
            description: 'Search messages by subject keywords with optional date range. Auto-connects if not already connected.',
            inputSchema: {
              type: 'object',
              properties: {
                subject: {
                  type: 'string',
                  description: 'Keywords to search in email subject'
                },
                startDate: {
                  type: 'string',
                  description: 'Optional start date/time for filtering. Supports multiple formats: "2025-07-01", "2025-07-01 14:30:00", "01-Jul-2025", or ISO format. Leave empty to not filter by start date.'
                },
                endDate: {
                  type: 'string',
                  description: 'Optional end date/time for filtering. Supports multiple formats: "2025-08-01", "2025-08-01 23:59:59", "01-Aug-2025", or ISO format. Leave empty to not filter by end date.'
                },
                inboxOnly: {
                  type: 'boolean',
                  description: 'If true, only search INBOX and skip the sent folder (default: false).',
                  default: false
                }
              },
              required: ['subject'],
            },
          },
          {
            name: 'search_by_recipient',
            description: 'Search messages sent to a specific recipient email address with optional date range. Auto-connects if not already connected.',
            inputSchema: {
              type: 'object',
              properties: {
                recipient: {
                  type: 'string',
                  description: 'Email address of the recipient to search for'
                },
                startDate: {
                  type: 'string',
                  description: 'Optional start date/time for filtering. Supports multiple formats: "2025-07-01", "2025-07-01 14:30:00", "01-Jul-2025", or ISO format. Leave empty to not filter by start date.'
                },
                endDate: {
                  type: 'string',
                  description: 'Optional end date/time for filtering. Supports multiple formats: "2025-08-01", "2025-08-01 23:59:59", "01-Aug-2025", or ISO format. Leave empty to not filter by end date.'
                },
                inboxOnly: {
                  type: 'boolean',
                  description: 'If true, only search INBOX and skip the sent folder (default: false).',
                  default: false
                }
              },
              required: ['recipient'],
            },
          },
          {
            name: 'search_since_date',
            description: 'Search messages from a specific date until now (not for date ranges). Use search_messages for complex date ranges.',
            inputSchema: {
              type: 'object',
              properties: {
                date: {
                  type: 'string',
                  description: 'Start date to search from (searches from this date to present). Formats: "April 20, 2010", "20-Apr-2010", or "2010-04-20"'
                },
                inboxOnly: {
                  type: 'boolean',
                  description: 'If true, only search INBOX and skip the sent folder (default: false).',
                  default: false
                }
              },
              required: ['date'],
            },
          },
          {
            name: 'search_unread_from_sender',
            description: 'Search unread messages from a specific sender with optional date range (demonstrates AND logic). Auto-connects if not already connected.',
            inputSchema: {
              type: 'object',
              properties: {
                sender: {
                  type: 'string',
                  description: 'Email address of the sender'
                },
                startDate: {
                  type: 'string',
                  description: 'Optional start date/time for filtering. Supports multiple formats: "2025-07-01", "2025-07-01 14:30:00", "01-Jul-2025", or ISO format. Leave empty to not filter by start date.'
                },
                endDate: {
                  type: 'string',
                  description: 'Optional end date/time for filtering. Supports multiple formats: "2025-08-01", "2025-08-01 23:59:59", "01-Aug-2025", or ISO format. Leave empty to not filter by end date.'
                },
                inboxOnly: {
                  type: 'boolean',
                  description: 'If true, only search INBOX and skip the sent folder (default: false).',
                  default: false
                }
              },
              required: ['sender'],
            },
          },
          {
            name: 'search_unreplied_from_sender',
            description: 'Search unreplied messages from a specific sender with optional date range. Identifies messages that have not been replied to by checking for corresponding reply messages. Auto-connects if not already connected.',
            inputSchema: {
              type: 'object',
              properties: {
                sender: {
                  type: 'string',
                  description: 'Email address of the sender to search for unreplied messages'
                },
                startDate: {
                  type: 'string',
                  description: 'Optional start date/time for filtering. Supports multiple formats: "2025-07-01", "2025-07-01 14:30:00", "01-Jul-2025", or ISO format. Leave empty to not filter by start date.'
                },
                endDate: {
                  type: 'string',
                  description: 'Optional end date/time for filtering. Supports multiple formats: "2025-08-01", "2025-08-01 23:59:59", "01-Aug-2025", or ISO format. Leave empty to not filter by end date.'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of messages to process from each search (default: 10, maximum: 200). Since unreplied emails are typically few, smaller limits are recommended.',
                  default: 10,
                  minimum: 1,
                  maximum: 200
                },
                inboxOnly: {
                  type: 'boolean',
                  description: 'If true, only search INBOX and skip the sent folder (default: false).',
                  default: false
                }
              },
              required: ['sender'],
            },
          },
          {
            name: 'search_by_body',
            description: 'Search messages containing specific text in the body with optional date range. Auto-connects if not already connected.',
            inputSchema: {
              type: 'object',
              properties: {
                text: {
                  type: 'string',
                  description: 'Text to search for in message body'
                },
                startDate: {
                  type: 'string',
                  description: 'Optional start date/time for filtering. Supports multiple formats: "2025-07-01", "2025-07-01 14:30:00", "01-Jul-2025", or ISO format. Leave empty to not filter by start date.'
                },
                endDate: {
                  type: 'string',
                  description: 'Optional end date/time for filtering. Supports multiple formats: "2025-08-01", "2025-08-01 23:59:59", "01-Aug-2025", or ISO format. Leave empty to not filter by end date.'
                },
                inboxOnly: {
                  type: 'boolean',
                  description: 'If true, only search INBOX and skip the sent folder (default: false).',
                  default: false
                }
              },
              required: ['text'],
            },
          },
          {
            name: 'search_with_keyword',
            description: 'Search messages with specific keyword/flag with optional date range. Auto-connects if not already connected.',
            inputSchema: {
              type: 'object',
              properties: {
                keyword: {
                  type: 'string',
                  description: 'Keyword to search for'
                },
                startDate: {
                  type: 'string',
                  description: 'Optional start date/time for filtering. Supports multiple formats: "2025-07-01", "2025-07-01 14:30:00", "01-Jul-2025", or ISO format. Leave empty to not filter by start date.'
                },
                endDate: {
                  type: 'string',
                  description: 'Optional end date/time for filtering. Supports multiple formats: "2025-08-01", "2025-08-01 23:59:59", "01-Aug-2025", or ISO format. Leave empty to not filter by end date.'
                },
                inboxOnly: {
                  type: 'boolean',
                  description: 'If true, only search INBOX and skip the sent folder (default: false).',
                  default: false
                }
              },
              required: ['keyword'],
            },
          },
          {
            name: 'search_all_messages',
            description: 'Search messages in INBOX and the detected sent mailbox with optional date range and limit. Auto-connects if needed.',
            inputSchema: {
              type: 'object',
              properties: {
                startDate: {
                  type: 'string',
                  description: 'Optional start date/time for filtering. Supports multiple formats: "2025-07-01", "2025-07-01 14:30:00", "01-Jul-2025", or ISO format. Leave empty to not filter by start date.'
                },
                endDate: {
                  type: 'string',
                  description: 'Optional end date/time for filtering. Supports multiple formats: "2025-08-01", "2025-08-01 23:59:59", "01-Aug-2025", or ISO format. Leave empty to not filter by end date.'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of messages to return (default: 50). Use a smaller value for faster results.',
                  default: 50,
                  minimum: 1,
                  maximum: 200
                },
                inboxOnly: {
                  type: 'boolean',
                  description: 'If true, only search INBOX and skip the sent folder (default: false).',
                  default: false
                }
              },
              required: [],
            },
          },
          // === 邮件读取 ===
          {
            name: 'get_messages',
            description: 'Retrieve multiple messages by UID from a specific mailbox. Auto-connects if not already connected.',
            inputSchema: {
              type: 'object',
              properties: {
                mailbox: {
                  type: 'string',
                  description: 'Mailbox containing the messages, as returned in sourceMailbox'
                },
                uidValidity: {
                  type: 'number',
                  description: 'Optional UIDVALIDITY returned with the message reference'
                },
                uids: {
                  type: 'array',
                  description: 'Array of message UIDs to retrieve',
                  items: {
                    type: 'number'
                  }
                },
                markSeen: {
                  type: 'boolean',
                  description: 'Mark messages as seen when retrieving (default: false)',
                  default: false
                }
              },
              required: ['mailbox', 'uids'],
            },
          },
          {
            name: 'get_message',
            description: 'Retrieve a specific email message by mailbox and UID. Auto-connects if not already connected.',
            inputSchema: {
              type: 'object',
              properties: {
                mailbox: {
                  type: 'string',
                  description: 'Mailbox containing the message, as returned in sourceMailbox'
                },
                uidValidity: {
                  type: 'number',
                  description: 'Optional UIDVALIDITY returned with the message reference'
                },
                uid: {
                  type: 'number',
                  description: 'Message UID to retrieve',
                },
                markSeen: {
                  type: 'boolean',
                  description: 'Mark message as seen when retrieving (default: false)',
                  default: false
                }
              },
              required: ['mailbox', 'uid'],
            },
          },
          // === 邮件发送 ===
          {
            name: 'send_email',
            description: 'Send an email via SMTP. Auto-connects to SMTP server if not already connected.',
            annotations: {
              readOnlyHint: false,
              destructiveHint: false,
              idempotentHint: false,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                to: {
                  type: 'string',
                  description: 'Recipient email address(es), comma-separated',
                },
                subject: {
                  type: 'string',
                  description: 'Email subject',
                },
                text: {
                  type: 'string',
                  description: 'Plain text email body',
                },
                html: {
                  type: 'string',
                  description: 'HTML email body (optional)',
                },
                cc: {
                  type: 'string',
                  description: 'CC recipients, comma-separated (optional)',
                },
                bcc: {
                  type: 'string',
                  description: 'BCC recipients, comma-separated (optional)',
                },
                attachments: {
                  type: 'array',
                  description: 'Array of absolute file paths to attach (optional)',
                  items: {
                    type: 'string'
                  }
                },
              },
              required: ['to', 'subject'],
            },
          },
          {
            name: 'reply_to_email',
            description: 'Reply to a specific email by mailbox and UID. Sets reply threading headers, adds Re: prefix, and can include the original message.',
            annotations: {
              readOnlyHint: false,
              destructiveHint: false,
              idempotentHint: false,
              openWorldHint: true,
            },
            inputSchema: {
              type: 'object',
              properties: {
                mailbox: {
                  type: 'string',
                  description: 'Mailbox containing the original message, as returned in sourceMailbox'
                },
                uidValidity: {
                  type: 'number',
                  description: 'Optional UIDVALIDITY returned with the message reference'
                },
                originalUid: {
                  type: 'number',
                  description: 'UID of the original message to reply to',
                },
                text: {
                  type: 'string',
                  description: 'Reply message text',
                },
                html: {
                  type: 'string',
                  description: 'Reply message HTML (optional)',
                },
                replyToAll: {
                  type: 'boolean',
                  description: 'Reply to all recipients instead of just sender (default: false)',
                  default: false
                },
                includeOriginal: {
                  type: 'boolean',
                  description: 'Include original message in reply (default: true)',
                  default: true
                },
              },
              required: ['mailbox', 'originalUid'],
            },
          },
          // === 邮件管理 ===
          {
            name: 'delete_message',
            description: 'Delete a specific email message by mailbox and UID. Auto-connects if not already connected.',
            annotations: {
              readOnlyHint: false,
              destructiveHint: true,
              idempotentHint: false,
              openWorldHint: false,
            },
            inputSchema: {
              type: 'object',
              properties: {
                mailbox: {
                  type: 'string',
                  description: 'Mailbox containing the message, as returned in sourceMailbox'
                },
                uidValidity: {
                  type: 'number',
                  description: 'Optional UIDVALIDITY returned with the message reference'
                },
                uid: {
                  type: 'number',
                  description: 'Message UID to delete',
                },
              },
              required: ['mailbox', 'uid'],
            },
          },
          // === 附件管理 ===
          {
            name: 'get_attachments',
            description: 'Get attachment metadata for a specific email by mailbox and UID. Does not download attachment content.',
            inputSchema: {
              type: 'object',
              properties: {
                mailbox: {
                  type: 'string',
                  description: 'Mailbox containing the message, as returned in sourceMailbox'
                },
                uidValidity: {
                  type: 'number',
                  description: 'Optional UIDVALIDITY returned with the message reference'
                },
                uid: {
                  type: 'number',
                  description: 'Message UID to get attachments for',
                },
              },
              required: ['mailbox', 'uid'],
            },
          },
          {
            name: 'save_attachment',
            description: 'Download and save email attachments to local file system. Can save a single attachment by index or all attachments. Auto-connects if not already connected.',
            annotations: {
              readOnlyHint: false,
              destructiveHint: true,
              idempotentHint: false,
              openWorldHint: false,
            },
            inputSchema: {
              type: 'object',
              properties: {
                mailbox: {
                  type: 'string',
                  description: 'Mailbox containing the message, as returned in sourceMailbox'
                },
                uidValidity: {
                  type: 'number',
                  description: 'Optional UIDVALIDITY returned with the message reference'
                },
                uid: {
                  type: 'number',
                  description: 'Message UID containing the attachment(s)',
                },
                savePath: {
                  type: 'string',
                  description: 'Absolute path to the directory where attachments will be saved',
                },
                attachmentIndex: {
                  type: 'number',
                  description: 'Index of the specific attachment to save (0-based). If omitted, all attachments will be saved.',
                },
                returnBase64: {
                  type: 'boolean',
                  description: 'Whether to also return base64-encoded content in the response (default: false)',
                  default: false,
                },
              },
              required: ['mailbox', 'uid', 'savePath'],
            },
          },
          // === 连接管理 ===
          {
            name: 'get_connection_status',
            description: 'Check the current connection status of both IMAP and SMTP servers.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'disconnect_all',
            description: 'Disconnect from both IMAP and SMTP servers. Only disconnects if currently connected.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },

];

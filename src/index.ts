import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { IMAPClient, IMAPConfig } from './imap-client.js';
import { SMTPClient, SMTPConfig, EmailOptions } from './smtp-client.js';
import { EMAIL_CONFIG } from './config.js';

class MailMCPServer {
  private server: Server;
  private imapClient: IMAPClient | null = null;
  private smtpClient: SMTPClient | null = null;

  constructor() {
    // 验证配置
    this.validateConfig();
    this.server = new Server(
      {
        name: 'mcp-mail',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      if (this.imapClient) {
        await this.imapClient.disconnect();
      }
      if (this.smtpClient) {
        await this.smtpClient.disconnect();
      }
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'connect_imap',
            description: 'Connect to IMAP email server (using preconfigured settings)',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'open_mailbox',
            description: 'Open a specific mailbox (folder)',
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
                }
              },
            },
          },
          {
            name: 'list_mailboxes',
            description: 'List all available mailboxes (folders)',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'search_messages',
            description: 'Search messages using IMAP search criteria',
            inputSchema: {
              type: 'object',
              properties: {
                criteria: {
                  type: 'array',
                  description: 'IMAP search criteria array. Examples: ["UNSEEN"], ["FROM", "user@example.com"], ["SUBJECT", "meeting"], ["BODY", "urgent"], ["SINCE", "April 20, 2010"], ["LARGER", "1000"], ["KEYWORD", "Important"], ["HEADER", "X-Custom", "value"], ["OR", "UNSEEN", ["SINCE", "April 20, 2010"]], ["!SEEN"] (negation). Default: searches ALL messages.',
                  items: {}
                }
              },
            },
          },
          {
            name: 'search_by_sender',
            description: 'Search messages from a specific sender',
            inputSchema: {
              type: 'object',
              properties: {
                sender: {
                  type: 'string',
                  description: 'Email address of the sender to search for'
                }
              },
              required: ['sender'],
            },
          },
          {
            name: 'search_by_subject',
            description: 'Search messages by subject keywords',
            inputSchema: {
              type: 'object',
              properties: {
                subject: {
                  type: 'string',
                  description: 'Keywords to search in email subject'
                }
              },
              required: ['subject'],
            },
          },
          {
            name: 'search_since_date',
            description: 'Search messages since a specific date',
            inputSchema: {
              type: 'object',
              properties: {
                date: {
                  type: 'string',
                  description: 'Date in various formats like "April 20, 2010", "20-Apr-2010", or "2010-04-20"'
                }
              },
              required: ['date'],
            },
          },
          {
            name: 'search_unread_from_sender',
            description: 'Search unread messages from a specific sender (demonstrates AND logic)',
            inputSchema: {
              type: 'object',
              properties: {
                sender: {
                  type: 'string',
                  description: 'Email address of the sender'
                }
              },
              required: ['sender'],
            },
          },
          {
            name: 'search_by_body',
            description: 'Search messages containing specific text in the body',
            inputSchema: {
              type: 'object',
              properties: {
                text: {
                  type: 'string',
                  description: 'Text to search for in message body'
                }
              },
              required: ['text'],
            },
          },
          {
            name: 'search_larger_than',
            description: 'Search messages larger than specified size',
            inputSchema: {
              type: 'object',
              properties: {
                size: {
                  type: 'number',
                  description: 'Size in bytes'
                }
              },
              required: ['size'],
            },
          },
          {
            name: 'search_with_keyword',
            description: 'Search messages with specific keyword/flag',
            inputSchema: {
              type: 'object',
              properties: {
                keyword: {
                  type: 'string',
                  description: 'Keyword to search for'
                }
              },
              required: ['keyword'],
            },
          },
          {
            name: 'get_messages',
            description: 'Retrieve multiple messages by their UIDs',
            inputSchema: {
              type: 'object',
              properties: {
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
              required: ['uids'],
            },
          },
          {
            name: 'get_message',
            description: 'Retrieve a specific email message by UID',
            inputSchema: {
              type: 'object',
              properties: {
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
              required: ['uid'],
            },
          },
          {
            name: 'delete_message',
            description: 'Delete a specific email message by UID',
            inputSchema: {
              type: 'object',
              properties: {
                uid: {
                  type: 'number',
                  description: 'Message UID to delete',
                },
              },
              required: ['uid'],
            },
          },
          {
            name: 'get_message_count',
            description: 'Get the total number of messages in current mailbox',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_unseen_messages',
            description: 'Get all unseen (unread) messages',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_recent_messages',
            description: 'Get all recent messages',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'disconnect_imap',
            description: 'Disconnect from the IMAP server',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'connect_smtp',
            description: 'Connect to SMTP email server for sending emails (using preconfigured settings)',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'send_email',
            description: 'Send an email via SMTP',
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
              },
              required: ['to', 'subject'],
            },
          },
          {
            name: 'disconnect_smtp',
            description: 'Disconnect from the SMTP server',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'quick_connect',
            description: 'Connect to both IMAP and SMTP servers at once (using preconfigured settings)',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ] as Tool[],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'connect_imap':
            return await this.handleConnectIMAP();
          case 'open_mailbox':
            return await this.handleOpenMailbox(args);
          case 'list_mailboxes':
            return await this.handleListMailboxes();
          case 'search_messages':
            return await this.handleSearchMessages(args);
          case 'search_by_sender':
            return await this.handleSearchBySender(args);
          case 'search_by_subject':
            return await this.handleSearchBySubject(args);
          case 'search_since_date':
            return await this.handleSearchSinceDate(args);
          case 'search_unread_from_sender':
            return await this.handleSearchUnreadFromSender(args);
          case 'search_by_body':
            return await this.handleSearchByBody(args);
          case 'search_larger_than':
            return await this.handleSearchLargerThan(args);
          case 'search_with_keyword':
            return await this.handleSearchWithKeyword(args);
          case 'get_messages':
            return await this.handleGetMessages(args);
          case 'get_message':
            return await this.handleGetMessage(args);
          case 'delete_message':
            return await this.handleDeleteMessage(args);
          case 'get_message_count':
            return await this.handleGetMessageCount();
          case 'get_unseen_messages':
            return await this.handleGetUnseenMessages();
          case 'get_recent_messages':
            return await this.handleGetRecentMessages();
          case 'disconnect_imap':
            return await this.handleDisconnectIMAP();
          case 'connect_smtp':
            return await this.handleConnectSMTP();
          case 'send_email':
            return await this.handleSendEmail(args);
          case 'disconnect_smtp':
            return await this.handleDisconnectSMTP();
          case 'quick_connect':
            return await this.handleQuickConnect();
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    });
  }

  private async handleConnectIMAP() {
    const config: IMAPConfig = EMAIL_CONFIG.IMAP;

    try {
      this.imapClient = new IMAPClient(config);
      await this.imapClient.connect();

      return {
        content: [
          {
            type: 'text',
            text: `Successfully connected to IMAP server ${config.host}:${config.port}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to connect: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleOpenMailbox(args: any) {
    if (!this.imapClient) {
      throw new Error('Not connected to IMAP server');
    }

    const mailboxName = args.mailboxName || 'INBOX';
    const readOnly = args.readOnly || false;

    try {
      const mailboxInfo = await this.imapClient.openBox(mailboxName, readOnly);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(mailboxInfo, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to open mailbox: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleListMailboxes() {
    if (!this.imapClient) {
      throw new Error('Not connected to IMAP server');
    }

    try {
      const boxes = await this.imapClient.getBoxes();
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(boxes, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to list mailboxes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleSearchMessages(args: any) {
    if (!this.imapClient) {
      throw new Error('Not connected to IMAP server');
    }

    // 如果没有提供criteria参数，或者criteria为空数组，使用['ALL']
    let criteria = args.criteria;
    if (!criteria || !Array.isArray(criteria) || criteria.length === 0) {
      criteria = ['ALL'];
    }

    try {
      console.error(`[IMAP] Searching with criteria:`, criteria);
      const uids = await this.imapClient.search(criteria);
      
      const result = {
        searchCriteria: criteria,
        matchingUIDs: uids,
        totalMatches: uids.length,
        note: criteria.length === 1 && criteria[0] === 'ALL' ? 
          'Showing all messages. Use specific criteria like ["UNSEEN"] to filter results.' : 
          'Search completed with specified criteria.'
      };
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleSearchBySender(args: any) {
    if (!this.imapClient) {
      throw new Error('Not connected to IMAP server');
    }

    const sender = args.sender;
    if (!sender) {
      throw new Error('sender parameter is required');
    }

    try {
      // 正确的node-imap FROM搜索语法
      const criteria = ['FROM', sender];
      console.error(`[IMAP] Searching messages from sender:`, sender);
      const uids = await this.imapClient.search(criteria);
      
      const result = {
        searchType: 'By Sender',
        sender: sender,
        searchCriteria: criteria,
        matchingUIDs: uids,
        totalMatches: uids.length
      };
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Search by sender failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleSearchBySubject(args: any) {
    if (!this.imapClient) {
      throw new Error('Not connected to IMAP server');
    }

    const subject = args.subject;
    if (!subject) {
      throw new Error('subject parameter is required');
    }

    try {
      // 根据文档，SUBJECT是直接的字符串搜索类型
      const criteria = ['SUBJECT', subject];
      console.error(`[IMAP] Searching messages with subject:`, subject);
      const uids = await this.imapClient.search(criteria);
      
      const result = {
        searchType: 'By Subject',
        subjectKeywords: subject,
        searchCriteria: criteria,
        matchingUIDs: uids,
        totalMatches: uids.length
      };
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Search by subject failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleSearchSinceDate(args: any) {
    if (!this.imapClient) {
      throw new Error('Not connected to IMAP server');
    }

    const date = args.date;
    if (!date) {
      throw new Error('date parameter is required');
    }

    try {
      // 正确的node-imap SINCE搜索语法
      const criteria = ['SINCE', date];
      console.error(`[IMAP] Searching messages since date:`, date);
      const uids = await this.imapClient.search(criteria);
      
      const result = {
        searchType: 'Since Date',
        sinceDate: date,
        searchCriteria: criteria,
        matchingUIDs: uids,
        totalMatches: uids.length,
        note: 'Date format should be like "April 20, 2010" or "20-Apr-2010"'
      };
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Search since date failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleSearchUnreadFromSender(args: any) {
    if (!this.imapClient) {
      throw new Error('Not connected to IMAP server');
    }

    const sender = args.sender;
    if (!sender) {
      throw new Error('sender parameter is required');
    }

    try {
      // 根据文档，默认所有条件都是AND组合
      // 所以这会搜索既是UNSEEN又是FROM sender的邮件
      const criteria = ['UNSEEN', ['FROM', sender]];
      console.error(`[IMAP] Searching unread messages from sender:`, sender);
      const uids = await this.imapClient.search(criteria);
      
      const result = {
        searchType: 'Unread messages from specific sender',
        sender: sender,
        searchCriteria: criteria,
        matchingUIDs: uids,
        totalMatches: uids.length,
        note: 'By default, all criteria are ANDed together - finds messages that are BOTH unread AND from the specified sender'
      };
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Search unread from sender failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleSearchByBody(args: any) {
    if (!this.imapClient) {
      throw new Error('Not connected to IMAP server');
    }

    const text = args.text;
    if (!text) {
      throw new Error('text parameter is required');
    }

    try {
      const criteria = ['BODY', text];
      console.error(`[IMAP] Searching messages with body text:`, text);
      const uids = await this.imapClient.search(criteria);
      
      const result = {
        searchType: 'By Body Text',
        bodyText: text,
        searchCriteria: criteria,
        matchingUIDs: uids,
        totalMatches: uids.length
      };
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Search by body failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleSearchLargerThan(args: any) {
    if (!this.imapClient) {
      throw new Error('Not connected to IMAP server');
    }

    const size = args.size;
    if (typeof size !== 'number') {
      throw new Error('size parameter must be a number');
    }

    try {
      const criteria = ['LARGER', size.toString()];
      console.error(`[IMAP] Searching messages larger than:`, size, 'bytes');
      const uids = await this.imapClient.search(criteria);
      
      const result = {
        searchType: 'Larger Than Size',
        minimumSize: size,
        searchCriteria: criteria,
        matchingUIDs: uids,
        totalMatches: uids.length
      };
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Search larger than failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleSearchWithKeyword(args: any) {
    if (!this.imapClient) {
      throw new Error('Not connected to IMAP server');
    }

    const keyword = args.keyword;
    if (!keyword) {
      throw new Error('keyword parameter is required');
    }

    try {
      const criteria = ['KEYWORD', keyword];
      console.error(`[IMAP] Searching messages with keyword:`, keyword);
      const uids = await this.imapClient.search(criteria);
      
      const result = {
        searchType: 'With Keyword',
        keyword: keyword,
        searchCriteria: criteria,
        matchingUIDs: uids,
        totalMatches: uids.length
      };
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Search with keyword failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleGetMessages(args: any) {
    if (!this.imapClient) {
      throw new Error('Not connected to IMAP server');
    }

    const uids = args.uids;
    if (!Array.isArray(uids)) {
      throw new Error('uids must be an array of numbers');
    }

    const markSeen = args.markSeen || false;

    try {
      const messages = await this.imapClient.fetchMessages(uids, { markSeen });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(messages, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get messages: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleGetMessage(args: any) {
    if (!this.imapClient) {
      throw new Error('Not connected to IMAP server');
    }

    const uid = args.uid;
    if (typeof uid !== 'number') {
      throw new Error('uid must be a number');
    }

    const markSeen = args.markSeen || false;

    try {
      const message = await this.imapClient.getMessage(uid);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(message, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleDeleteMessage(args: any) {
    if (!this.imapClient) {
      throw new Error('Not connected to IMAP server');
    }

    const uid = args.uid;
    if (typeof uid !== 'number') {
      throw new Error('uid must be a number');
    }

    try {
      await this.imapClient.deleteMessage(uid);
      
      return {
        content: [
          {
            type: 'text',
            text: `Message with UID ${uid} deleted successfully`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to delete message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleGetMessageCount() {
    if (!this.imapClient) {
      throw new Error('Not connected to IMAP server');
    }

    try {
      const count = await this.imapClient.getMessageCount();
      
      return {
        content: [
          {
            type: 'text',
            text: `Total messages: ${count}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get message count: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleGetUnseenMessages() {
    if (!this.imapClient) {
      throw new Error('Not connected to IMAP server');
    }

    try {
      const messages = await this.imapClient.getUnseenMessages();
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(messages, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get unseen messages: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleGetRecentMessages() {
    if (!this.imapClient) {
      throw new Error('Not connected to IMAP server');
    }

    try {
      const messages = await this.imapClient.getRecentMessages();
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(messages, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get recent messages: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleDisconnectIMAP() {
    if (!this.imapClient) {
      throw new Error('Not connected to IMAP server');
    }

    try {
      await this.imapClient.disconnect();
      this.imapClient = null;
      
      return {
        content: [
          {
            type: 'text',
            text: 'Disconnected from IMAP server',
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to disconnect: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleConnectSMTP() {
    const config: SMTPConfig = EMAIL_CONFIG.SMTP;

    try {
      this.smtpClient = new SMTPClient(config);
      await this.smtpClient.connect();

      return {
        content: [
          {
            type: 'text',
            text: `Successfully connected to SMTP server ${config.host}:${config.port}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to connect to SMTP server: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleSendEmail(args: any) {
    if (!this.smtpClient) {
      throw new Error('Not connected to SMTP server');
    }

    const emailOptions: EmailOptions = {
      to: args.to.split(',').map((email: string) => email.trim()),
      subject: args.subject,
      text: args.text,
      html: args.html,
      cc: args.cc ? args.cc.split(',').map((email: string) => email.trim()) : undefined,
      bcc: args.bcc ? args.bcc.split(',').map((email: string) => email.trim()) : undefined,
    };

    if (!emailOptions.text && !emailOptions.html) {
      throw new Error('Either text or html content is required');
    }

    try {
      const result = await this.smtpClient.sendMail(emailOptions);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to send email: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleDisconnectSMTP() {
    if (!this.smtpClient) {
      throw new Error('Not connected to SMTP server');
    }

    await this.smtpClient.disconnect();
    this.smtpClient = null;
    
    return {
      content: [
        {
          type: 'text',
          text: 'Disconnected from SMTP server',
        },
      ],
    };
  }

  private async handleQuickConnect() {
    const results = [];
    let imapSuccess = false;
    let smtpSuccess = false;

    // 连接IMAP
    try {
      const imapConfig: IMAPConfig = EMAIL_CONFIG.IMAP;
      this.imapClient = new IMAPClient(imapConfig);
      await this.imapClient.connect();
      results.push(`✅ IMAP: Successfully connected to ${imapConfig.host}:${imapConfig.port}`);
      imapSuccess = true;
    } catch (error) {
      results.push(`❌ IMAP: Failed to connect - ${error instanceof Error ? error.message : String(error)}`);
    }

    // 连接SMTP
    try {
      const smtpConfig: SMTPConfig = EMAIL_CONFIG.SMTP;
      this.smtpClient = new SMTPClient(smtpConfig);
      await this.smtpClient.connect();
      results.push(`✅ SMTP: Successfully connected to ${smtpConfig.host}:${smtpConfig.port}`);
      smtpSuccess = true;
    } catch (error) {
      results.push(`❌ SMTP: Failed to connect - ${error instanceof Error ? error.message : String(error)}`);
    }

    const summary = `Connection Summary: IMAP ${imapSuccess ? '✅' : '❌'} | SMTP ${smtpSuccess ? '✅' : '❌'}`;
    results.push('', summary);

    return {
      content: [
        {
          type: 'text',
          text: results.join('\n'),
        },
      ],
    };
  }

  private validateConfig(): void {
    try {
      console.error('=== MCP Mail Server Configuration ===');
      console.error(`IMAP: ${EMAIL_CONFIG.IMAP.host}:${EMAIL_CONFIG.IMAP.port} (TLS: ${EMAIL_CONFIG.IMAP.tls})`);
      console.error(`SMTP: ${EMAIL_CONFIG.SMTP.host}:${EMAIL_CONFIG.SMTP.port} (Secure: ${EMAIL_CONFIG.SMTP.secure})`);
      console.error(`User: ${EMAIL_CONFIG.IMAP.username}`);
      console.error('Password: [CONFIGURED]');
      console.error('Configuration loaded successfully');
    } catch (error) {
      console.error('Configuration error:', error instanceof Error ? error.message : String(error));
      console.error('Please ensure all required environment variables are set in your MCP server configuration.');
      throw error;
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Mail server running on stdio');
  }
}

const server = new MailMCPServer();
server.run().catch(console.error);
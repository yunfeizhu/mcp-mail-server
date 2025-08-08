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
  private isInitializing = false;

  private formatError(error: unknown, context: string): string {
    return `${context}: ${error instanceof Error ? error.message : String(error)}`;
  }

  // 按日期范围过滤邮件
  private filterMessagesByDateRange(messages: any[], startDate?: string, endDate?: string): any[] {
    if (!startDate && !endDate) {
      return messages;
    }
    
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;
    
    return messages.filter(msg => {
      if (!msg.date) return true; // 如果没有日期信息，保留邮件
      
      const msgDate = new Date(msg.date);
      if (isNaN(msgDate.getTime())) return true; // 日期解析失败，保留邮件
      
      if (start && msgDate < start) return false;
      if (end && msgDate > end) return false;
      
      return true;
    });
  }

  // 在多个邮箱中搜索的辅助方法
  private async searchInMultipleMailboxes(criteria: any[], searchType: string, searchValue: string, startDate: string = '', endDate: string = ''): Promise<any> {
    const mailboxesToSearch = ['INBOX'];
    
    // 尝试添加发件箱
    const sentBoxNames = ['INBOX.Sent', 'Sent', 'SENT', 'Sent Items', 'Sent Messages', '已发送'];
    let sentBoxFound = false;
    
    for (const sentName of sentBoxNames) {
      try {
        await this.imapClient!.openBox(sentName, true);
        mailboxesToSearch.push(sentName);
        sentBoxFound = true;
        break;
      } catch (error) {
        // 继续尝试下一个发件箱名称
        continue;
      }
    }

    const searchResults: any = {
      searchType: searchType,
      searchValue: searchValue,
      searchCriteria: criteria,
      mailboxesSearched: [],
      totalMatches: 0,
      messages: []
    };

    for (const mailboxName of mailboxesToSearch) {
      try {
        console.error(`[IMAP] Searching in mailbox: ${mailboxName}`);
        await this.imapClient!.openBox(mailboxName, true);
        
        const uids = await this.imapClient!.search(criteria);
        console.error(`[IMAP] Found ${uids.length} messages in ${mailboxName}`);

        // 获取邮件内容
        let filteredMessages: any[] = [];
        let filteredUIDs: number[] = [];
        
        if (uids.length > 0) {
          console.error(`[IMAP] Auto-fetching content for ${uids.length} messages from ${mailboxName}`);
          const messages = await this.imapClient!.fetchMessages(uids);
          
          // 为每个邮件添加来源邮箱信息
          let messagesWithMailbox = messages.map(msg => ({
            ...msg,
            sourceMailbox: mailboxName
          }));
          
          // 按日期过滤
          if (startDate || endDate) {
            messagesWithMailbox = this.filterMessagesByDateRange(messagesWithMailbox, startDate, endDate);
          }
          
          filteredMessages = messagesWithMailbox;
          filteredUIDs = messagesWithMailbox.map(msg => msg.uid);
          
          searchResults.messages.push(...filteredMessages);
        }
        
        // 使用过滤后的数据更新邮箱结果
        const mailboxResult = {
          mailbox: mailboxName,
          matchingUIDs: filteredUIDs,
          messageCount: filteredMessages.length
        };
        
        searchResults.mailboxesSearched.push(mailboxResult);
        
      } catch (error) {
        console.error(`[IMAP] Error searching in ${mailboxName}:`, error);
        searchResults.mailboxesSearched.push({
          mailbox: mailboxName,
          error: `Failed to search: ${error instanceof Error ? error.message : String(error)}`,
          matchingUIDs: [],
          messageCount: 0
        });
      }
    }

    // 更新总计数为实际返回的消息数量（考虑日期过滤）
    searchResults.totalMatches = searchResults.messages.length;
    
    // 按时间降序排序（最新的邮件在前）
    searchResults.messages.sort((a: any, b: any) => {
      const dateA = new Date(a.date || 0);
      const dateB = new Date(b.date || 0);
      return dateB.getTime() - dateA.getTime(); // 降序：新邮件在前
    });
    
    // 生成搜索说明
    if (searchResults.totalMatches > 0) {
      let note = `Found and retrieved ${searchResults.totalMatches} messages across ${searchResults.mailboxesSearched.length} mailboxes`;
      if (startDate || endDate) {
        note += ` (filtered by date range)`;
      }
      searchResults.note = note;
    } else {
      searchResults.note = `No messages found in any of the searched mailboxes`;
    }

    if (!sentBoxFound) {
      searchResults.warning = 'Could not find sent mailbox - only searched INBOX';
    }

    return searchResults;
  }

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
            description: 'Get the total number of messages in current mailbox. Auto-connects if not already connected.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_unseen_messages',
            description: 'Get all unseen (unread) messages. Auto-connects if not already connected.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_recent_messages',
            description: 'Get all recent messages. Auto-connects if not already connected.',
            inputSchema: {
              type: 'object',
              properties: {},
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
                  description: 'Optional start date for filtering (format: "2025-07-01" or "01-Jul-2025"). Leave empty to not filter by start date.'
                },
                endDate: {
                  type: 'string',
                  description: 'Optional end date for filtering (format: "2025-08-01" or "01-Aug-2025"). Leave empty to not filter by end date.'
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
                  description: 'Optional start date for filtering (format: "2025-07-01" or "01-Jul-2025"). Leave empty to not filter by start date.'
                },
                endDate: {
                  type: 'string',
                  description: 'Optional end date for filtering (format: "2025-08-01" or "01-Aug-2025"). Leave empty to not filter by end date.'
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
                  description: 'Optional start date for filtering (format: "2025-07-01" or "01-Jul-2025"). Leave empty to not filter by start date.'
                },
                endDate: {
                  type: 'string',
                  description: 'Optional end date for filtering (format: "2025-08-01" or "01-Aug-2025"). Leave empty to not filter by end date.'
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
                  description: 'Optional start date for filtering (format: "2025-07-01" or "01-Jul-2025"). Leave empty to not filter by start date.'
                },
                endDate: {
                  type: 'string',
                  description: 'Optional end date for filtering (format: "2025-08-01" or "01-Aug-2025"). Leave empty to not filter by end date.'
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
                  description: 'Optional start date for filtering (format: "2025-07-01" or "01-Jul-2025"). Leave empty to not filter by start date.'
                },
                endDate: {
                  type: 'string',
                  description: 'Optional end date for filtering (format: "2025-08-01" or "01-Aug-2025"). Leave empty to not filter by end date.'
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
                  description: 'Optional start date for filtering (format: "2025-07-01" or "01-Jul-2025"). Leave empty to not filter by start date.'
                },
                endDate: {
                  type: 'string',
                  description: 'Optional end date for filtering (format: "2025-08-01" or "01-Aug-2025"). Leave empty to not filter by end date.'
                }
              },
              required: ['keyword'],
            },
          },
          // === 邮件读取 ===
          {
            name: 'get_messages',
            description: 'Retrieve multiple messages by their UIDs. Auto-connects if not already connected.',
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
            description: 'Retrieve a specific email message by UID. Auto-connects if not already connected.',
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
          // === 邮件发送 ===
          {
            name: 'send_email',
            description: 'Send an email via SMTP. Auto-connects to SMTP server if not already connected.',
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
          // === 邮件管理 ===
          {
            name: 'delete_message',
            description: 'Delete a specific email message by UID. Auto-connects if not already connected.',
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
        ] as Tool[],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'open_mailbox':
            return await this.handleOpenMailbox(args);
          case 'list_mailboxes':
            return await this.handleListMailboxes();
          case 'search_by_sender':
            return await this.handleSearchBySender(args);
          case 'search_by_subject':
            return await this.handleSearchBySubject(args);
          case 'search_by_recipient':
            return await this.handleSearchByRecipient(args);
          case 'search_since_date':
            return await this.handleSearchSinceDate(args);
          case 'search_unread_from_sender':
            return await this.handleSearchUnreadFromSender(args);
          case 'search_by_body':
            return await this.handleSearchByBody(args);
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
          case 'get_connection_status':
            return await this.handleGetConnectionStatus();
          case 'send_email':
            return await this.handleSendEmail(args);
          case 'connect_all':
            return await this.handleConnectAll();
          case 'disconnect_all':
            return await this.handleDisconnectAll();
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

  private async ensureIMAPConnection(): Promise<void> {
    if (this.imapClient && this.imapClient.isConnected()) {
      return;
    }

    if (this.isInitializing) {
      // 等待当前的初始化完成
      while (this.isInitializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.isInitializing = true;
    try {
      const config: IMAPConfig = EMAIL_CONFIG.IMAP;
      console.error(`[IMAP] Auto-connecting to ${config.host}:${config.port}`);
      
      this.imapClient = new IMAPClient(config);
      await this.imapClient.connect();
      
      console.error('[IMAP] Auto-connection successful');
    } finally {
      this.isInitializing = false;
    }
  }

  private async ensureSMTPConnection(): Promise<void> {
    if (this.smtpClient) {
      return;
    }

    const config: SMTPConfig = EMAIL_CONFIG.SMTP;
    console.error(`[SMTP] Auto-connecting to ${config.host}:${config.port}`);
    
    this.smtpClient = new SMTPClient(config);
    await this.smtpClient.connect();
    
    console.error('[SMTP] Auto-connection successful');
  }

  private async ensureRequiredConnections(requireIMAP: boolean = false, requireSMTP: boolean = false): Promise<void> {
    if (requireIMAP) {
      await this.ensureIMAPConnection();
    }
    if (requireSMTP) {
      await this.ensureSMTPConnection();
    }
  }

  private async handleOpenMailbox(args: any) {
    await this.ensureRequiredConnections(true, false);

    const mailboxName = args.mailboxName || 'INBOX';
    const readOnly = args.readOnly || false;
    const openSent = args.openSent !== false; // 默认同时获取发件箱信息

    try {
      const results: any = {};
      
      // 打开主邮箱（默认为收件箱）
      const mailboxInfo = await this.imapClient!.openBox(mailboxName, readOnly);
      results[mailboxName] = mailboxInfo;
      results.currentlyOpen = mailboxName;
      
      // 如果开启了获取发件箱信息的选项，并且主邮箱不是发件箱
      if (openSent && mailboxName !== 'INBOX.Sent' && mailboxName !== 'Sent' && mailboxName !== 'SENT') {
        try {
          // 获取发件箱信息，常见的发件箱名称（优先使用INBOX.Sent）
          const sentBoxNames = ['INBOX.Sent', 'Sent', 'SENT', 'Sent Items', 'Sent Messages', '已发送'];
          let sentFound = false;
          
          for (const sentName of sentBoxNames) {
            try {
              // 临时打开发件箱获取信息
              const sentInfo = await this.imapClient!.openBox(sentName, true); // 只读模式
              results[sentName] = sentInfo;
              sentFound = true;
              
              // 重新打开主邮箱
              const reopenedMainBox = await this.imapClient!.openBox(mailboxName, readOnly);
              results.currentlyOpen = mailboxName;
              results.note = `Retrieved info from both ${mailboxName} and ${sentName}. Currently open: ${mailboxName}`;
              break;
            } catch (sentError) {
              // 继续尝试下一个发件箱名称
              continue;
            }
          }
          
          if (!sentFound) {
            results.sentBoxWarning = 'Could not find any sent mailbox';
          }
        } catch (sentError) {
          results.sentBoxError = `Failed to access sent mailbox: ${sentError instanceof Error ? sentError.message : String(sentError)}`;
        }
      }
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to open mailbox'));
    }
  }

  private async handleListMailboxes() {
    await this.ensureRequiredConnections(true, false);

    try {
      const boxes = await this.imapClient!.getBoxes();
      
      // 处理循环引用，创建一个简化的邮箱列表
      const processMailbox = (box: any, path: string = '', visited = new Set()): any => {
        if (visited.has(box)) {
          return { name: path, circular: true };
        }
        
        visited.add(box);
        
        const result: any = {
          name: path,
          attribs: box.attribs || [],
          delimiter: box.delimiter || '.',
          selectable: !box.attribs?.includes('\\Noselect')
        };
        
        if (box.children && Object.keys(box.children).length > 0) {
          result.children = {};
          for (const [childName, childBox] of Object.entries(box.children)) {
            const childPath = path ? `${path}${box.delimiter || '.'}${childName}` : childName;
            result.children[childName] = processMailbox(childBox, childPath, new Set(visited));
          }
        }
        
        visited.delete(box);
        return result;
      };
      
      const processedBoxes: any = {};
      for (const [boxName, boxData] of Object.entries(boxes)) {
        processedBoxes[boxName] = processMailbox(boxData, boxName);
      }
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(processedBoxes, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to list mailboxes'));
    }
  }


  private async handleSearchBySender(args: any) {
    await this.ensureRequiredConnections(true, false);

    const sender = args.sender;
    const startDate = args.startDate || '';
    const endDate = args.endDate || '';
    
    if (!sender) {
      throw new Error('sender parameter is required');
    }

    try {
      // 正确的node-imap FROM搜索语法
      const criteria = ['FROM', sender];
      console.error(`[IMAP] Searching messages from sender across all mailboxes:`, sender);
      
      // 使用多邮箱搜索，带日期过滤
      const result = await this.searchInMultipleMailboxes(criteria, 'By Sender', sender, startDate, endDate);
      result.sender = sender; // 保持向后兼容
      if (startDate) result.startDate = startDate;
      if (endDate) result.endDate = endDate;
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Search by sender failed'));
    }
  }

  private async handleSearchBySubject(args: any) {
    await this.ensureRequiredConnections(true, false);

    const subject = args.subject;
    const startDate = args.startDate || '';
    const endDate = args.endDate || '';
    
    if (!subject) {
      throw new Error('subject parameter is required');
    }

    try {
      // 根据文档，SUBJECT是直接的字符串搜索类型
      const criteria = ['SUBJECT', subject];
      console.error(`[IMAP] Searching messages with subject across all mailboxes:`, subject);
      
      // 使用多邮箱搜索，带日期过滤
      const result = await this.searchInMultipleMailboxes(criteria, 'By Subject', subject, startDate, endDate);
      result.subjectKeywords = subject; // 保持向后兼容
      if (startDate) result.startDate = startDate;
      if (endDate) result.endDate = endDate;
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Search by subject failed'));
    }
  }

  private async handleSearchByRecipient(args: any) {
    await this.ensureRequiredConnections(true, false);

    const recipient = args.recipient;
    const startDate = args.startDate || '';
    const endDate = args.endDate || '';
    
    if (!recipient) {
      throw new Error('recipient parameter is required');
    }

    try {
      // 使用IMAP TO搜索条件查找发送给指定收件人的邮件
      const criteria = ['TO', recipient];
      console.error(`[IMAP] Searching messages to recipient across all mailboxes:`, recipient);
      
      // 使用多邮箱搜索，带日期过滤
      const result = await this.searchInMultipleMailboxes(criteria, 'By Recipient', recipient, startDate, endDate);
      result.recipient = recipient; // 保持向后兼容
      if (startDate) result.startDate = startDate;
      if (endDate) result.endDate = endDate;
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Search by recipient failed'));
    }
  }

  private async handleSearchSinceDate(args: any) {
    await this.ensureRequiredConnections(true, false);

    const date = args.date;
    if (!date) {
      throw new Error('date parameter is required');
    }

    try {
      // 正确的node-imap SINCE搜索语法
      const criteria = ['SINCE', date];
      console.error(`[IMAP] Searching messages since date across all mailboxes:`, date);
      
      // 使用多邮箱搜索
      const result = await this.searchInMultipleMailboxes(criteria, 'Since Date', date);
      result.sinceDate = date; // 保持向后兼容
      result.note = 'Date format should be like "April 20, 2010" or "20-Apr-2010". Searched across multiple mailboxes.';
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Search since date failed'));
    }
  }

  private async handleSearchUnreadFromSender(args: any) {
    await this.ensureRequiredConnections(true, false);

    const sender = args.sender;
    const startDate = args.startDate || '';
    const endDate = args.endDate || '';
    
    if (!sender) {
      throw new Error('sender parameter is required');
    }

    try {
      // 根据文档，默认所有条件都是AND组合
      // 所以这会搜索既是UNSEEN又是FROM sender的邮件
      const criteria = ['UNSEEN', ['FROM', sender]];
      console.error(`[IMAP] Searching unread messages from sender across all mailboxes:`, sender);
      
      // 使用多邮箱搜索，带日期过滤
      const result = await this.searchInMultipleMailboxes(criteria, 'Unread messages from specific sender', sender, startDate, endDate);
      result.sender = sender; // 保持向后兼容
      if (startDate) result.startDate = startDate;
      if (endDate) result.endDate = endDate;
      result.note = 'By default, all criteria are ANDed together - finds messages that are BOTH unread AND from the specified sender. Searched across multiple mailboxes.';
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Search unread from sender failed'));
    }
  }

  private async handleSearchByBody(args: any) {
    await this.ensureRequiredConnections(true, false);

    const text = args.text;
    const startDate = args.startDate || '';
    const endDate = args.endDate || '';
    
    if (!text) {
      throw new Error('text parameter is required');
    }

    try {
      const criteria = ['BODY', text];
      console.error(`[IMAP] Searching messages with body text across all mailboxes:`, text);
      
      // 使用多邮箱搜索，带日期过滤
      const result = await this.searchInMultipleMailboxes(criteria, 'By Body Text', text, startDate, endDate);
      result.bodyText = text; // 保持向后兼容
      if (startDate) result.startDate = startDate;
      if (endDate) result.endDate = endDate;
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Search by body failed'));
    }
  }

  private async handleSearchWithKeyword(args: any) {
    await this.ensureRequiredConnections(true, false);

    const keyword = args.keyword;
    const startDate = args.startDate || '';
    const endDate = args.endDate || '';
    
    if (!keyword) {
      throw new Error('keyword parameter is required');
    }

    try {
      const criteria = ['KEYWORD', keyword];
      console.error(`[IMAP] Searching messages with keyword across all mailboxes:`, keyword);
      
      // 使用多邮箱搜索，带日期过滤
      const result = await this.searchInMultipleMailboxes(criteria, 'With Keyword', keyword, startDate, endDate);
      result.keyword = keyword; // 保持向后兼容
      if (startDate) result.startDate = startDate;
      if (endDate) result.endDate = endDate;
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Search with keyword failed'));
    }
  }

  private async handleGetMessages(args: any) {
    await this.ensureRequiredConnections(true, false);

    const uids = args.uids;
    if (!Array.isArray(uids)) {
      throw new Error('uids must be an array of numbers');
    }

    const markSeen = args.markSeen || false;

    try {
      const messages = await this.imapClient!.fetchMessages(uids, { markSeen });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(messages, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to get messages'));
    }
  }

  private async handleGetMessage(args: any) {
    await this.ensureRequiredConnections(true, false);

    const uid = args.uid;
    if (typeof uid !== 'number') {
      throw new Error('uid must be a number');
    }

    try {
      const message = await this.imapClient!.getMessage(uid);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(message, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to get message'));
    }
  }

  private async handleDeleteMessage(args: any) {
    await this.ensureRequiredConnections(true, false);

    const uid = args.uid;
    if (typeof uid !== 'number') {
      throw new Error('uid must be a number');
    }

    try {
      await this.imapClient!.deleteMessage(uid);
      
      return {
        content: [
          {
            type: 'text',
            text: `Message with UID ${uid} deleted successfully`,
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to delete message'));
    }
  }

  private async handleGetMessageCount() {
    await this.ensureRequiredConnections(true, false);

    try {
      const count = await this.imapClient!.getMessageCount();
      
      return {
        content: [
          {
            type: 'text',
            text: `Total messages: ${count}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to get message count'));
    }
  }

  private async handleGetUnseenMessages() {
    await this.ensureRequiredConnections(true, false);

    try {
      const messages = await this.imapClient!.getUnseenMessages();
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(messages, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to get unseen messages'));
    }
  }

  private async handleGetRecentMessages() {
    await this.ensureRequiredConnections(true, false);

    try {
      const messages = await this.imapClient!.getRecentMessages();
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(messages, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to get recent messages'));
    }
  }

  private async handleGetConnectionStatus() {
    const status = {
      timestamp: new Date().toLocaleString('zh-CN', { 
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      connections: {
        imap: {
          connected: false,
          currentBox: null as string | null,
          serverInfo: `${EMAIL_CONFIG.IMAP.host}:${EMAIL_CONFIG.IMAP.port}`,
          username: EMAIL_CONFIG.IMAP.username,
          tls: EMAIL_CONFIG.IMAP.tls,
          status: 'Not connected'
        },
        smtp: {
          connected: false,
          serverInfo: `${EMAIL_CONFIG.SMTP.host}:${EMAIL_CONFIG.SMTP.port}`,
          username: EMAIL_CONFIG.SMTP.username,
          secure: EMAIL_CONFIG.SMTP.secure,
          status: 'Not connected'
        }
      }
    };

    // 检查IMAP连接状态
    if (this.imapClient) {
      status.connections.imap.connected = this.imapClient.isConnected();
      status.connections.imap.currentBox = this.imapClient.getCurrentBox();
      
      if (status.connections.imap.connected) {
        status.connections.imap.status = status.connections.imap.currentBox 
          ? `Connected - Current mailbox: ${status.connections.imap.currentBox}`
          : 'Connected - No mailbox open';
      } else {
        status.connections.imap.status = 'Connection lost or failed';
      }
    }

    // 检查SMTP连接状态
    if (this.smtpClient) {
      status.connections.smtp.connected = true; // SMTP连接一旦创建就认为是连接状态
      status.connections.smtp.status = 'Connected and ready';
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  }


  private async handleSendEmail(args: any) {
    await this.ensureRequiredConnections(false, true);

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
      const result = await this.smtpClient!.sendMail(emailOptions);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to send email'));
    }
  }

  private async handleConnectAll() {
    const results = [];
    
    // 连接IMAP
    try {
      if (this.imapClient && this.imapClient.isConnected()) {
        results.push('ℹ️ IMAP: Already connected');
      } else {
        await this.ensureIMAPConnection();
        results.push('✅ IMAP: Connected successfully');
      }
    } catch (error) {
      results.push(`❌ IMAP: Connection failed - ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // 连接SMTP
    try {
      if (this.smtpClient) {
        results.push('ℹ️ SMTP: Already connected');
      } else {
        await this.ensureSMTPConnection();
        results.push('✅ SMTP: Connected successfully');
      }
    } catch (error) {
      results.push(`❌ SMTP: Connection failed - ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return {
      content: [
        {
          type: 'text',
          text: results.join('\n'),
        },
      ],
    };
  }

  private async handleDisconnectAll() {
    const results = [];
    
    // 断开IMAP连接
    if (this.imapClient) {
      try {
        await this.imapClient.disconnect();
        this.imapClient = null;
        results.push('✅ IMAP: Disconnected successfully');
      } catch (error) {
        results.push(`❌ IMAP: Disconnect failed - ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      results.push('ℹ️ IMAP: Not connected');
    }
    
    // 断开SMTP连接
    if (this.smtpClient) {
      try {
        await this.smtpClient.disconnect();
        this.smtpClient = null;
        results.push('✅ SMTP: Disconnected successfully');
      } catch (error) {
        results.push(`❌ SMTP: Disconnect failed - ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      results.push('ℹ️ SMTP: Not connected');
    }
    
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
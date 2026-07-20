import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { writeFile, readFile } from 'fs/promises';
import path from 'path';
import { EmailMessage, AttachmentData } from './imap-client.js';
import { EmailOptions } from './smtp-client.js';
import { EMAIL_CONFIG } from './config.js';
import { SerialTaskQueue } from './async-queue.js';
import { FileAccessPolicy } from './file-access-policy.js';
import { MessageRef, parseMessageRef } from './message-ref.js';
import { MAIL_TOOLS } from './tool-definitions.js';
import {
  GetMessagesArgs,
  MailboxArgs,
  ReplyInfo,
  ReplyToEmailArgs,
  SearchArgs,
  SendEmailArgs,
} from './mail-types.js';
import {
  buildQuotedHtml,
  buildQuotedText,
  cleanReplySubject,
  extractEmailFromAddress,
  extractEmailsFromAddressField,
  textToHtml,
} from './mail-utils.js';
import { MailSearchService } from './search-service.js';
import { MailConnectionManager } from './mail-connection-manager.js';

export class MailMCPServer {
  private server: Server;
  private readonly toolQueue = new SerialTaskQueue();
  private readonly fileAccessPolicy = new FileAccessPolicy(EMAIL_CONFIG.FILES);
  private readonly connections = new MailConnectionManager();
  private readonly searchService: MailSearchService;

  private formatError(error: unknown, context: string): string {
    return `${context}: ${error instanceof Error ? error.message : String(error)}`;
  }

  constructor() {
    // 验证配置
    this.validateConfig();
    this.searchService = new MailSearchService({
      ensureIMAPConnection: () => this.connections.ensure(true, false),
      getIMAPClient: () => this.connections.imap,
      findSentMailbox: () => this.connections.findSentMailbox(),
      maxBodyCharacters: EMAIL_CONFIG.FILES.maxBodyCharacters,
    });
    this.server = new Server(
      {
        name: 'mcp-mail',
        version: '1.2.2',
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
      await this.connections.disconnectAll();
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools: MAIL_TOOLS };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return this.toolQueue.run(async () => {
        const { name, arguments: args } = request.params;

        try {
          switch (name) {
          case 'open_mailbox':
            return await this.handleOpenMailbox(args || {});
          case 'list_mailboxes':
            return await this.handleListMailboxes();
          case 'search_by_sender':
            return await this.searchService.searchBySender((args || {}) as SearchArgs);
          case 'search_by_subject':
            return await this.searchService.searchBySubject((args || {}) as SearchArgs);
          case 'search_by_recipient':
            return await this.searchService.searchByRecipient((args || {}) as SearchArgs);
          case 'search_since_date':
            return await this.searchService.searchSinceDate((args || {}) as SearchArgs);
          case 'search_unread_from_sender':
            return await this.searchService.searchUnreadFromSender((args || {}) as SearchArgs);
          case 'search_unreplied_from_sender':
            return await this.searchService.searchUnrepliedFromSender((args || {}) as SearchArgs);
          case 'search_by_body':
            return await this.searchService.searchByBody((args || {}) as SearchArgs);
          case 'search_with_keyword':
            return await this.searchService.searchWithKeyword((args || {}) as SearchArgs);
          case 'search_all_messages':
            return await this.searchService.searchAllMessages((args || {}) as SearchArgs);
          case 'get_messages':
            return await this.handleGetMessages(args as unknown as GetMessagesArgs);
          case 'get_message':
            return await this.handleGetMessage(args);
          case 'delete_message':
            return await this.handleDeleteMessage(args);
          case 'get_attachments':
            return await this.handleGetAttachments(args);
          case 'save_attachment':
            return await this.handleSaveAttachment(args);
          case 'get_message_count':
            return await this.handleGetMessageCount();
          case 'get_unseen_messages':
            return await this.handleGetUnseenMessages(args?.limit as number | undefined);
          case 'get_recent_messages':
            return await this.handleGetRecentMessages(args?.limit as number | undefined);
          case 'get_connection_status':
            return await this.handleGetConnectionStatus();
          case 'send_email':
            return await this.handleSendEmail(args as unknown as SendEmailArgs);
          case 'reply_to_email':
            return await this.handleReplyToEmail(args as unknown as ReplyToEmailArgs);
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
            isError: true,
          };
        }
      });
    });
  }

  private async openMessageRef(ref: MessageRef, readOnly: boolean): Promise<void> {
    const mailboxInfo = await this.connections.imap.openBox(ref.mailbox, readOnly);
    if (ref.uidValidity !== undefined && mailboxInfo.uidvalidity !== ref.uidValidity) {
      throw new Error(
        `Mailbox UIDVALIDITY changed for ${ref.mailbox}: expected ${ref.uidValidity}, got ${mailboxInfo.uidvalidity}. Refresh the message reference before retrying.`
      );
    }
  }

  private async getMessageByRef(ref: MessageRef, readOnly: boolean = true): Promise<EmailMessage> {
    await this.openMessageRef(ref, readOnly);
    return this.connections.imap.getMessage(ref.uid);
  }

  private messageForResponse<T extends EmailMessage>(message: T): T & { textTruncated?: boolean; htmlTruncated?: boolean } {
    const result = { ...message } as T & { textTruncated?: boolean; htmlTruncated?: boolean };
    const limit = EMAIL_CONFIG.FILES.maxBodyCharacters;
    if (result.text && result.text.length > limit) {
      result.text = `${result.text.slice(0, limit)}\n\n[truncated]`;
      result.textTruncated = true;
    }
    if (result.html && result.html.length > limit) {
      result.html = `${result.html.slice(0, limit)}<!-- truncated -->`;
      result.htmlTruncated = true;
    }
    return result;
  }

  private validateOutgoingContent(text?: string, html?: string): void {
    const limit = EMAIL_CONFIG.FILES.maxBodyCharacters;
    if (text && text.length > limit) {
      throw new Error(`Text body exceeds the configured limit of ${limit} characters`);
    }
    if (html && html.length > limit) {
      throw new Error(`HTML body exceeds the configured limit of ${limit} characters`);
    }
  }

  private async handleOpenMailbox(args: MailboxArgs) {
    await this.connections.ensure(true, false);

    const mailboxName = args.mailboxName || 'INBOX';
    const readOnly = args.readOnly || false;
    const openSent = args.openSent !== false; // 默认同时获取发件箱信息

    try {
      const results: any = {};

      // 打开主邮箱（默认为收件箱）
      const mailboxInfo = await this.connections.imap.openBox(mailboxName, readOnly);
      results[mailboxName] = mailboxInfo;
      results.currentlyOpen = mailboxName;

      // 如果开启了获取发件箱信息的选项，并且主邮箱本身不是发件箱
      if (openSent) {
        const sentName = await this.connections.findSentMailbox();
        if (sentName && sentName !== mailboxName) {
          try {
            const sentInfo = await this.connections.imap.openBox(sentName, true);
            results[sentName] = sentInfo;
            // 重新打开主邮箱，保持用户期望的当前邮箱状态
            await this.connections.imap.openBox(mailboxName, readOnly);
            results.currentlyOpen = mailboxName;
            results.note = `Retrieved info from both ${mailboxName} and ${sentName}. Currently open: ${mailboxName}`;
          } catch (sentError) {
            results.sentBoxError = `Failed to access sent mailbox ${sentName}: ${sentError instanceof Error ? sentError.message : String(sentError)}`;
          }
        } else if (!sentName) {
          results.sentBoxWarning = 'Could not find any sent mailbox';
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
    await this.connections.ensure(true, false);

    try {
      const boxes = await this.connections.imap.getBoxes();

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


  private async handleGetMessages(args: GetMessagesArgs) {
    await this.connections.ensure(true, false);

    const uids = args.uids;
    if (!Array.isArray(uids) || uids.some(uid => !Number.isInteger(uid) || uid <= 0)) {
      throw new Error('uids must be an array of positive integers');
    }
    if (uids.length === 0) {
      return { content: [{ type: 'text', text: '[]' }] };
    }

    const ref = parseMessageRef({
      mailbox: args.mailbox,
      uid: uids[0],
      uidValidity: args.uidValidity,
    });

    const markSeen = args.markSeen || false;

    try {
      await this.openMessageRef(ref, !markSeen);
      const messages = await this.connections.imap.fetchMessages(uids, { markSeen });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(messages.map(message => this.messageForResponse(message)), null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to get messages'));
    }
  }

  private async handleGetMessage(args: any) {
    await this.connections.ensure(true, false);

    const ref = parseMessageRef(args);
    const markSeen = args.markSeen || false;

    try {
      await this.openMessageRef(ref, !markSeen);
      const messages = await this.connections.imap.fetchMessages([ref.uid], { markSeen });
      if (messages.length === 0) {
        throw new Error(`Message with UID ${ref.uid} not found in mailbox ${ref.mailbox}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(this.messageForResponse(messages[0]), null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to get message'));
    }
  }

  private async handleDeleteMessage(args: any) {
    await this.connections.ensure(true, false);

    const ref = parseMessageRef(args);

    try {
      await this.openMessageRef(ref, false);
      await this.connections.imap.deleteMessage(ref.uid);

      return {
        content: [
          {
            type: 'text',
            text: `Message ${ref.mailbox}/UID ${ref.uid} deleted successfully`,
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to delete message'));
    }
  }

  private async handleGetAttachments(args: any) {
    await this.connections.ensure(true, false);

    const ref = parseMessageRef(args);

    try {
      const message = await this.getMessageByRef(ref);

      const attachments = message.attachments || [];

      const responseData = {
        uid: ref.uid,
        sourceMailbox: ref.mailbox,
        uidValidity: message.uidValidity,
        subject: message.subject,
        from: message.from,
        attachmentCount: attachments.length,
        attachments: attachments.map(att => ({
          index: att.index,
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          contentId: att.contentId,
          contentDisposition: att.contentDisposition,
        })),
        note: attachments.length > 0
          ? `Found ${attachments.length} attachment(s). Use save_attachment with mailbox=${ref.mailbox} and uid=${ref.uid} to download.`
          : 'This email has no attachments.',
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to get attachments'));
    }
  }

  private async handleSaveAttachment(args: any) {
    await this.connections.ensure(true, false);

    const ref = parseMessageRef(args);
    const savePath = args.savePath;
    const attachmentIndex = args.attachmentIndex;
    const returnBase64 = args.returnBase64 || false;

    if (typeof savePath !== 'string' || !savePath) {
      throw new Error('savePath must be a non-empty string');
    }
    if (!path.isAbsolute(savePath)) {
      throw new Error('savePath must be an absolute path');
    }

    try {
      const allowedSavePath = await this.fileAccessPolicy.prepareWritableDirectory(savePath);

      const message = await this.getMessageByRef(ref);
      if (message.size > EMAIL_CONFIG.FILES.maxAttachmentBytes) {
        throw new Error(`Message size ${message.size} exceeds the configured attachment processing limit of ${EMAIL_CONFIG.FILES.maxAttachmentBytes} bytes`);
      }

      // 获取附件内容
      const allAttachments = await this.connections.imap.fetchMessageAttachments(ref.uid);

      if (allAttachments.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ uid: ref.uid, sourceMailbox: ref.mailbox, note: 'This email has no attachments.' }, null, 2),
            },
          ],
        };
      }

      // 筛选要保存的附件
      let attachmentsToSave: AttachmentData[];
      if (attachmentIndex !== undefined) {
        if (typeof attachmentIndex !== 'number' || attachmentIndex < 0 || attachmentIndex >= allAttachments.length) {
          throw new Error(`Invalid attachmentIndex: ${attachmentIndex}. Valid range: 0-${allAttachments.length - 1}`);
        }
        attachmentsToSave = [allAttachments[attachmentIndex]];
      } else {
        attachmentsToSave = allAttachments;
      }

      for (const att of attachmentsToSave) {
        if (att.size > EMAIL_CONFIG.FILES.maxAttachmentBytes) {
          throw new Error(`Attachment ${att.filename} exceeds the configured limit of ${EMAIL_CONFIG.FILES.maxAttachmentBytes} bytes`);
        }
        if (returnBase64 && att.size > EMAIL_CONFIG.FILES.maxBase64Bytes) {
          throw new Error(`Attachment ${att.filename} is too large to return as base64 (limit: ${EMAIL_CONFIG.FILES.maxBase64Bytes} bytes)`);
        }
      }

      const savedFiles: Array<{
        index: number;
        filename: string;
        contentType: string;
        size: number;
        savedPath: string;
        base64?: string;
      }> = [];

      for (const att of attachmentsToSave) {
        // 生成安全的文件名（避免路径遍历）
        const safeFilename = path.basename(att.filename);
        let targetPath = path.join(allowedSavePath, safeFilename);

        // 使用排他创建避免并发覆盖同名文件
        let counter = 1;
        const ext = path.extname(safeFilename);
        const nameWithoutExt = path.basename(safeFilename, ext);
        while (true) {
          try {
            await writeFile(targetPath, att.content, { flag: 'wx' });
            break;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
              throw error;
            }
            targetPath = path.join(allowedSavePath, `${nameWithoutExt}_${counter}${ext}`);
            counter++;
          }
        }
        console.error(`[Attachment] Saved: ${targetPath} (${att.size} bytes)`);

        const fileInfo: {
          index: number;
          filename: string;
          contentType: string;
          size: number;
          savedPath: string;
          base64?: string;
        } = {
          index: att.index,
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          savedPath: targetPath,
        };

        if (returnBase64) {
          fileInfo.base64 = att.content.toString('base64');
        }

        savedFiles.push(fileInfo);
      }

      const responseData = {
        uid: ref.uid,
        sourceMailbox: ref.mailbox,
        uidValidity: message.uidValidity,
        subject: message.subject,
        totalAttachments: allAttachments.length,
        savedCount: savedFiles.length,
        savedFiles,
        note: `Successfully saved ${savedFiles.length} attachment(s) to ${allowedSavePath}`,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to save attachment'));
    }
  }

  private async handleGetMessageCount() {
    await this.connections.ensure(true, false);

    try {
      const count = await this.connections.imap.getMessageCount();

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

  private async handleGetUnseenMessages(limit?: number) {
    await this.connections.ensure(true, false);

    try {
      const fetchLimit = Math.min(limit && limit > 0 ? Math.floor(limit) : 50, 200);
      const messages = await this.connections.imap.getUnseenMessages(fetchLimit);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(messages.map(message => this.messageForResponse(message)), null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to get unseen messages'));
    }
  }

  private async handleGetRecentMessages(limit?: number) {
    await this.connections.ensure(true, false);

    try {
      const fetchLimit = Math.min(limit && limit > 0 ? Math.floor(limit) : 50, 200);
      const messages = await this.connections.imap.getRecentMessages(fetchLimit);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(messages.map(message => this.messageForResponse(message)), null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to get recent messages'));
    }
  }

  private async handleGetConnectionStatus() {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(this.connections.getStatus(), null, 2),
      }],
    };
  }

  private async handleSendEmail(args: SendEmailArgs) {
    await this.connections.ensure(false, true);

    if (!args || typeof args.to !== 'string' || !args.to.trim()) {
      throw new Error('to must be a non-empty string');
    }
    if (typeof args.subject !== 'string' || !args.subject.trim()) {
      throw new Error('subject must be a non-empty string');
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
    this.validateOutgoingContent(emailOptions.text, emailOptions.html);

    // 处理附件
    if (args.attachments && args.attachments.length > 0) {
      const attachmentList: Array<{ filename: string; content: Buffer; contentType?: string }> = [];
      let totalAttachmentBytes = 0;
      for (const filePath of args.attachments) {
        try {
          const allowedFile = await this.fileAccessPolicy.getReadableAttachmentPath(filePath);
          totalAttachmentBytes += allowedFile.size;
          if (totalAttachmentBytes > EMAIL_CONFIG.FILES.maxAttachmentBytes) {
            throw new Error(`Total attachment size exceeds the configured limit of ${EMAIL_CONFIG.FILES.maxAttachmentBytes} bytes`);
          }
          const content = await readFile(allowedFile.path);
          attachmentList.push({
            filename: path.basename(allowedFile.path),
            content,
          });
        } catch (error) {
          throw new Error(`Failed to read attachment file: ${filePath} - ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      emailOptions.attachments = attachmentList;
    }

    try {
      const result = await this.connections.smtp.sendMail(emailOptions);

      // 尝试保存已发送邮件到发件箱
      const sentFolderSaved = await this.saveSentMessage(emailOptions, result.messageId);

      const responseWithSentInfo = {
        ...result,
        sentFolderSaved,
        note: sentFolderSaved
          ? 'Email sent successfully and saved to sent folder'
          : 'Email sent successfully (note: could not save to sent folder)'
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseWithSentInfo, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to send email'));
    }
  }

  private async handleReplyToEmail(args: ReplyToEmailArgs) {
    await this.connections.ensure(true, true);

    const originalRef = parseMessageRef(args, 'originalUid');
    const originalUid = originalRef.uid;
    const replyText = args.text;
    const replyHtml = args.html;
    const replyToAll = args.replyToAll || false;
    const includeOriginal = args.includeOriginal !== false; // 默认为true

    if (!args.text && !args.html) {
      throw new Error('Either text or html content is required');
    }
    try {
      console.error(`[Reply] Fetching original message: ${originalRef.mailbox}/UID ${originalUid}`);
      const originalMessage = await this.getMessageByRef(originalRef);

      // 提取发件人信息
      const originalFrom = extractEmailFromAddress(originalMessage.from);
      if (!originalFrom) {
        throw new Error('Could not extract sender email from original message');
      }

      // 构建收件人列表
      let toRecipients: string[] = [originalFrom];
      let ccRecipients: string[] = [];

      if (replyToAll) {
        // 回复全部：包含原始邮件的所有收件人
        const originalTo = extractEmailsFromAddressField(originalMessage.to);
        const originalCc = extractEmailsFromAddressField(originalMessage.cc);

        // 合并所有收件人，去重并排除自己的邮箱
        const ownAddress = EMAIL_CONFIG.IMAP.username.toLowerCase();
        const senderAddress = originalFrom.toLowerCase();
        const filteredRecipients = [...new Map(
          [...originalTo, ...originalCc]
            .map(email => email.trim())
            .filter(email => email && email.toLowerCase() !== ownAddress && email.toLowerCase() !== senderAddress)
            .map(email => [email.toLowerCase(), email])
        ).values()];

        if (filteredRecipients.length > 0) {
          ccRecipients = filteredRecipients;
        }
      }

      // 构建主题（添加Re:前缀）
      const subject = `Re: ${cleanReplySubject(originalMessage.subject || '')}`;

      // 构建回复内容
      let finalText: string | undefined = replyText;
      let finalHtml: string | undefined = replyHtml;

      if (includeOriginal && originalMessage) {
        const originalDate = originalMessage.date ? new Date(originalMessage.date).toLocaleString() : 'Unknown Date';
        const originalFromDisplay = originalMessage.from || 'Unknown Sender';

        // 构建引用的原始邮件文本
        const quotedText = buildQuotedText(originalMessage.text || '', originalDate, originalFromDisplay);
        finalText = `${replyText || ''}\n\n${quotedText}`;

        // 如果有HTML内容，也构建HTML格式的引用
        if (replyHtml || originalMessage.html) {
          const quotedHtml = buildQuotedHtml(originalMessage.text || originalMessage.html || '', originalDate, originalFromDisplay);
          finalHtml = `${replyHtml || textToHtml(replyText || '')}<br><br>${quotedHtml}`;
        }
      }

      this.validateOutgoingContent(finalText, finalHtml);

      // 构建邮件选项
      const emailOptions: EmailOptions = {
        to: toRecipients,
        cc: ccRecipients.length > 0 ? ccRecipients : undefined,
        subject: subject,
        text: finalText,
        html: finalHtml,
        inReplyTo: originalMessage.messageId,
        references: originalMessage.messageId
          ? [...(originalMessage.references || []), originalMessage.messageId]
          : originalMessage.references,
      };

      // 发送回复邮件
      console.error(`[Reply] Sending reply to: ${toRecipients.join(', ')}${ccRecipients.length > 0 ? ` (CC: ${ccRecipients.join(', ')})` : ''}`);
      const result = await this.connections.smtp.sendMail(emailOptions);

      // 尝试保存已发送的回复邮件到发件箱
      const sentFolderSaved = await this.saveSentMessage(emailOptions, result.messageId);

      const replyInfo: ReplyInfo = {
        originalUid: originalUid,
        sourceMailbox: originalRef.mailbox,
        uidValidity: originalMessage.uidValidity,
        originalFrom: originalFrom,
        originalSubject: originalMessage.subject,
        replyToAll: replyToAll,
        includeOriginal: includeOriginal,
        recipients: {
          to: toRecipients,
          cc: ccRecipients.length > 0 ? ccRecipients : undefined
        }
      };

      const responseData = {
        ...result,
        replyInfo,
        sentFolderSaved,
        note: sentFolderSaved
          ? 'Reply sent successfully and saved to sent folder'
          : 'Reply sent successfully (note: could not save to sent folder)'
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to reply to email'));
    }
  }

  private async handleConnectAll() {
    const results = await this.connections.connectAll();
    return { content: [{ type: 'text', text: results.join('\n') }] };
  }

  private async handleDisconnectAll() {
    const results = await this.connections.disconnectAll();
    return { content: [{ type: 'text', text: results.join('\n') }] };
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

  // 保存已发送邮件到发件箱
  private async saveSentMessage(emailOptions: EmailOptions, messageId?: string): Promise<boolean> {
    try {
      await this.connections.ensure(true, false);
      const sentFolder = await this.connections.findSentMailbox();
      if (!sentFolder) {
        console.error('[Email] No sent folder found, skipping save to sent folder');
        return false;
      }
      const rawMessage = await this.connections.smtp.buildRawMessage(emailOptions, messageId);
      await this.connections.imap.saveMessageToFolder(rawMessage, sentFolder);
      console.error('[Email] Message saved to sent folder successfully');
      return true;
    } catch (error) {
      console.error('[Email] Failed to save message to sent folder:', error instanceof Error ? error.message : String(error));
      // 不抛出错误，因为邮件发送成功是主要目标
      return false;
    }
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Mail server running on stdio');
  }
}

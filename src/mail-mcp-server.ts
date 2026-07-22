import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import {
  type EmailMessage,
  type AttachmentData,
  DeleteMessageError,
  type MailboxInfo,
  PartialMoveError,
  SentAppendError,
} from './imap-client';
import { type EmailOptions } from './smtp-client';
import { EMAIL_CONFIG } from './config';
import { SerialTaskQueue } from './async-queue';
import { FileAccessPolicy } from './file-access-policy';
import { type MessageRef, parseMessageRef, parseMoveMessageRef } from './message-ref';
import { MAIL_TOOLS, type MailToolName } from './tool-definitions';
import {
  type ContinueEmailThreadArgs,
  type FindUnrepliedMessagesArgs,
  type GetMessagesArgs,
  type ReplyInfo,
  type ReplyToEmailArgs,
  type SearchMessagesArgs,
  type SendEmailArgs,
  type SentFolderError,
  type SentFolderSaveResult,
} from './mail-types';
import {
  applyDefaultHtmlStyle,
  appendQuotedOriginal,
  appendSignature,
  buildReplyRecipients,
  cleanReplySubject,
  ensureHtmlAlternative,
} from './mail-utils';
import { MailSearchService } from './search-service';
import { MailConnectionManager } from './mail-connection-manager';

export class MailMCPServer {
  private server: McpServer;
  private readonly toolQueue = new SerialTaskQueue();
  private readonly fileAccessPolicy = new FileAccessPolicy(EMAIL_CONFIG.FILES);
  private readonly connections = new MailConnectionManager();
  private readonly searchService: MailSearchService;
  private shutdownPromise: Promise<void> | null = null;

  private formatError(error: unknown, context: string): string {
    return `${context}: ${error instanceof Error ? error.message : String(error)}`;
  }

  constructor(options: { registerProcessHandlers?: boolean } = {}) {
    // 验证配置
    this.validateConfig();
    this.searchService = new MailSearchService({
      ensureIMAPConnection: () => this.connections.ensure(true, false),
      getIMAPClient: () => this.connections.imap,
      findSentMailbox: () => this.connections.findSentMailbox(),
      maxBodyCharacters: EMAIL_CONFIG.FILES.maxBodyCharacters,
      maxResponseCharacters: EMAIL_CONFIG.FILES.maxResponseCharacters,
      maxSearchCandidates: EMAIL_CONFIG.FILES.maxSearchCandidates,
      maxSearchHeaderBytes: EMAIL_CONFIG.FILES.maxSearchHeaderBytes,
    });
    this.server = new McpServer({
      name: 'mcp-mail',
      version: '2.0.1',
    });

    this.setupToolHandlers();
    if (options.registerProcessHandlers !== false) this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.server.server.onerror = error => console.error('[MCP Error]', error);
    const shutdownAndExit = (reason: string) => {
      console.error(`[MCP] Shutting down: ${reason}`);
      void this.shutdown().finally(() => process.exit(0));
    };
    process.once('SIGINT', () => shutdownAndExit('SIGINT'));
    process.once('SIGTERM', () => shutdownAndExit('SIGTERM'));
    process.once('SIGHUP', () => shutdownAndExit('SIGHUP'));
    process.stdin.once('end', () => shutdownAndExit('stdin closed'));
  }

  private shutdown(): Promise<void> {
    if (!this.shutdownPromise) {
      this.shutdownPromise = (async () => {
        await this.connections.disconnectAll();
        await this.server.close();
      })();
    }
    return this.shutdownPromise;
  }

  private setupToolHandlers(): void {
    for (const tool of MAIL_TOOLS) {
      this.server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
        },
        async (args: unknown): Promise<CallToolResult> =>
          this.toolQueue.run(async () => {
            try {
              return await this.executeTool(tool.name, args as unknown as Record<string, unknown>);
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
          }),
      );
    }
  }

  private async executeTool(
    name: MailToolName,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    switch (name) {
      case 'check_connection':
        return await this.handleCheckConnection();
      case 'list_mailboxes':
        return await this.handleListMailboxes();
      case 'search_messages':
        return await this.searchService.searchMessages(args as unknown as SearchMessagesArgs);
      case 'find_unreplied_messages':
        return await this.searchService.findUnrepliedMessages(
          args as unknown as FindUnrepliedMessagesArgs,
        );
      case 'get_messages':
        return await this.handleGetMessages(args as unknown as GetMessagesArgs);
      case 'get_message':
        return await this.handleGetMessage(args);
      case 'delete_message':
        return await this.handleDeleteMessage(args);
      case 'move_message':
        return await this.handleMoveMessage(args);
      case 'save_attachment':
        return await this.handleSaveAttachment(args);
      case 'send_email':
        return await this.handleSendEmail(args as unknown as SendEmailArgs);
      case 'reply_to_email':
        return await this.handleReplyToEmail(args as unknown as ReplyToEmailArgs);
      case 'continue_email_thread':
        return await this.handleContinueEmailThread(args as unknown as ContinueEmailThreadArgs);
      default: {
        const exhaustiveName: never = name;
        throw new Error(`Unknown tool: ${exhaustiveName}`);
      }
    }
  }

  private async openMessageRef(ref: MessageRef, readOnly: boolean): Promise<MailboxInfo> {
    const mailboxInfo = await this.connections.imap.openBox(ref.mailbox, readOnly);
    if (ref.uidValidity !== undefined && mailboxInfo.uidvalidity !== ref.uidValidity) {
      throw new Error(
        `Mailbox UIDVALIDITY changed for ${ref.mailbox}: expected ${ref.uidValidity}, got ${mailboxInfo.uidvalidity}. Refresh the message reference before retrying.`,
      );
    }
    return mailboxInfo;
  }

  private async getMessageByRef(ref: MessageRef, readOnly: boolean = true): Promise<EmailMessage> {
    await this.openMessageRef(ref, readOnly);
    return this.connections.imap.getMessage(ref.uid);
  }

  private messageForResponse<T extends EmailMessage>(
    message: T,
    budget?: { used: number; limit: number },
  ): T & { textTruncated?: boolean; htmlTruncated?: boolean } {
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
    if (budget) {
      const bodyCharacters = (result.text?.length || 0) + (result.html?.length || 0);
      const nextUsed = budget.used + bodyCharacters;
      if (nextUsed > budget.limit) {
        throw new Error(
          `Response bodies would contain ${nextUsed} characters, exceeding MAIL_MAX_RESPONSE_CHARACTERS=${budget.limit}. Request fewer messages or retrieve them individually.`,
        );
      }
      budget.used = nextUsed;
    }
    return result;
  }

  private createResponseBudget(): { used: number; limit: number } {
    return { used: 0, limit: EMAIL_CONFIG.FILES.maxResponseCharacters };
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

  private async handleListMailboxes(): Promise<CallToolResult> {
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
          selectable: !box.attribs?.some(
            (attribute: unknown) => String(attribute).toLowerCase() === '\\noselect',
          ),
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
      throw new Error(this.formatError(error, 'Failed to list mailboxes'), { cause: error });
    }
  }

  private async handleGetMessages(args: GetMessagesArgs): Promise<CallToolResult> {
    await this.connections.ensure(true, false);

    const uids = args.uids;
    if (!Array.isArray(uids) || uids.some(uid => !Number.isInteger(uid) || uid <= 0)) {
      throw new Error('uids must be an array of positive integers');
    }
    if (uids.length === 0 || uids.length > 50)
      throw new Error('uids must contain between 1 and 50 entries');
    if (new Set(uids).size !== uids.length) throw new Error('uids must not contain duplicates');
    if (args.markSeen !== undefined && typeof args.markSeen !== 'boolean') {
      throw new Error('markSeen must be a boolean');
    }

    const ref = parseMessageRef({
      mailbox: args.mailbox,
      uid: uids[0],
      uidValidity: args.uidValidity,
    });

    const markSeen = args.markSeen || false;

    try {
      await this.openMessageRef(ref, !markSeen);
      await this.connections.imap.assertUIDsExist(uids);
      const messages: EmailMessage[] = [];
      const responseBudget = this.createResponseBudget();
      for (const uid of uids) {
        const fetched = await this.connections.imap.fetchMessages([uid], { markSeen });
        if (fetched.length === 0) {
          throw new Error(`Message with UID ${uid} not found in mailbox ${ref.mailbox}`);
        }
        messages.push(...fetched.map(message => this.messageForResponse(message, responseBudget)));
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(messages, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to get messages'), { cause: error });
    }
  }

  private async handleGetMessage(args: any): Promise<CallToolResult> {
    await this.connections.ensure(true, false);

    const ref = parseMessageRef(args);
    if (args.markSeen !== undefined && typeof args.markSeen !== 'boolean') {
      throw new Error('markSeen must be a boolean');
    }
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
            text: JSON.stringify(
              this.messageForResponse(messages[0], this.createResponseBudget()),
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(this.formatError(error, 'Failed to get message'), { cause: error });
    }
  }

  private async handleDeleteMessage(args: any): Promise<CallToolResult> {
    await this.connections.ensure(true, false);

    const ref = parseMessageRef(args);
    let mailboxInfo: MailboxInfo | undefined;

    try {
      mailboxInfo = await this.openMessageRef(ref, false);
      await this.connections.imap.deleteMessage(ref.uid, mailboxInfo.uidvalidity);

      return {
        content: [
          {
            type: 'text',
            text: `Message ${ref.mailbox}/UID ${ref.uid} deleted successfully`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof DeleteMessageError) {
        const response = {
          deleted: false,
          partial: error.outcome === 'unknown' || error.sourceDeletedFlag === true,
          outcome: error.outcome,
          stage: error.stage,
          sourceState: error.sourceState,
          sourceDeletedFlag: error.sourceDeletedFlag,
          sourceMailbox: ref.mailbox,
          sourceUid: ref.uid,
          sourceUidValidity: mailboxInfo?.uidvalidity,
          error: this.redactDiagnosticMessage(error.message),
          note:
            error.outcome === 'unknown'
              ? 'The server connection failed before deletion could be confirmed. Refresh the mailbox reference before deciding whether to retry.'
              : error.sourceDeletedFlag
                ? 'The message still exists with the \\Deleted flag set. Inspect it before any later expunge or retry.'
                : 'The message still exists and is not marked deleted; the permanent deletion did not complete.',
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
          isError: true,
        };
      }
      throw new Error(this.formatError(error, 'Failed to delete message'), { cause: error });
    }
  }

  private async handleMoveMessage(args: unknown): Promise<CallToolResult> {
    await this.connections.ensure(true, false);

    const ref = parseMoveMessageRef(args);
    let sourceMailboxInfo: MailboxInfo | undefined;

    try {
      sourceMailboxInfo = await this.openMessageRef(ref, false);
      const result = await this.connections.imap.moveMessage(ref.uid, ref.targetMailbox);
      const response: Record<string, unknown> = {
        moved: true,
        sourceMailbox: ref.mailbox,
        sourceUid: ref.uid,
        sourceUidValidity: sourceMailboxInfo.uidvalidity,
        targetMailbox: ref.targetMailbox,
      };

      if (result.destinationUid !== undefined) {
        const destinationReference = await this.refreshDestinationReference(
          ref.targetMailbox,
          result.destinationUid,
        );
        Object.assign(response, destinationReference);
        if (destinationReference.destinationReferenceError) {
          response.note =
            'The message was moved, but the destination UIDVALIDITY could not be refreshed. Search the target mailbox before using the destination UID.';
        }
      } else {
        response.note =
          'The server did not return a destination UID. Search the target mailbox to refresh the message reference.';
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (error) {
      if (error instanceof PartialMoveError) {
        const destinationReference =
          error.destinationUid === undefined
            ? {}
            : await this.refreshDestinationReference(ref.targetMailbox, error.destinationUid);
        const response = {
          moved: false,
          partial: true,
          copySucceeded: error.copyOutcome === 'succeeded',
          copyOutcome: error.copyOutcome,
          sourceState: error.sourceState,
          sourceDeletedFlag: error.sourceDeletedFlag,
          sourceMailbox: ref.mailbox,
          sourceUid: ref.uid,
          sourceUidValidity: sourceMailboxInfo?.uidvalidity,
          targetMailbox: ref.targetMailbox,
          ...destinationReference,
          error: this.redactDiagnosticMessage(error.message),
          note:
            error.copyOutcome === 'unknown'
              ? 'The IMAP connection ended before the move or copy command could be confirmed. Do not retry blindly; refresh and inspect both mailboxes first.'
              : error.destinationUid === undefined
                ? 'A destination copy was created, but the server did not return its UID and source cleanup failed. Do not retry blindly; search the target mailbox and inspect the source first.'
                : 'A destination copy was created, but source cleanup failed or could not be confirmed. Do not retry blindly; inspect both mailboxes first to avoid duplicate copies.',
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
          isError: true,
        };
      }
      throw new Error(this.formatError(error, 'Failed to move message'), { cause: error });
    }
  }

  private async refreshDestinationReference(
    targetMailbox: string,
    destinationUid: number,
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = { destinationUid };
    try {
      const targetMailboxInfo = await this.connections.imap.openBox(targetMailbox, true);
      result.destinationUidValidity = targetMailboxInfo.uidvalidity;
    } catch (error) {
      result.destinationReferenceError = this.redactDiagnosticMessage(
        error instanceof Error ? error.message : String(error),
      );
    }
    return result;
  }

  private async handleSaveAttachment(args: any): Promise<CallToolResult> {
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
    await this.connections.ensure(true, false);

    try {
      const message = await this.getMessageByRef(ref);
      if (message.size !== null && message.size > EMAIL_CONFIG.FILES.maxAttachmentBytes) {
        throw new Error(
          `Message size ${message.size} exceeds the configured attachment processing limit of ${EMAIL_CONFIG.FILES.maxAttachmentBytes} bytes`,
        );
      }

      // 获取附件内容
      const allAttachments = await this.connections.imap.fetchMessageAttachments(
        ref.uid,
        EMAIL_CONFIG.FILES.maxAttachmentBytes,
      );

      if (allAttachments.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  uid: ref.uid,
                  sourceMailbox: ref.mailbox,
                  note: 'This email has no attachments.',
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // 筛选要保存的附件
      let attachmentsToSave: AttachmentData[];
      if (attachmentIndex !== undefined) {
        if (
          !Number.isInteger(attachmentIndex) ||
          attachmentIndex < 0 ||
          attachmentIndex >= allAttachments.length
        ) {
          throw new Error(
            `Invalid attachmentIndex: ${attachmentIndex}. Valid range: 0-${allAttachments.length - 1}`,
          );
        }
        attachmentsToSave = [allAttachments[attachmentIndex]];
      } else {
        attachmentsToSave = allAttachments;
      }

      for (const att of attachmentsToSave) {
        if (att.size > EMAIL_CONFIG.FILES.maxAttachmentBytes) {
          throw new Error(
            `Attachment ${att.filename} exceeds the configured limit of ${EMAIL_CONFIG.FILES.maxAttachmentBytes} bytes`,
          );
        }
        if (returnBase64 && att.size > EMAIL_CONFIG.FILES.maxBase64Bytes) {
          throw new Error(
            `Attachment ${att.filename} is too large to return as base64 (limit: ${EMAIL_CONFIG.FILES.maxBase64Bytes} bytes)`,
          );
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
        try {
          // Build the optional response payload before creating the file so a
          // Base64 allocation failure cannot leave an unreported file behind.
          const base64 = returnBase64 ? att.content.toString('base64') : undefined;
          const targetPath = await this.fileAccessPolicy.writeNewFile(
            savePath,
            att.filename,
            att.content,
          );
          console.error(`[Attachment] Saved: ${targetPath} (${att.size} bytes)`);

          savedFiles.push({
            index: att.index,
            filename: att.filename,
            contentType: att.contentType,
            size: att.size,
            savedPath: targetPath,
            ...(base64 === undefined ? {} : { base64 }),
          });
        } catch (error) {
          const responseData = {
            uid: ref.uid,
            sourceMailbox: ref.mailbox,
            uidValidity: message.uidValidity,
            subject: message.subject,
            totalAttachments: allAttachments.length,
            requestedCount: attachmentsToSave.length,
            savedCount: savedFiles.length,
            savedFiles,
            partial: savedFiles.length > 0,
            failedAttachment: {
              index: att.index,
              filename: att.filename,
              contentType: att.contentType,
              size: att.size,
            },
            error: this.redactDiagnosticMessage(
              error instanceof Error ? error.message : String(error),
            ),
            note:
              savedFiles.length > 0
                ? 'Some attachments were saved before a later write failed. Inspect savedFiles before retrying to avoid duplicate files.'
                : 'No attachment was saved.',
          };
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(responseData, null, 2) }],
            isError: true,
          };
        }
      }

      const responseData = {
        uid: ref.uid,
        sourceMailbox: ref.mailbox,
        uidValidity: message.uidValidity,
        subject: message.subject,
        totalAttachments: allAttachments.length,
        savedCount: savedFiles.length,
        savedFiles,
        note: `Successfully saved ${savedFiles.length} attachment(s) to ${savePath}`,
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
      throw new Error(this.formatError(error, 'Failed to save attachment'), { cause: error });
    }
  }

  private async handleCheckConnection(): Promise<CallToolResult> {
    const checks = await this.connections.connectAll();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              checks,
              ...this.connections.getStatus(),
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  private async handleSendEmail(args: SendEmailArgs): Promise<CallToolResult> {
    if (!args || typeof args.to !== 'string' || !args.to.trim()) {
      throw new Error('to must be a non-empty string');
    }
    if (typeof args.subject !== 'string' || !args.subject.trim()) {
      throw new Error('subject must be a non-empty string');
    }

    if (!args.text && !args.html) {
      throw new Error('Either text or html content is required');
    }

    const signedContent = ensureHtmlAlternative(
      appendSignature(args.text, args.html, args.signature),
    );
    const emailOptions: EmailOptions = {
      to: args.to.trim(),
      subject: args.subject,
      text: signedContent.text,
      html: applyDefaultHtmlStyle(signedContent.html),
      cc: args.cc?.trim() || undefined,
      bcc: args.bcc?.trim() || undefined,
    };

    this.validateOutgoingContent(emailOptions.text, emailOptions.html);
    await this.connections.ensure(false, true);

    // 处理附件
    if (args.attachments && args.attachments.length > 0) {
      const attachmentList: Array<{ filename: string; content: Buffer; contentType?: string }> = [];
      let totalAttachmentBytes = 0;
      for (const filePath of args.attachments) {
        try {
          const allowedFile = await this.fileAccessPolicy.readAttachmentFile(filePath);
          totalAttachmentBytes += allowedFile.size;
          if (totalAttachmentBytes > EMAIL_CONFIG.FILES.maxAttachmentBytes) {
            throw new Error(
              `Total attachment size exceeds the configured limit of ${EMAIL_CONFIG.FILES.maxAttachmentBytes} bytes`,
            );
          }
          attachmentList.push({
            filename: path.basename(allowedFile.path),
            content: allowedFile.content,
          });
        } catch (error) {
          throw new Error(
            `Failed to read attachment file: ${filePath} - ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
      }
      emailOptions.attachments = attachmentList;
    }

    try {
      const result = await this.connections.smtp.sendMail(emailOptions);

      // 尝试保存已发送邮件到发件箱
      const sentFolderResult = await this.saveSentMessage(emailOptions, result.messageId);

      const responseWithSentInfo = {
        ...result,
        sentFolderSaved: sentFolderResult.saved,
        sentFolder: sentFolderResult.mailbox,
        sentFolderError: sentFolderResult.error,
        note: sentFolderResult.saved
          ? 'Email sent successfully and saved to sent folder'
          : 'Email sent successfully (note: could not save to sent folder)',
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
      throw new Error(this.formatError(error, 'Failed to send email'), { cause: error });
    }
  }

  private async handleReplyToEmail(args: ReplyToEmailArgs): Promise<CallToolResult> {
    const originalRef = parseMessageRef(args, 'originalUid');
    const originalUid = originalRef.uid;
    const replyText = args.text;
    const replyHtml = args.html;
    const replyToAll = args.replyToAll || false;
    const includeOriginal = args.includeOriginal !== false; // 默认为true

    if (!args.text && !args.html) {
      throw new Error('Either text or html content is required');
    }
    await this.connections.ensure(true, true);
    try {
      console.error(`[Reply] Fetching original message: ${originalRef.mailbox}/UID ${originalUid}`);
      const originalMessage = await this.getMessageByRef(originalRef);

      const recipients = buildReplyRecipients(
        originalMessage.from,
        originalMessage.replyTo,
        originalMessage.to,
        originalMessage.cc,
        [EMAIL_CONFIG.ACCOUNT.emailAddress, EMAIL_CONFIG.IMAP.username, EMAIL_CONFIG.SMTP.username],
        replyToAll,
      );
      const toRecipients = recipients.to;
      const ccRecipients = recipients.cc;
      if (toRecipients.length === 0) {
        throw new Error('Could not determine a reply recipient from the original message');
      }

      // 构建主题（添加Re:前缀）
      const subject = `Re: ${cleanReplySubject(originalMessage.subject || '')}`;

      // 构建回复内容
      const signedReply = ensureHtmlAlternative(
        appendSignature(replyText, replyHtml, args.signature),
      );
      this.validateOutgoingContent(signedReply.text, signedReply.html);
      let finalText: string | undefined = signedReply.text;
      let finalHtml: string | undefined = signedReply.html;

      if (includeOriginal && originalMessage) {
        const originalDate = originalMessage.date
          ? new Date(originalMessage.date).toLocaleString()
          : 'Unknown Date';
        const originalFromDisplay = originalMessage.from || 'Unknown Sender';
        const replyContent = appendQuotedOriginal(
          signedReply,
          originalMessage.text,
          originalMessage.html,
          originalDate,
          originalFromDisplay,
          EMAIL_CONFIG.FILES.maxBodyCharacters,
        );
        finalText = replyContent.text;
        finalHtml = replyContent.html;
      }

      finalHtml = applyDefaultHtmlStyle(finalHtml);
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
      console.error(
        `[Reply] Sending reply to: ${toRecipients.join(', ')}${ccRecipients.length > 0 ? ` (CC: ${ccRecipients.join(', ')})` : ''}`,
      );
      const result = await this.connections.smtp.sendMail(emailOptions);

      // 尝试保存已发送的回复邮件到发件箱
      const sentFolderResult = await this.saveSentMessage(emailOptions, result.messageId);

      const replyInfo: ReplyInfo = {
        originalUid: originalUid,
        sourceMailbox: originalRef.mailbox,
        uidValidity: originalMessage.uidValidity,
        originalFrom: originalMessage.from,
        originalSubject: originalMessage.subject,
        replyToAll: replyToAll,
        includeOriginal: includeOriginal,
        recipients: {
          to: toRecipients,
          cc: ccRecipients.length > 0 ? ccRecipients : undefined,
        },
      };

      const responseData = {
        ...result,
        replyInfo,
        sentFolderSaved: sentFolderResult.saved,
        sentFolder: sentFolderResult.mailbox,
        sentFolderError: sentFolderResult.error,
        note: sentFolderResult.saved
          ? 'Reply sent successfully and saved to sent folder'
          : 'Reply sent successfully (note: could not save to sent folder)',
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
      throw new Error(this.formatError(error, 'Failed to reply to email'), { cause: error });
    }
  }

  private async handleContinueEmailThread(args: ContinueEmailThreadArgs): Promise<CallToolResult> {
    if (!args.text && !args.html) {
      throw new Error('Either text or html content is required');
    }

    const latest = await this.searchService.findLatestSentMessage({
      subject: args.subject,
      recipient: args.recipient,
      since: args.since,
    });
    if (!latest) {
      throw new Error(
        `No sent message has the exact normalized subject "${args.subject.trim()}"${args.recipient ? ` for recipient ${args.recipient.trim()}` : ''}`,
      );
    }
    if (!latest.messageId) {
      throw new Error(
        `The latest matching sent message ${latest.sourceMailbox}/UID ${latest.uid} has no Message-ID and cannot be continued safely`,
      );
    }

    return this.handleReplyToEmail({
      mailbox: latest.sourceMailbox,
      originalUid: latest.uid,
      uidValidity: latest.uidValidity,
      text: args.text,
      html: args.html,
      signature: args.signature,
      replyToAll: args.replyToAll !== false,
      includeOriginal: args.includeOriginal !== false,
    });
  }

  private validateConfig(): void {
    try {
      console.error('=== MCP Mail Server Configuration ===');
      console.error(
        `IMAP: ${EMAIL_CONFIG.IMAP.host}:${EMAIL_CONFIG.IMAP.port} (TLS: ${EMAIL_CONFIG.IMAP.tls})`,
      );
      console.error(
        `SMTP: ${EMAIL_CONFIG.SMTP.host}:${EMAIL_CONFIG.SMTP.port} (Secure: ${EMAIL_CONFIG.SMTP.secure})`,
      );
      console.error(`User: ${EMAIL_CONFIG.IMAP.username}`);
      console.error('Password: [CONFIGURED]');
      console.error('Configuration loaded successfully');
    } catch (error) {
      console.error('Configuration error:', error instanceof Error ? error.message : String(error));
      console.error(
        'Please ensure all required environment variables are set in your MCP server configuration.',
      );
      throw error;
    }
  }

  // 保存已发送邮件到发件箱
  private async saveSentMessage(
    emailOptions: EmailOptions,
    messageId?: string,
  ): Promise<SentFolderSaveResult> {
    try {
      await this.connections.ensure(true, false);
    } catch (error) {
      return this.sentFolderFailure(
        'connection',
        'IMAP_CONNECTION_FAILED',
        'Could not connect to IMAP before saving the sent copy',
        error,
      );
    }

    let rawMessage: Buffer;
    try {
      rawMessage = await this.connections.smtp.buildRawMessage(emailOptions, messageId);
    } catch (error) {
      return this.sentFolderFailure(
        'build',
        'RAW_MESSAGE_BUILD_FAILED',
        'Could not build the raw MIME message for the sent copy',
        error,
      );
    }

    let sentFolders: string[];
    try {
      sentFolders = await this.connections.getSentMailboxCandidates();
    } catch (error) {
      return this.sentFolderFailure(
        'detect',
        'SENT_MAILBOX_NOT_FOUND',
        'Sent mailbox detection failed',
        error,
      );
    }

    if (sentFolders.length === 0) {
      return this.sentFolderFailure(
        'detect',
        'SENT_MAILBOX_NOT_FOUND',
        'No sent mailbox candidate was found',
      );
    }

    const attempts: NonNullable<SentFolderError['attempts']> = [];
    for (const sentFolder of sentFolders) {
      try {
        await this.connections.imap.saveMessageToFolder(rawMessage, sentFolder);
        this.connections.rememberSentMailbox(sentFolder);
        console.error(`[Email] Message saved to sent folder successfully: ${sentFolder}`);
        return { saved: true, mailbox: sentFolder };
      } catch (error) {
        this.connections.invalidateSentMailbox(sentFolder);
        const appendError = error instanceof SentAppendError ? error : null;
        const attempt = {
          mailbox: sentFolder,
          stage: appendError?.stage ?? ('append' as const),
          outcome: appendError?.outcome ?? ('unknown' as const),
          message: this.redactDiagnosticMessage(
            error instanceof Error ? error.message : String(error),
          ),
        };
        attempts.push(attempt);

        // A read-write SELECT failure or tagged APPEND NO/BAD means no copy was
        // created, so trying the next candidate is safe. Transport failures are
        // ambiguous and must stop to avoid duplicating a message that may have
        // reached the first mailbox.
        if (attempt.outcome === 'unknown') {
          return this.sentFolderFailure(
            'append',
            'IMAP_APPEND_FAILED',
            'IMAP APPEND outcome is unknown; no other sent mailbox was tried',
            error,
            sentFolder,
            attempts,
          );
        }
      }
    }

    const lastAttempt = attempts.at(-1);
    const everyFailureWasSelection =
      attempts.length > 0 && attempts.every(attempt => attempt.stage === 'select');
    return this.sentFolderFailure(
      everyFailureWasSelection ? 'detect' : 'append',
      everyFailureWasSelection ? 'SENT_MAILBOX_NOT_FOUND' : 'IMAP_APPEND_FAILED',
      everyFailureWasSelection
        ? 'No sent mailbox candidate could be selected read-write'
        : 'Every selectable sent mailbox candidate rejected the sent copy',
      lastAttempt?.message,
      lastAttempt?.mailbox,
      attempts,
    );
  }

  private sentFolderFailure(
    stage: SentFolderError['stage'],
    code: SentFolderError['code'],
    summary: string,
    error?: unknown,
    mailbox?: string,
    attempts?: SentFolderError['attempts'],
  ): SentFolderSaveResult {
    const detail =
      error instanceof Error ? error.message : error === undefined ? '' : String(error);
    const message = this.redactDiagnosticMessage(detail ? `${summary}: ${detail}` : summary);
    const sentFolderError: SentFolderError = { stage, code, message };
    if (mailbox) sentFolderError.mailbox = mailbox;
    if (attempts && attempts.length > 0) sentFolderError.attempts = attempts;
    console.error(`[Email] ${message}`);
    return { saved: false, mailbox, error: sentFolderError };
  }

  private redactDiagnosticMessage(message: string): string {
    let redacted = message;
    const secrets = [EMAIL_CONFIG.IMAP.password, EMAIL_CONFIG.SMTP.password].filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
    for (const secret of new Set(secrets)) {
      redacted = redacted.split(secret).join('[REDACTED]');
    }
    return redacted.replace(
      /\b(password|passwd|pass|token|secret)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[REDACTED]',
    );
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Mail server running on stdio');
  }
}

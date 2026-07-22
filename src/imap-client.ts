import Imap from 'imap';
import { EventEmitter } from 'events';
import { simpleParser } from 'mailparser';
import { extractEmailsFromAddressField } from './mail-utils';

export interface IMAPConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  tls?: boolean;
  tlsRejectUnauthorized?: boolean;
  connTimeout?: number;
  authTimeout?: number;
  socketTimeout?: number;
  keepalive?: boolean;
  maxMessageBytes?: number;
}

export interface AttachmentMeta {
  index: number;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  contentDisposition?: string;
}

export interface AttachmentData extends AttachmentMeta {
  content: Buffer;
}

export interface EmailMessage {
  uid: number;
  sourceMailbox: string;
  uidValidity: number;
  flags: string[];
  /** IMAP INTERNALDATE normalized to an ISO 8601 instant. */
  date: string;
  /** RFC822.SIZE in bytes, or null when the IMAP server omits it. */
  size: number | null;
  // 使用解析后的内容作为主要字段
  subject: string;
  from: string;
  replyTo?: string;
  to: string;
  cc?: string;
  bcc?: string;
  text?: string;
  html?: string;
  attachments?: AttachmentMeta[];
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
}

export interface MailboxInfo {
  name: string;
  messages: {
    total: number;
    new: number;
    unseen: number;
  };
  permFlags: string[];
  uidvalidity: number;
  uidnext: number;
}

export interface MoveMessageResult {
  destinationUid?: number;
}

export interface FetchByteBudget {
  used: number;
  limit: number;
}

export interface FetchMessagesOptions extends Imap.FetchOptions {
  byteBudget?: FetchByteBudget;
}

export class FetchByteLimitError extends Error {
  constructor(
    readonly used: number,
    readonly limit: number,
  ) {
    super(`Fetch byte budget exceeded after buffering ${used} of ${limit} allowed bytes`);
    this.name = 'FetchByteLimitError';
  }
}

export class PartialMoveError extends Error {
  constructor(
    message: string,
    readonly destinationUid?: number,
    readonly sourceState: MessageSourceState = 'unknown',
    readonly sourceDeletedFlag?: boolean,
    readonly copyOutcome: 'succeeded' | 'unknown' = 'succeeded',
  ) {
    super(message);
    this.name = 'PartialMoveError';
  }
}

export type MessageSourceState = 'present' | 'absent' | 'unknown';

export class DeleteMessageError extends Error {
  constructor(
    message: string,
    readonly stage: 'mark-deleted' | 'expunge',
    readonly outcome: 'not-deleted' | 'unknown',
    readonly sourceState: MessageSourceState,
    readonly sourceDeletedFlag?: boolean,
  ) {
    super(message);
    this.name = 'DeleteMessageError';
  }
}

export class SentAppendError extends Error {
  constructor(
    message: string,
    readonly stage: 'select' | 'append',
    readonly outcome: 'not-appended' | 'unknown',
  ) {
    super(message);
    this.name = 'SentAppendError';
  }
}

export class IMAPOperationAbortedError extends Error {
  constructor(
    readonly operation: string,
    readonly terminalEvent: 'error' | 'end' | 'close',
    detail: string,
  ) {
    super(`IMAP ${operation} aborted because the connection ${detail}`);
    this.name = 'IMAPOperationAbortedError';
  }
}

interface UIDStateInspection {
  state: MessageSourceState;
  deletedFlag?: boolean;
  diagnostic?: string;
}

const MAX_HEADER_BYTES = 256 * 1024;

export class IMAPClient extends EventEmitter {
  private imap: Imap | null = null;
  private config: IMAPConfig;
  private connected = false;
  private authenticated = false;
  private currentBox: string | null = null;
  private currentUidValidity: number | null = null;

  constructor(config: IMAPConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.error(
        `[IMAP] Connecting to ${this.config.host}:${this.config.port} (TLS: ${this.config.tls})`,
      );

      const imapConfig: Imap.Config & { socketTimeout?: number } = {
        user: this.config.username,
        password: this.config.password,
        host: this.config.host,
        port: this.config.port,
        tls: this.config.tls || false,
        tlsOptions: {
          rejectUnauthorized: this.config.tlsRejectUnauthorized !== false,
          servername: this.config.host,
        },
        connTimeout: this.config.connTimeout ?? 60000,
        authTimeout: this.config.authTimeout ?? 30000,
        socketTimeout: this.config.socketTimeout ?? 60000,
        keepalive: this.config.keepalive !== false,
      };

      this.imap = new Imap(imapConfig);
      let initialConnectionSettled = false;
      const clearConnectionState = () => {
        this.connected = false;
        this.authenticated = false;
        this.currentBox = null;
        this.currentUidValidity = null;
      };
      const rejectInitialConnection = (message: string) => {
        if (!initialConnectionSettled) {
          initialConnectionSettled = true;
          reject(new Error(message));
        }
      };

      this.imap.once('ready', async () => {
        console.error('[IMAP] Connection ready');
        this.connected = true;
        this.authenticated = true;

        // 自动打开收件箱
        try {
          await this.openBox('INBOX', true); // 只读方式打开
          console.error('[IMAP] Auto-opened INBOX');
        } catch (error) {
          console.error(
            '[IMAP] Failed to auto-open INBOX:',
            error instanceof Error ? error.message : String(error),
          );
        }

        if (!initialConnectionSettled && this.connected && this.authenticated) {
          initialConnectionSettled = true;
          resolve();
        }
      });

      this.imap.on('error', (error: Error) => {
        console.error('[IMAP] Connection error:', error.message);
        clearConnectionState();
        rejectInitialConnection(`IMAP connection failed: ${error.message}`);
      });

      this.imap.once('end', () => {
        console.error('[IMAP] Connection ended');
        clearConnectionState();
        rejectInitialConnection('IMAP connection ended before it became ready');
      });

      this.imap.once('close', (hadError: boolean) => {
        console.error(`[IMAP] Connection closed${hadError ? ' after an error' : ''}`);
        clearConnectionState();
        rejectInitialConnection('IMAP connection closed before it became ready');
      });

      this.imap.connect();
    });
  }

  async openBox(boxName: string = 'INBOX', readOnly: boolean = false): Promise<MailboxInfo> {
    if (!this.imap || !this.authenticated) {
      throw new Error('Not connected or authenticated');
    }

    return this.runOperation(`SELECT ${boxName}`, (imap, resolve, reject) => {
      imap.openBox(boxName, readOnly, (error, box) => {
        if (error) {
          console.error(`[IMAP] Failed to open box ${boxName}:`, error.message);
          // node-imap clears its selected-box state when SELECT/EXAMINE fails.
          // Keep the wrapper state aligned with the underlying client.
          this.currentBox = null;
          this.currentUidValidity = null;
          reject(new Error(`Failed to open mailbox: ${error.message}`));
          return;
        }

        console.error(`[IMAP] Opened box ${boxName}`);
        this.currentBox = boxName;
        this.currentUidValidity = box.uidvalidity;

        const mailboxInfo: MailboxInfo = {
          name: boxName,
          messages: {
            total: box.messages.total,
            new: box.messages.new,
            unseen: box.messages.unseen,
          },
          permFlags: box.permFlags,
          uidvalidity: box.uidvalidity,
          uidnext: box.uidnext,
        };

        resolve(mailboxInfo);
      });
    });
  }

  async getBoxes(): Promise<any> {
    if (!this.imap || !this.authenticated) {
      throw new Error('Not connected or authenticated');
    }

    return this.runOperation('LIST', (imap, resolve, reject) => {
      imap.getBoxes((error, boxes) => {
        if (error) {
          reject(new Error(`Failed to get boxes: ${error.message}`));
          return;
        }
        resolve(boxes);
      });
    });
  }

  async search(criteria: any[] = ['ALL']): Promise<number[]> {
    if (!this.imap) {
      throw new Error('Not connected to IMAP server');
    }

    // 如果没有打开邮箱，自动打开收件箱
    if (!this.currentBox) {
      await this.openBox('INBOX', true);
    }

    return this.runOperation('SEARCH', (imap, resolve, reject) => {
      imap.search(criteria, (error, results) => {
        if (error) {
          console.error('[IMAP] Search failed:', error.message);
          reject(new Error(`Search failed: ${error.message}`));
          return;
        }

        console.error(`[IMAP] Search found ${results.length} messages`);
        resolve(results);
      });
    });
  }

  async fetchMessages(uids: number[], options: FetchMessagesOptions = {}): Promise<EmailMessage[]> {
    if (!this.imap) {
      throw new Error('Not connected to IMAP server');
    }

    // 如果没有打开邮箱，自动打开收件箱
    if (!this.currentBox) {
      await this.openBox('INBOX', true);
    }

    const { byteBudget, ...imapFetchOverrides } = options;
    const fetchOptions: Imap.FetchOptions = {
      bodies: options.bodies || ['HEADER', 'TEXT'],
      // The parsed message is built from BODY data, so ENVELOPE and
      // BODYSTRUCTURE are redundant. Keeping them disabled also ensures all
      // variable-sized message data passes through the bounded body streams.
      struct: options.struct === true,
      envelope: options.envelope === true,
      size: options.size !== false,
      markSeen: options.markSeen || false,
      ...imapFetchOverrides,
    };
    const sourceMailbox = this.currentBox!;
    const uidValidity = this.currentUidValidity!;

    return this.runOperation('FETCH', (imap, resolve, reject, confirmCommand) => {
      const messages: EmailMessage[] = [];
      let byteBudgetExceeded = false;
      const pendingMessages: Map<
        number,
        {
          message: Partial<EmailMessage>;
          headers: Record<string, string>;
          rawBuffer: Buffer;
          tooLarge: boolean;
        }
      > = new Map();

      if (uids.length === 0) {
        resolve(messages);
        return;
      }

      const fetch = imap.fetch(uids, fetchOptions);

      fetch.on('message', (msg, seqno) => {
        console.error(`[IMAP] Processing message ${seqno}`);

        let headers: Record<string, string> = {};
        const rawChunks: Buffer[] = [];
        let rawBytes = 0;
        let headerBytes = 0;
        let tooLarge = false;
        const maxMessageBytes = this.config.maxMessageBytes ?? 25 * 1024 * 1024;
        const maxHeaderBytes = Math.min(maxMessageBytes, MAX_HEADER_BYTES);
        const message: Partial<EmailMessage> = {
          uid: 0,
          sourceMailbox,
          uidValidity,
          flags: [],
          date: '',
          size: null,
        };

        msg.on('body', (stream, info) => {
          const isHeader = String(info.which).toUpperCase().startsWith('HEADER');
          const headerChunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => {
            const messageRemaining = Math.max(0, maxMessageBytes - rawBytes);
            const headerRemaining = isHeader
              ? Math.max(0, maxHeaderBytes - headerBytes)
              : messageRemaining;
            const locallyBufferableBytes = Math.min(
              chunk.length,
              messageRemaining,
              headerRemaining,
            );
            const budgetRemaining = byteBudget
              ? Math.max(0, byteBudget.limit - byteBudget.used)
              : locallyBufferableBytes;
            const bytesToBuffer = Math.min(locallyBufferableBytes, budgetRemaining);
            if (bytesToBuffer > 0) {
              const bufferedChunk =
                bytesToBuffer === chunk.length ? chunk : chunk.subarray(0, bytesToBuffer);
              rawChunks.push(bufferedChunk);
              rawBytes += bufferedChunk.length;
              if (isHeader) {
                headerChunks.push(bufferedChunk);
                headerBytes += bufferedChunk.length;
              }
              if (byteBudget) byteBudget.used += bufferedChunk.length;
            }
            if (byteBudget && locallyBufferableBytes > budgetRemaining) {
              byteBudgetExceeded = true;
            }
            if (bytesToBuffer < chunk.length) {
              tooLarge = true;
            }
          });

          stream.once('end', () => {
            if (isHeader) {
              // 头部需要字符串处理来解析
              const bufferString = Buffer.concat(headerChunks).toString('utf8');
              headers = this.parseHeaders(bufferString);
            }
          });
          stream.once('error', (error: Error) => {
            reject(new Error(`Fetch body stream failed: ${error.message}`));
          });
        });

        msg.once('attributes', attrs => {
          message.uid = attrs.uid;
          message.flags = attrs.flags || [];
          // 存储为 ISO 8601 格式，确保跨平台一致解析
          const date = attrs.date || new Date();
          message.date = (date instanceof Date ? date : new Date(date)).toISOString();
          const reportedSize = Number(attrs.size);
          message.size =
            Number.isSafeInteger(reportedSize) && reportedSize > 0 ? reportedSize : null;
        });

        msg.once('end', () => {
          console.error(`[IMAP] Message ${seqno} processed, preparing for parse`);
          pendingMessages.set(seqno, {
            message,
            headers,
            rawBuffer: Buffer.concat(rawChunks),
            tooLarge,
          });
        });
      });

      fetch.once('error', error => {
        console.error('[IMAP] Fetch error:', error.message);
        reject(new Error(`Fetch failed: ${error.message}`));
      });

      fetch.once('end', async () => {
        // The tagged FETCH command has completed. Parsing is local work, so a
        // later socket close must not turn already-received data into a false
        // transport failure.
        confirmCommand();
        console.error(`[IMAP] Fetch completed, parsing ${pendingMessages.size} messages`);

        if (byteBudgetExceeded && byteBudget) {
          reject(new FetchByteLimitError(byteBudget.used, byteBudget.limit));
          return;
        }

        // 解析所有待处理的消息
        for (const [seqno, data] of pendingMessages) {
          try {
            if (data.tooLarge) {
              messages.push({
                ...data.message,
                subject: data.headers['subject'] || 'Message too large',
                from: data.headers['from'] || '',
                replyTo: data.headers['reply-to'] || undefined,
                to: data.headers['to'] || '',
                cc: data.headers['cc'] || undefined,
                bcc: data.headers['bcc'] || undefined,
                text: `[Message body omitted because it exceeds the configured limit of ${this.config.maxMessageBytes ?? 25 * 1024 * 1024} bytes]`,
              } as EmailMessage);
              continue;
            }
            // 使用 mailparser 解析完整的邮件原始Buffer，让mailparser自动处理编码
            const parsedMail = await simpleParser(data.rawBuffer);

            const extractEmailAddress = (addressObj: unknown): string =>
              extractEmailsFromAddressField(addressObj).join(', ');

            // 提取附件元数据（不含内容Buffer）
            const attachmentsMeta: AttachmentMeta[] = (parsedMail.attachments || []).map(
              (att, idx) => ({
                index: idx,
                filename:
                  att.filename ||
                  `attachment_${idx + 1}${att.contentType ? '.' + att.contentType.split('/')[1]?.split(';')[0] || '' : ''}`,
                contentType: att.contentType || 'application/octet-stream',
                size: att.size || (att.content ? att.content.length : 0),
                contentId: att.contentId || undefined,
                contentDisposition: att.contentDisposition || undefined,
              }),
            );

            messages.push({
              ...data.message,
              subject: parsedMail.subject || 'No Subject',
              from: extractEmailAddress(parsedMail.from),
              replyTo: extractEmailAddress(parsedMail.replyTo) || undefined,
              to: extractEmailAddress(parsedMail.to),
              cc: extractEmailAddress(parsedMail.cc) || undefined,
              bcc: extractEmailAddress(parsedMail.bcc) || undefined,
              text: parsedMail.text,
              html: typeof parsedMail.html === 'string' ? parsedMail.html : undefined,
              attachments: attachmentsMeta.length > 0 ? attachmentsMeta : undefined,
              messageId: parsedMail.messageId || undefined,
              inReplyTo: parsedMail.inReplyTo || undefined,
              references: Array.isArray(parsedMail.references)
                ? parsedMail.references
                : parsedMail.references
                  ? [parsedMail.references]
                  : undefined,
            } as EmailMessage);
          } catch (error) {
            console.error(`[IMAP] Failed to parse message ${seqno}:`, error);
            // 如果解析失败，返回基本信息和原始内容
            messages.push({
              ...data.message,
              subject: data.headers['subject'] || 'Parse Failed',
              from: data.headers['from'] || '',
              replyTo: data.headers['reply-to'] || undefined,
              to: data.headers['to'] || '',
              cc: data.headers['cc'] || undefined,
              bcc: data.headers['bcc'] || undefined,
              text: data.rawBuffer.toString('utf8').trim(),
            } as EmailMessage);
          }
        }

        console.error(`[IMAP] All messages parsed, returning ${messages.length} messages`);
        resolve(messages);
      });
    });
  }

  async getMessage(uid: number): Promise<EmailMessage> {
    const messages = await this.fetchMessages([uid]);
    if (messages.length === 0) {
      throw new Error(`Message with UID ${uid} not found`);
    }
    return messages[0];
  }

  async fetchMessageAttachments(uid: number, maxBytes?: number): Promise<AttachmentData[]> {
    if (!this.imap) {
      throw new Error('Not connected to IMAP server');
    }

    if (!this.currentBox) {
      await this.openBox('INBOX', true);
    }

    return this.runOperation('FETCH attachments', (imap, resolve, reject, confirmCommand) => {
      const rawChunks: Buffer[] = [];
      const effectiveMaxBytes = maxBytes ?? this.config.maxMessageBytes ?? 25 * 1024 * 1024;
      let rawBytes = 0;
      let tooLarge = false;

      const fetch = imap.fetch([uid], {
        bodies: ['HEADER', 'TEXT'],
        struct: false,
        envelope: false,
        size: true,
        markSeen: false,
      });

      fetch.on('message', msg => {
        msg.on('body', stream => {
          stream.on('data', (chunk: Buffer) => {
            if (rawBytes + chunk.length <= effectiveMaxBytes) {
              rawChunks.push(chunk);
              rawBytes += chunk.length;
            } else {
              tooLarge = true;
            }
          });
          stream.once('error', (error: Error) => {
            reject(new Error(`Fetch attachment body stream failed: ${error.message}`));
          });
        });
      });

      fetch.once('error', error => {
        reject(new Error(`Fetch attachments failed: ${error.message}`));
      });

      fetch.once('end', async () => {
        confirmCommand();
        try {
          if (tooLarge) {
            throw new Error(
              `Message exceeds the configured attachment processing limit of ${effectiveMaxBytes} bytes`,
            );
          }
          const rawBuffer = Buffer.concat(rawChunks);
          const parsedMail = await simpleParser(rawBuffer);

          const attachments: AttachmentData[] = (parsedMail.attachments || []).map((att, idx) => ({
            index: idx,
            filename:
              att.filename ||
              `attachment_${idx + 1}${att.contentType ? '.' + att.contentType.split('/')[1]?.split(';')[0] || '' : ''}`,
            contentType: att.contentType || 'application/octet-stream',
            size: att.size || (att.content ? att.content.length : 0),
            contentId: att.contentId || undefined,
            contentDisposition: att.contentDisposition || undefined,
            content: att.content,
          }));

          resolve(attachments);
        } catch (error) {
          reject(
            new Error(
              `Failed to parse attachments: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        }
      });
    });
  }

  async deleteMessage(uid: number, expectedUidValidity?: number): Promise<void> {
    if (!this.imap) {
      throw new Error('Not connected to IMAP server');
    }
    if (!Number.isSafeInteger(uid) || uid <= 0) {
      throw new Error('Message UID must be a positive integer');
    }

    // A plain EXPUNGE removes every message carrying \Deleted in the selected
    // mailbox. Refuse to delete unless the server supports targeted UID EXPUNGE.
    if (!this.imap.serverSupports('UIDPLUS')) {
      throw new Error('Safe permanent deletion requires IMAP UIDPLUS support');
    }

    const sourceMailbox = this.currentBox || 'INBOX';
    const sourceMailboxInfo = await this.openBox(sourceMailbox, false);
    if (
      expectedUidValidity !== undefined &&
      sourceMailboxInfo.uidvalidity !== expectedUidValidity
    ) {
      throw new Error(
        `Mailbox UIDVALIDITY changed for ${sourceMailbox}: expected ${expectedUidValidity}, got ${sourceMailboxInfo.uidvalidity}. Refresh the message reference before retrying.`,
      );
    }
    await this.assertUIDExists(uid);

    try {
      await this.addDeletedFlag(uid);
    } catch (error) {
      console.error(
        `[IMAP] Failed to mark message ${uid} as deleted:`,
        error instanceof Error ? error.message : String(error),
      );
      await this.resolveDeleteFailure(
        uid,
        sourceMailbox,
        sourceMailboxInfo.uidvalidity,
        'mark-deleted',
        error,
      );
      return;
    }

    console.error(`[IMAP] Message ${uid} marked for deletion`);
    try {
      await this.uidExpunge(uid);
    } catch (error) {
      console.error(
        `[IMAP] Failed to UID EXPUNGE message ${uid}:`,
        error instanceof Error ? error.message : String(error),
      );
      await this.resolveDeleteFailure(
        uid,
        sourceMailbox,
        sourceMailboxInfo.uidvalidity,
        'expunge',
        error,
      );
      return;
    }

    console.error(`[IMAP] Message ${uid} deleted successfully`);
  }

  async moveMessage(uid: number, targetMailbox: string): Promise<MoveMessageResult> {
    if (!this.imap) {
      throw new Error('Not connected to IMAP server');
    }
    if (!this.currentBox) {
      throw new Error('No source mailbox is currently open');
    }
    const sourceMailbox = this.currentBox;
    const sourceUidValidity = this.currentUidValidity;
    if (!Number.isSafeInteger(uid) || uid <= 0) {
      throw new Error('Message UID must be a positive integer');
    }

    const normalizedTarget = targetMailbox.trim();
    if (!normalizedTarget) {
      throw new Error('Target mailbox must be a non-empty string');
    }

    const bothInbox =
      sourceMailbox.toUpperCase() === 'INBOX' && normalizedTarget.toUpperCase() === 'INBOX';
    if (sourceMailbox === normalizedTarget || bothInbox) {
      throw new Error('Target mailbox must be different from the source mailbox');
    }

    // node-imap's legacy fallback uses global EXPUNGE and temporarily changes
    // unrelated \Deleted flags when both capabilities are missing.
    if (!this.imap.serverSupports('MOVE') && !this.imap.serverSupports('UIDPLUS')) {
      throw new Error('Safe message moving requires IMAP MOVE or UIDPLUS support');
    }
    await this.assertUIDExists(uid);

    if (this.imap.serverSupports('MOVE')) {
      type MoveCallback = (error: Error | null, newUIDs?: number | string) => void;
      try {
        return await this.runOperation('UID MOVE', (imap, resolve, reject) => {
          const move = imap.move.bind(imap) as unknown as (
            source: number,
            mailboxName: string,
            callback: MoveCallback,
          ) => void;
          try {
            move(uid, normalizedTarget, (error, newUIDs) => {
              const destinationUid = this.parseDestinationUid(newUIDs);
              if (error && destinationUid !== undefined) {
                reject(
                  new PartialMoveError(
                    `IMAP MOVE partially completed: ${error.message}`,
                    destinationUid,
                  ),
                );
                return;
              }
              if (error) {
                reject(new Error(`IMAP MOVE failed: ${error.message}`));
                return;
              }
              console.error(
                `[IMAP] Moved message ${sourceMailbox}/UID ${uid} to ${normalizedTarget}` +
                  (destinationUid ? `/UID ${destinationUid}` : ''),
              );
              resolve(destinationUid === undefined ? {} : { destinationUid });
            });
          } catch (error) {
            reject(
              new Error(
                `IMAP MOVE failed: ${error instanceof Error ? error.message : String(error)}`,
              ),
            );
          }
        });
      } catch (error) {
        if (error instanceof PartialMoveError) throw error;
        if (error instanceof IMAPOperationAbortedError) {
          throw new PartialMoveError(
            `IMAP MOVE outcome could not be confirmed: ${error.message}`,
            undefined,
            'unknown',
            undefined,
            'unknown',
          );
        }
        throw error;
      }
    }

    // Implement the UIDPLUS fallback explicitly instead of delegating to
    // node-imap's opaque COPY + cleanup sequence. Once COPY succeeds, every
    // cleanup error is a partial move even when the server omits COPYUID.
    let destinationUid: number | undefined;
    try {
      destinationUid = await this.runOperation<number | undefined>(
        'UID COPY',
        (imap, resolve, reject) => {
          type CopyCallback = (error: Error | null, newUIDs?: number | string) => void;
          const copy = imap.copy.bind(imap) as unknown as (
            source: number,
            mailboxName: string,
            callback: CopyCallback,
          ) => void;
          try {
            copy(uid, normalizedTarget, (error, newUIDs) => {
              if (error) {
                reject(new Error(`IMAP COPY failed: ${error.message}`));
                return;
              }
              resolve(this.parseDestinationUid(newUIDs));
            });
          } catch (error) {
            reject(
              new Error(
                `IMAP COPY failed: ${error instanceof Error ? error.message : String(error)}`,
              ),
            );
          }
        },
      );
    } catch (error) {
      if (error instanceof IMAPOperationAbortedError) {
        throw new PartialMoveError(
          `IMAP COPY outcome could not be confirmed: ${error.message}`,
          undefined,
          'unknown',
          undefined,
          'unknown',
        );
      }
      throw error;
    }

    try {
      await this.addDeletedFlag(uid);
    } catch (error) {
      const source = await this.recoverMoveSourceState(uid, sourceMailbox, sourceUidValidity);
      if (source.state === 'absent') {
        console.error(
          `[IMAP] Source UID ${uid} disappeared after COPY; treating the requested move end state as complete`,
        );
        return destinationUid === undefined ? {} : { destinationUid };
      }
      throw new PartialMoveError(
        `IMAP MOVE partially completed: destination copy was created, but the source could not be marked deleted: ${error instanceof Error ? error.message : String(error)}${source.diagnostic ? `; source verification: ${source.diagnostic}` : ''}`,
        destinationUid,
        source.state,
        source.deletedFlag,
      );
    }

    try {
      await this.uidExpunge(uid);
    } catch (error) {
      const source = await this.recoverMoveSourceState(uid, sourceMailbox, sourceUidValidity);
      if (source.state === 'absent') {
        console.error(
          `[IMAP] Source UID ${uid} is absent after an EXPUNGE error; treating the requested move end state as complete`,
        );
        return destinationUid === undefined ? {} : { destinationUid };
      }
      throw new PartialMoveError(
        `IMAP MOVE partially completed: destination copy was created, but source cleanup failed: ${error instanceof Error ? error.message : String(error)}${source.diagnostic ? `; source verification: ${source.diagnostic}` : ''}`,
        destinationUid,
        source.state,
        source.deletedFlag,
      );
    }

    console.error(
      `[IMAP] Moved message ${sourceMailbox}/UID ${uid} to ${normalizedTarget} using UIDPLUS fallback` +
        (destinationUid ? `/UID ${destinationUid}` : ''),
    );
    return destinationUid === undefined ? {} : { destinationUid };
  }

  private parseDestinationUid(value?: number | string): number | undefined {
    const numericUid = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
    return typeof numericUid === 'number' && Number.isSafeInteger(numericUid) && numericUid > 0
      ? numericUid
      : undefined;
  }

  private async addDeletedFlag(uid: number): Promise<void> {
    await this.runOperation<void>('UID STORE +\\Deleted', (imap, resolve, reject) => {
      imap.addFlags(uid, ['\\Deleted'], error => (error ? reject(error) : resolve()));
    });
  }

  private async removeDeletedFlag(uid: number): Promise<void> {
    await this.runOperation<void>('UID STORE -\\Deleted', (imap, resolve, reject) => {
      imap.delFlags(uid, ['\\Deleted'], error => (error ? reject(error) : resolve()));
    });
  }

  private async uidExpunge(uid: number): Promise<void> {
    await this.runOperation<void>('UID EXPUNGE', (imap, resolve, reject) => {
      imap.expunge(uid, error => (error ? reject(error) : resolve()));
    });
  }

  private async inspectUIDState(
    uid: number,
    mailbox: string,
    expectedUidValidity: number | null,
  ): Promise<UIDStateInspection> {
    try {
      const mailboxInfo = await this.openBox(mailbox, true);
      if (expectedUidValidity !== null && mailboxInfo.uidvalidity !== expectedUidValidity) {
        return {
          state: 'unknown',
          diagnostic: `UIDVALIDITY changed from ${expectedUidValidity} to ${mailboxInfo.uidvalidity}`,
        };
      }
      const matches = await this.search([['UID', uid]]);
      if (!matches.includes(uid)) return { state: 'absent' };
      const deletedMatches = await this.search(['DELETED', ['UID', uid]]);
      const verifiedMatches = await this.search([['UID', uid]]);
      if (!verifiedMatches.includes(uid)) return { state: 'absent' };
      return { state: 'present', deletedFlag: deletedMatches.includes(uid) };
    } catch (error) {
      return {
        state: 'unknown',
        diagnostic: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async recoverMoveSourceState(
    uid: number,
    mailbox: string,
    expectedUidValidity: number | null,
  ): Promise<UIDStateInspection> {
    let inspection = await this.inspectUIDState(uid, mailbox, expectedUidValidity);
    if (inspection.state !== 'present' || inspection.deletedFlag !== true) return inspection;

    try {
      const mailboxInfo = await this.openBox(mailbox, false);
      if (expectedUidValidity !== null && mailboxInfo.uidvalidity !== expectedUidValidity) {
        return {
          state: 'unknown',
          diagnostic: `UIDVALIDITY changed from ${expectedUidValidity} to ${mailboxInfo.uidvalidity} before rollback`,
        };
      }
      await this.removeDeletedFlag(uid);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const verified = await this.inspectUIDState(uid, mailbox, expectedUidValidity);
      return {
        ...verified,
        diagnostic: verified.diagnostic
          ? `rollback failed: ${detail}; ${verified.diagnostic}`
          : `rollback failed: ${detail}`,
      };
    }

    inspection = await this.inspectUIDState(uid, mailbox, expectedUidValidity);
    return inspection.diagnostic
      ? inspection
      : {
          ...inspection,
          diagnostic: 'the \\Deleted flag was rolled back before reporting the partial move',
        };
  }

  private async resolveDeleteFailure(
    uid: number,
    mailbox: string,
    expectedUidValidity: number,
    stage: 'mark-deleted' | 'expunge',
    originalError: unknown,
  ): Promise<void> {
    const source = await this.recoverMoveSourceState(uid, mailbox, expectedUidValidity);
    if (source.state === 'absent') {
      const article = stage === 'expunge' ? 'an' : 'a';
      console.error(
        `[IMAP] UID ${uid} is absent after ${article} ${stage} error; the requested deletion end state was reached`,
      );
      return;
    }

    const outcome = source.state === 'present' ? 'not-deleted' : 'unknown';
    const detail = originalError instanceof Error ? originalError.message : String(originalError);
    throw new DeleteMessageError(
      `Deletion failed during ${stage}: ${detail}${source.diagnostic ? `; source verification: ${source.diagnostic}` : ''}`,
      stage,
      outcome,
      source.state,
      source.deletedFlag,
    );
  }

  private async assertUIDExists(uid: number): Promise<void> {
    await this.assertUIDsExist([uid]);
  }

  async assertUIDsExist(uids: number[]): Promise<void> {
    if (
      !Array.isArray(uids) ||
      uids.length === 0 ||
      uids.some(uid => !Number.isSafeInteger(uid) || uid <= 0)
    ) {
      throw new Error('Message UIDs must be a non-empty array of positive integers');
    }
    const matches = await this.search([['UID', ...uids]]);
    const matched = new Set(matches);
    const missing = uids.filter(uid => !matched.has(uid));
    if (missing.length === 1) {
      throw new Error(
        `Message with UID ${missing[0]} was not found in mailbox ${this.currentBox || 'INBOX'}`,
      );
    }
    if (missing.length > 1) {
      throw new Error(
        `Messages with UIDs ${missing.join(', ')} were not found in mailbox ${this.currentBox || 'INBOX'}`,
      );
    }
  }

  private parseHeaders(headerText: string): Record<string, string> {
    const headers: Record<string, string> = {};
    const lines = headerText.split('\r\n');
    let currentHeader = '';
    let currentValue = '';

    for (const line of lines) {
      if (line.match(/^\s/) && currentHeader) {
        // 继续上一个头部
        currentValue += ' ' + line.trim();
      } else {
        // 保存上一个头部
        if (currentHeader) {
          headers[currentHeader.toLowerCase()] = currentValue.trim();
        }

        // 开始新的头部
        const colonIndex = line.indexOf(':');
        if (colonIndex > -1) {
          currentHeader = line.substring(0, colonIndex).trim();
          currentValue = line.substring(colonIndex + 1).trim();
        } else {
          currentHeader = '';
          currentValue = '';
        }
      }
    }

    // 保存最后一个头部
    if (currentHeader) {
      headers[currentHeader.toLowerCase()] = currentValue.trim();
    }

    return headers;
  }

  private runOperation<T>(
    operation: string,
    execute: (
      imap: Imap,
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: unknown) => void,
      confirmCommand: () => void,
    ) => void,
  ): Promise<T> {
    const imap = this.imap;
    if (!imap) {
      return Promise.reject(new Error('Not connected to IMAP server'));
    }

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const listenForTermination =
        typeof imap.once === 'function' && typeof imap.removeListener === 'function';
      const cleanup = () => {
        if (!listenForTermination) return;
        imap.removeListener('error', onError);
        imap.removeListener('end', onEnd);
        imap.removeListener('close', onClose);
      };
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback();
      };
      const succeed = (value: T | PromiseLike<T>) => settle(() => resolve(value));
      const fail = (reason?: unknown) => settle(() => reject(reason));
      const onError = (error: Error) =>
        fail(new IMAPOperationAbortedError(operation, 'error', `failed: ${error.message}`));
      const onEnd = () =>
        fail(
          new IMAPOperationAbortedError(
            operation,
            'end',
            'ended before the server confirmed the command',
          ),
        );
      const onClose = (hadError: boolean) =>
        fail(
          new IMAPOperationAbortedError(
            operation,
            'close',
            `closed${hadError ? ' after an error' : ''} before the server confirmed the command`,
          ),
        );

      if (listenForTermination) {
        imap.once('error', onError);
        imap.once('end', onEnd);
        imap.once('close', onClose);
      }
      try {
        execute(imap, succeed, fail, cleanup);
      } catch (error) {
        fail(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (!this.imap) {
      return; // 已经没有连接对象
    }

    if (!this.connected) {
      // A close/error event may have cleared wrapper state before the socket
      // was fully released. Destroy the underlying connection defensively.
      try {
        this.imap.destroy();
      } catch {
        // The socket may already be closed.
      }
      this.imap = null;
      this.authenticated = false;
      this.currentBox = null;
      this.currentUidValidity = null;
      return;
    }

    const imap = this.imap;
    return new Promise(resolve => {
      let settled = false;
      const finish = (message: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        console.error(message);
        this.connected = false;
        this.authenticated = false;
        this.currentBox = null;
        this.currentUidValidity = null;
        this.imap = null;
        resolve();
      };
      const timeout = setTimeout(() => {
        try {
          imap.destroy();
        } catch {
          // Best-effort forced cleanup.
        }
        finish('[IMAP] Disconnect timeout, forced socket cleanup');
      }, 5000); // 5秒超时

      imap.once('end', () => finish('[IMAP] Disconnected'));
      imap.once('close', () => finish('[IMAP] Connection closed during disconnect'));

      imap.once('error', (error: Error) => finish(`[IMAP] Disconnect error: ${error.message}`));

      try {
        imap.end();
      } catch (error) {
        finish(
          `[IMAP] Error calling end(): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  isConnected(): boolean {
    return this.connected && this.authenticated;
  }

  getCurrentBox(): string | null {
    return this.currentBox;
  }

  getCurrentUidValidity(): number | null {
    return this.currentUidValidity;
  }

  getCurrentUsername(): string | null {
    return this.config?.username || null;
  }

  // 保存邮件到指定文件夹（用于已发送邮件）
  async saveMessageToFolder(messageContent: string | Buffer, folderName: string): Promise<void> {
    if (!this.connected) {
      throw new Error('IMAP client is not connected');
    }

    // Some IMAP servers reject APPEND while any mailbox is selected read-only,
    // even when APPEND names a different destination mailbox. Select the sent
    // mailbox read-write first so the operation works with those servers.
    try {
      await this.openBox(folderName, false);
    } catch (error) {
      throw new SentAppendError(
        `Could not select sent mailbox ${folderName} read-write: ${error instanceof Error ? error.message : String(error)}`,
        'select',
        'not-appended',
      );
    }

    try {
      await this.runOperation<void>(`APPEND ${folderName}`, (imap, resolve, reject) => {
        imap.append(
          messageContent,
          {
            mailbox: folderName,
            flags: ['\\Seen'],
            // Let the IMAP server assign INTERNALDATE. imap@0.8.19 validates
            // this optional field with util.isDate, which was removed in
            // Node.js 23 and breaks APPEND on newer runtimes.
          },
          err => {
            if (err) {
              console.error(`[IMAP] Failed to save message to ${folderName}:`, err.message);
              const responseType = String(
                (err as Error & { type?: unknown }).type || '',
              ).toLowerCase();
              const outcome =
                responseType === 'no' || responseType === 'bad' ? 'not-appended' : 'unknown';
              reject(
                new SentAppendError(
                  `Failed to save message to ${folderName}: ${err.message}`,
                  'append',
                  outcome,
                ),
              );
              return;
            }
            console.error(`[IMAP] Message successfully saved to ${folderName}`);
            resolve();
          },
        );
      });
    } catch (error) {
      if (error instanceof SentAppendError) throw error;
      throw new SentAppendError(
        `Failed to save message to ${folderName}: ${error instanceof Error ? error.message : String(error)}`,
        'append',
        'unknown',
      );
    }
  }
}

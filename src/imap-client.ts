import Imap from 'imap';
import { EventEmitter } from 'events';

export interface IMAPConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  tls?: boolean;
  connTimeout?: number;
  authTimeout?: number;
  keepalive?: boolean;
}

export interface EmailMessage {
  uid: number;
  id?: number;
  flags: string[];
  date: Date;
  size: number;
  headers: Record<string, string>;
  body: string;
  raw: string;
  subject?: string;
  from?: string;
  to?: string;
  cc?: string;
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

export class IMAPClient extends EventEmitter {
  private imap: Imap | null = null;
  private config: IMAPConfig;
  private connected = false;
  private authenticated = false;
  private currentBox: string | null = null;

  constructor(config: IMAPConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.error(`[IMAP] Connecting to ${this.config.host}:${this.config.port} (TLS: ${this.config.tls})`);
      
      const imapConfig: Imap.Config = {
        user: this.config.username,
        password: this.config.password,
        host: this.config.host,
        port: this.config.port,
        tls: this.config.tls || false,
        connTimeout: this.config.connTimeout || 10000,
        authTimeout: this.config.authTimeout || 5000,
        keepalive: this.config.keepalive !== false
      };

      this.imap = new Imap(imapConfig);

      this.imap.once('ready', async () => {
        console.error('[IMAP] Connection ready');
        this.connected = true;
        this.authenticated = true;
        
        // 自动打开收件箱
        try {
          await this.openBox('INBOX', true); // 只读方式打开
          console.error('[IMAP] Auto-opened INBOX');
        } catch (error) {
          console.error('[IMAP] Failed to auto-open INBOX:', error instanceof Error ? error.message : String(error));
        }
        
        resolve();
      });

      this.imap.once('error', (error: Error) => {
        console.error('[IMAP] Connection error:', error.message);
        reject(new Error(`IMAP connection failed: ${error.message}`));
      });

      this.imap.once('end', () => {
        console.error('[IMAP] Connection ended');
        this.connected = false;
        this.authenticated = false;
        this.currentBox = null;
      });

      this.imap.connect();
    });
  }

  async openBox(boxName: string = 'INBOX', readOnly: boolean = false): Promise<MailboxInfo> {
    if (!this.imap || !this.authenticated) {
      throw new Error('Not connected or authenticated');
    }

    return new Promise((resolve, reject) => {
      this.imap!.openBox(boxName, readOnly, (error, box) => {
        if (error) {
          console.error(`[IMAP] Failed to open box ${boxName}:`, error.message);
          reject(new Error(`Failed to open mailbox: ${error.message}`));
          return;
        }

        console.error(`[IMAP] Opened box ${boxName}`);
        this.currentBox = boxName;
        
        const mailboxInfo: MailboxInfo = {
          name: boxName,
          messages: {
            total: box.messages.total,
            new: box.messages.new,
            unseen: box.messages.unseen
          },
          permFlags: box.permFlags,
          uidvalidity: box.uidvalidity,
          uidnext: box.uidnext
        };

        resolve(mailboxInfo);
      });
    });
  }

  async getBoxes(): Promise<any> {
    if (!this.imap || !this.authenticated) {
      throw new Error('Not connected or authenticated');
    }

    return new Promise((resolve, reject) => {
      this.imap!.getBoxes((error, boxes) => {
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

    return new Promise((resolve, reject) => {
      this.imap!.search([criteria], (error, results) => {
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

  async fetchMessages(uids: number[], options: any = {}): Promise<EmailMessage[]> {
    if (!this.imap) {
      throw new Error('Not connected to IMAP server');
    }

    // 如果没有打开邮箱，自动打开收件箱
    if (!this.currentBox) {
      await this.openBox('INBOX', true);
    }

    const fetchOptions = {
      bodies: options.bodies || ['HEADER', 'TEXT'],
      struct: options.struct !== false,
      envelope: options.envelope !== false,
      markSeen: options.markSeen || false,
      ...options
    };

    return new Promise((resolve, reject) => {
      const messages: EmailMessage[] = [];
      
      if (uids.length === 0) {
        resolve(messages);
        return;
      }

      const fetch = this.imap!.fetch(uids, fetchOptions);

      fetch.on('message', (msg, seqno) => {
        console.error(`[IMAP] Processing message ${seqno}`);
        
        let headers: Record<string, string> = {};
        let body = '';
        let raw = '';
        const message: Partial<EmailMessage> = {
          uid: 0,
          id: seqno,
          flags: [],
          date: new Date(),
          size: 0
        };

        msg.on('body', (stream, info) => {
          let buffer = '';
          stream.on('data', (chunk) => {
            buffer += chunk.toString();
          });
          
          stream.once('end', () => {
            if (info.which === 'HEADER') {
              headers = this.parseHeaders(buffer);
              message.subject = headers['subject'] || '';
              message.from = headers['from'] || '';
              message.to = headers['to'] || '';
              message.cc = headers['cc'] || '';
            } else if (info.which === 'TEXT') {
              body = buffer;
            }
            raw += buffer;
          });
        });

        msg.once('attributes', (attrs) => {
          message.uid = attrs.uid;
          message.flags = attrs.flags || [];
          message.date = attrs.date || new Date();
          message.size = attrs.size || raw.length;
        });

        msg.once('end', () => {
          console.error(`[IMAP] Message ${seqno} processed`);
          messages.push({
            ...message,
            headers,
            body: body.trim(),
            raw
          } as EmailMessage);
        });
      });

      fetch.once('error', (error) => {
        console.error('[IMAP] Fetch error:', error.message);
        reject(new Error(`Fetch failed: ${error.message}`));
      });

      fetch.once('end', () => {
        console.error(`[IMAP] Fetch completed, ${messages.length} messages processed`);
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

  async getMessagesBySeq(seqNumbers: number[]): Promise<EmailMessage[]> {
    if (!this.imap) {
      throw new Error('Not connected to IMAP server');
    }

    // 如果没有打开邮箱，自动打开收件箱
    if (!this.currentBox) {
      await this.openBox('INBOX', true);
    }

    // 对于序列号，我们需要先搜索获取对应的UID
    const allUids = await this.search(['ALL']);
    const targetUids = seqNumbers.map(seq => allUids[seq - 1]).filter(uid => uid !== undefined);
    
    return this.fetchMessages(targetUids);
  }

  async deleteMessage(uid: number): Promise<void> {
    if (!this.imap) {
      throw new Error('Not connected to IMAP server');
    }

    // 如果没有打开邮箱，自动打开收件箱
    if (!this.currentBox) {
      await this.openBox('INBOX', false); // 需要写权限来删除
    }

    return new Promise((resolve, reject) => {
      this.imap!.addFlags(uid, ['\\Deleted'], (error) => {
        if (error) {
          console.error(`[IMAP] Failed to mark message ${uid} as deleted:`, error.message);
          reject(new Error(`Failed to delete message: ${error.message}`));
          return;
        }

        console.error(`[IMAP] Message ${uid} marked for deletion`);
        
        // 执行 expunge 来真正删除消息
        this.imap!.expunge((expungeError) => {
          if (expungeError) {
            console.error('[IMAP] Failed to expunge:', expungeError.message);
            reject(new Error(`Failed to expunge deleted messages: ${expungeError.message}`));
            return;
          }
          
          console.error(`[IMAP] Message ${uid} deleted successfully`);
          resolve();
        });
      });
    });
  }

  async getMessageCount(): Promise<number> {
    if (!this.currentBox) {
      await this.openBox('INBOX', true);
    }
    
    const uids = await this.search(['ALL']);
    return uids.length;
  }

  async getUnseenMessages(): Promise<EmailMessage[]> {
    const unseenUids = await this.search(['UNSEEN']);
    return this.fetchMessages(unseenUids);
  }

  async getRecentMessages(): Promise<EmailMessage[]> {
    const recentUids = await this.search(['RECENT']);
    return this.fetchMessages(recentUids);
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

  async closeBox(): Promise<void> {
    if (!this.imap || !this.currentBox) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.imap!.closeBox((error) => {
        if (error) {
          console.error('[IMAP] Failed to close box:', error.message);
          reject(new Error(`Failed to close mailbox: ${error.message}`));
          return;
        }
        
        console.error(`[IMAP] Closed box ${this.currentBox}`);
        this.currentBox = null;
        resolve();
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.imap && this.connected) {
      return new Promise((resolve) => {
        this.imap!.once('end', () => {
          console.error('[IMAP] Disconnected');
          this.connected = false;
          this.authenticated = false;
          this.currentBox = null;
          resolve();
        });
        
        this.imap!.end();
      });
    }
  }

  isConnected(): boolean {
    return this.connected && this.authenticated;
  }

  getCurrentBox(): string | null {
    return this.currentBox;
  }
}
import Imap from 'imap';
import { EventEmitter } from 'events';
import { simpleParser, ParsedMail } from 'mailparser';

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
  date: string; // 改为字符串格式，使用中国东八区时间
  size: number;
  // 使用解析后的内容作为主要字段
  subject: string;
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  text?: string;
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
      const pendingMessages: Map<number, {
        message: Partial<EmailMessage>;
        headers: Record<string, string>;
        body: string;
        raw: string;
      }> = new Map();
      
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
          date: '',
          size: 0
        };

        msg.on('body', (stream, info) => {
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => {
            chunks.push(chunk);
          });
          
          stream.once('end', () => {
            const buffer = Buffer.concat(chunks);
            const bufferString = buffer.toString();
            
            if (info.which === 'HEADER') {
              headers = this.parseHeaders(bufferString);
            } else if (info.which === 'TEXT') {
              body = bufferString;
            }
            raw += bufferString;
          });
        });

        msg.once('attributes', (attrs) => {
          message.uid = attrs.uid;
          message.flags = attrs.flags || [];
          // 转换为中国东八区时间格式
          const date = attrs.date || new Date();
          message.date = date.toLocaleString('zh-CN', { 
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
          message.size = attrs.size || 0;
        });

        msg.once('end', () => {
          console.error(`[IMAP] Message ${seqno} processed, preparing for parse`);
          pendingMessages.set(seqno, {
            message,
            headers,
            body,
            raw
          });
        });
      });

      fetch.once('error', (error) => {
        console.error('[IMAP] Fetch error:', error.message);
        reject(new Error(`Fetch failed: ${error.message}`));
      });

      fetch.once('end', async () => {
        console.error(`[IMAP] Fetch completed, parsing ${pendingMessages.size} messages`);
        
        // 解析所有待处理的消息
        for (const [seqno, data] of pendingMessages) {
          try {
            // 使用 mailparser 解析完整的邮件
            const parsedMail = await simpleParser(data.raw);
            
            // 提取纯邮箱地址的辅助函数
            const extractEmailAddress = (addressObj: any): string => {
              if (!addressObj) return '';
              
              // 处理数组情况
              if (Array.isArray(addressObj)) {
                return addressObj.map(addr => extractSingleEmail(addr)).filter(Boolean).join(', ');
              }
              
              return extractSingleEmail(addressObj);
            };
            
            // 从单个地址对象中提取邮箱地址
            const extractSingleEmail = (addr: any): string => {
              if (!addr) return '';
              
              // 如果是字符串，尝试从中提取邮箱
              if (typeof addr === 'string') {
                // 匹配 "name" <email@domain.com> 或 email@domain.com 格式
                const emailMatch = addr.match(/<([^>]+)>/) || addr.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
                return emailMatch ? emailMatch[1] : addr;
              }
              
              // 如果是对象，优先取 address 属性
              if (addr && typeof addr === 'object') {
                if (addr.address) return addr.address;
                if (addr.text) {
                  // 从 text 中提取邮箱
                  const emailMatch = addr.text.match(/<([^>]+)>/) || addr.text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
                  return emailMatch ? emailMatch[1] : addr.text;
                }
              }
              
              return '';
            };
            
            messages.push({
              ...data.message,
              subject: parsedMail.subject || 'No Subject',
              from: extractEmailAddress(parsedMail.from),
              to: extractEmailAddress(parsedMail.to),
              cc: extractEmailAddress(parsedMail.cc) || undefined,
              bcc: extractEmailAddress(parsedMail.bcc) || undefined,
              text: parsedMail.text
            } as EmailMessage);
          } catch (error) {
            console.error(`[IMAP] Failed to parse message ${seqno}:`, error);
            // 如果解析失败，返回基本信息和原始内容
            messages.push({
              ...data.message,
              subject: data.headers['subject'] || 'Parse Failed',
              from: data.headers['from'] || '',
              to: data.headers['to'] || '',
              cc: data.headers['cc'] || undefined,
              bcc: data.headers['bcc'] || undefined,
              text: data.body.trim()
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
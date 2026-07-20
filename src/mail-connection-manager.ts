import { EMAIL_CONFIG } from './config.js';
import { IMAPClient, IMAPConfig } from './imap-client.js';
import { SMTPClient, SMTPConfig } from './smtp-client.js';

const COMMON_SENT_MAILBOX_NAMES = [
  'INBOX.Sent',
  'Sent',
  'SENT',
  'Sent Items',
  'Sent Messages',
  '已发送',
] as const;

export class MailConnectionManager {
  private imapClient: IMAPClient | null = null;
  private smtpClient: SMTPClient | null = null;
  private isInitializingIMAP = false;
  private isInitializingSMTP = false;
  private sentMailboxName: string | null | undefined;

  get imap(): IMAPClient {
    if (!this.imapClient) throw new Error('IMAP client is not connected');
    return this.imapClient;
  }

  get smtp(): SMTPClient {
    if (!this.smtpClient) throw new Error('SMTP client is not connected');
    return this.smtpClient;
  }

  async ensure(requireIMAP = false, requireSMTP = false): Promise<void> {
    if (requireIMAP) await this.ensureIMAP();
    if (requireSMTP) await this.ensureSMTP();
  }

  async ensureIMAP(): Promise<void> {
    if (this.imapClient?.isConnected()) return;
    if (this.isInitializingIMAP) {
      await this.waitForInitialization('IMAP', () => this.isInitializingIMAP);
      if (!this.imapClient?.isConnected()) throw new Error('IMAP connection initialization failed');
      return;
    }

    this.isInitializingIMAP = true;
    try {
      const config: IMAPConfig = EMAIL_CONFIG.IMAP;
      console.error(`[IMAP] Auto-connecting to ${config.host}:${config.port}`);
      const client = new IMAPClient(config);
      await client.connect();
      this.imapClient = client;
      this.sentMailboxName = undefined;
      console.error('[IMAP] Auto-connection successful');
    } catch (error) {
      this.imapClient = null;
      throw error;
    } finally {
      this.isInitializingIMAP = false;
    }
  }

  async ensureSMTP(): Promise<void> {
    if (this.smtpClient?.isConnected()) return;
    if (this.isInitializingSMTP) {
      await this.waitForInitialization('SMTP', () => this.isInitializingSMTP);
      if (!this.smtpClient?.isConnected()) throw new Error('SMTP connection initialization failed');
      return;
    }

    this.isInitializingSMTP = true;
    try {
      const config: SMTPConfig = EMAIL_CONFIG.SMTP;
      console.error(`[SMTP] Auto-connecting to ${config.host}:${config.port}`);
      const client = new SMTPClient(config);
      await client.connect();
      this.smtpClient = client;
      console.error('[SMTP] Auto-connection successful');
    } catch (error) {
      this.smtpClient = null;
      throw error;
    } finally {
      this.isInitializingSMTP = false;
    }
  }

  async findSentMailbox(): Promise<string | null> {
    if (this.sentMailboxName !== undefined) return this.sentMailboxName;

    try {
      const boxes = await this.imap.getBoxes();
      const byAttribute = this.findMailboxBySentAttribute(boxes);
      if (byAttribute) {
        console.error(`[IMAP] Sent mailbox found via \\Sent attribute: ${byAttribute}`);
        this.sentMailboxName = byAttribute;
        return byAttribute;
      }
    } catch (error) {
      console.error('[IMAP] getBoxes failed during sent mailbox detection:', error instanceof Error ? error.message : String(error));
    }

    for (const name of COMMON_SENT_MAILBOX_NAMES) {
      try {
        await this.imap.openBox(name, true);
        console.error(`[IMAP] Sent mailbox found by name fallback: ${name}`);
        this.sentMailboxName = name;
        return name;
      } catch {
        // Try the next conventional mailbox name.
      }
    }

    console.error('[IMAP] No sent mailbox found');
    this.sentMailboxName = null;
    return null;
  }

  getStatus(): object {
    const imapConnected = this.imapClient?.isConnected() ?? false;
    const currentBox = this.imapClient?.getCurrentBox() ?? null;
    const smtpConnected = this.smtpClient?.isConnected() ?? false;

    return {
      timestamp: new Date().toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      connections: {
        imap: {
          connected: imapConnected,
          currentBox,
          serverInfo: `${EMAIL_CONFIG.IMAP.host}:${EMAIL_CONFIG.IMAP.port}`,
          username: EMAIL_CONFIG.IMAP.username,
          tls: EMAIL_CONFIG.IMAP.tls,
          status: imapConnected
            ? currentBox ? `Connected - Current mailbox: ${currentBox}` : 'Connected - No mailbox open'
            : this.imapClient ? 'Connection lost or failed' : 'Not connected',
        },
        smtp: {
          connected: smtpConnected,
          serverInfo: `${EMAIL_CONFIG.SMTP.host}:${EMAIL_CONFIG.SMTP.port}`,
          username: EMAIL_CONFIG.SMTP.username,
          secure: EMAIL_CONFIG.SMTP.secure,
          status: smtpConnected
            ? 'Configured and verified'
            : this.smtpClient ? 'Connection lost or failed' : 'Not connected',
        },
      },
    };
  }

  async connectAll(): Promise<string[]> {
    const results: string[] = [];
    try {
      if (this.imapClient?.isConnected()) {
        if (this.imapClient.getCurrentUsername() === EMAIL_CONFIG.IMAP.username) {
          results.push('ℹ️ IMAP: Already connected');
        } else {
          await this.disconnectIMAP();
          await this.ensureIMAP();
          results.push('✅ IMAP: Reconnected with correct user');
        }
      } else {
        await this.ensureIMAP();
        results.push('✅ IMAP: Connected successfully');
      }
    } catch (error) {
      results.push(`❌ IMAP: Connection failed - ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      if (this.smtpClient?.isConnected()) {
        if (this.smtpClient.getCurrentUsername() === EMAIL_CONFIG.SMTP.username) {
          results.push('ℹ️ SMTP: Already connected');
        } else {
          await this.disconnectSMTP();
          await this.ensureSMTP();
          results.push('✅ SMTP: Reconnected with correct user');
        }
      } else {
        await this.ensureSMTP();
        results.push('✅ SMTP: Connected successfully');
      }
    } catch (error) {
      results.push(`❌ SMTP: Connection failed - ${error instanceof Error ? error.message : String(error)}`);
    }
    return results;
  }

  async disconnectAll(): Promise<string[]> {
    const results: string[] = [];
    if (this.imapClient) {
      try {
        await this.disconnectIMAP();
        results.push('✅ IMAP: Disconnected successfully');
      } catch (error) {
        results.push(`❌ IMAP: Disconnect failed - ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      results.push('ℹ️ IMAP: Not connected');
    }

    if (this.smtpClient) {
      try {
        await this.disconnectSMTP();
        results.push('✅ SMTP: Disconnected successfully');
      } catch (error) {
        results.push(`❌ SMTP: Disconnect failed - ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      results.push('ℹ️ SMTP: Not connected');
    }
    return results;
  }

  private async disconnectIMAP(): Promise<void> {
    const client = this.imapClient;
    this.imapClient = null;
    this.sentMailboxName = undefined;
    if (client) await client.disconnect();
  }

  private async disconnectSMTP(): Promise<void> {
    const client = this.smtpClient;
    this.smtpClient = null;
    if (client) await client.disconnect();
  }

  private findMailboxBySentAttribute(nodes: any, prefix = ''): string | null {
    for (const [name, box] of Object.entries(nodes) as [string, any][]) {
      const fullPath = prefix ? `${prefix}${box.delimiter || '.'}${name}` : name;
      if (Array.isArray(box.attribs) && box.attribs.includes('\\Sent')) return fullPath;
      if (box.children) {
        const found = this.findMailboxBySentAttribute(box.children, fullPath);
        if (found) return found;
      }
    }
    return null;
  }

  private async waitForInitialization(protocol: string, isInitializing: () => boolean): Promise<void> {
    const deadline = Date.now() + 30_000;
    while (isInitializing()) {
      if (Date.now() > deadline) throw new Error(`${protocol} connection initialization timed out`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

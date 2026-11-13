import nodemailer, {
  type SendMailOptions,
  type SMTPSentMessageInfo,
  type SMTPTransportOptions,
  type Transporter,
} from 'nodemailer';
import addressparser from 'nodemailer/lib/addressparser';

export interface SMTPConfig {
  host: string;
  port: number;
  secure?: boolean;
  username: string;
  password: string;
  fromAddress?: string;
  requireTLS?: boolean;
  tlsRejectUnauthorized?: boolean;
}

export interface EmailOptions {
  from?: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string | string[];
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

export interface EmailResult {
  messageId: string;
  response: string;
  accepted: string[];
  rejected: string[];
}

/** Reject mailbox characters that Nodemailer would silently rewrite before SMTP delivery. */
function assertSmtpAddressList(value: string): void {
  if (
    /[<>]/.test(value) &&
    addressparser(value, { flatten: true }).some(({ address }) => /[<>]/.test(address))
  ) {
    throw new Error('SMTP envelope addresses cannot contain literal angle brackets');
  }
}

export class SMTPClient {
  private transporter: Transporter<SMTPSentMessageInfo, SMTPTransportOptions> | null = null;
  private config: SMTPConfig;

  constructor(config: SMTPConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure || false,
      requireTLS: this.config.requireTLS === true,
      tls: {
        rejectUnauthorized: this.config.tlsRejectUnauthorized !== false,
        servername: this.config.host,
      },
      auth: {
        user: this.config.username,
        pass: this.config.password,
      },
    });

    await this.verifyConnection();
  }

  async verifyConnection(): Promise<void> {
    if (!this.transporter) {
      throw new Error('SMTP client not connected');
    }

    try {
      await this.transporter.verify();
    } catch (error) {
      try {
        this.transporter?.close();
      } finally {
        this.transporter = null;
      }
      throw new Error(
        `SMTP connection failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  /** Keep standalone quoted addr-specs structured so SMTP envelope parsing cannot unquote them. */
  private prepareAddressList(value: string | string[] | undefined): SendMailOptions['to'] {
    if (value === undefined) {
      return undefined;
    }
    return (Array.isArray(value) ? value : [value]).map(address => {
      assertSmtpAddressList(address);
      return /^"(?:[^"\\]|\\.)*"@[^\s<>@]+$/.test(address) ? { name: '', address } : address;
    });
  }

  /** Reuse identical address and MIME options for actual delivery and the saved Sent copy. */
  private createMailOptions(options: EmailOptions): SendMailOptions {
    const from = options.from || this.config.fromAddress || this.config.username;
    assertSmtpAddressList(from);
    return {
      from,
      to: this.prepareAddressList(options.to),
      cc: this.prepareAddressList(options.cc),
      bcc: this.prepareAddressList(options.bcc),
      subject: options.subject,
      text: options.text,
      html: options.html,
      messageId: options.messageId,
      inReplyTo: options.inReplyTo,
      references: options.references,
      attachments: options.attachments,
    };
  }

  async sendMail(options: EmailOptions): Promise<EmailResult> {
    if (!this.transporter) {
      throw new Error('SMTP client not connected');
    }

    try {
      const result = await this.transporter.sendMail(this.createMailOptions(options));

      return {
        messageId: result.messageId,
        response: result.response,
        accepted: result.accepted || [],
        rejected: result.rejected || [],
      };
    } catch (error) {
      throw new Error(
        `Failed to send email: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  async buildRawMessage(options: EmailOptions, messageId?: string): Promise<Buffer> {
    const streamTransport = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'windows',
    });

    try {
      const result = await streamTransport.sendMail({
        ...this.createMailOptions(options),
        messageId: messageId || options.messageId,
      });
      if (!Buffer.isBuffer(result.message)) {
        throw new Error('Nodemailer did not return a buffered raw message');
      }
      return result.message;
    } finally {
      streamTransport.close();
    }
  }

  getCurrentUsername(): string | null {
    return this.config?.username || null;
  }

  isConnected(): boolean {
    return this.transporter !== null;
  }

  async disconnect(): Promise<void> {
    if (this.transporter) {
      try {
        this.transporter.close();
        console.error('[SMTP] Disconnected successfully');
      } catch (error) {
        console.error(
          '[SMTP] Error during disconnect:',
          error instanceof Error ? error.message : String(error),
        );
        // 即使关闭时出错，我们仍然要清理引用
      } finally {
        this.transporter = null;
      }
    }
  }
}

import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';

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

export class SMTPClient {
  private transporter: Transporter | null = null;
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

  private createMailOptions(options: EmailOptions): SendMailOptions {
    return {
      from: options.from || this.config.fromAddress || this.config.username,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
      bcc: options.bcc
        ? Array.isArray(options.bcc)
          ? options.bcc.join(', ')
          : options.bcc
        : undefined,
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
    } as any);

    try {
      const result = (await streamTransport.sendMail({
        ...this.createMailOptions(options),
        messageId: messageId || options.messageId,
      })) as any;
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

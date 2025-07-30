import nodemailer, { Transporter } from 'nodemailer';

export interface SMTPConfig {
  host: string;
  port: number;
  secure?: boolean;
  username: string;
  password: string;
}

export interface EmailOptions {
  from?: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
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
      auth: {
        user: this.config.username,
        pass: this.config.password,
      },
    });

    // 验证连接
    try {
      if (this.transporter) {
        await this.transporter.verify();
      }
    } catch (error) {
      throw new Error(`SMTP connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async sendMail(options: EmailOptions): Promise<EmailResult> {
    if (!this.transporter) {
      throw new Error('SMTP client not connected');
    }

    const mailOptions = {
      from: options.from || this.config.username,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
      bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments,
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      
      return {
        messageId: result.messageId,
        response: result.response,
        accepted: result.accepted || [],
        rejected: result.rejected || [],
      };
    } catch (error) {
      throw new Error(`Failed to send email: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
  }
}
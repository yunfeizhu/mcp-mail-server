import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { POP3Client, POP3Config, EmailMessage } from './pop3-client.js';
import { SMTPClient, SMTPConfig, EmailOptions, EmailResult } from './smtp-client.js';
import { EMAIL_CONFIG } from './config.js';

class MailMCPServer {
  private server: Server;
  private pop3Client: POP3Client | null = null;
  private smtpClient: SMTPClient | null = null;

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
      if (this.pop3Client) {
        this.pop3Client.disconnect();
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
          {
            name: 'connect_pop3',
            description: 'Connect to POP3 email server (using preconfigured settings)',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'list_messages',
            description: 'List all messages in the mailbox',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_message',
            description: 'Retrieve a specific email message',
            inputSchema: {
              type: 'object',
              properties: {
                messageId: {
                  type: 'number',
                  description: 'Message ID to retrieve',
                },
              },
              required: ['messageId'],
            },
          },
          {
            name: 'delete_message',
            description: 'Delete a specific email message',
            inputSchema: {
              type: 'object',
              properties: {
                messageId: {
                  type: 'number',
                  description: 'Message ID to delete',
                },
              },
              required: ['messageId'],
            },
          },
          {
            name: 'get_message_count',
            description: 'Get the total number of messages in the mailbox',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'disconnect',
            description: 'Disconnect from the POP3 server',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'connect_smtp',
            description: 'Connect to SMTP email server for sending emails (using preconfigured settings)',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'send_email',
            description: 'Send an email via SMTP',
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
          {
            name: 'disconnect_smtp',
            description: 'Disconnect from the SMTP server',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'quick_connect',
            description: 'Connect to both POP3 and SMTP servers at once (using preconfigured settings)',
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
          case 'connect_pop3':
            return await this.handleConnect();
          case 'list_messages':
            return await this.handleListMessages();
          case 'get_message':
            return await this.handleGetMessage(args);
          case 'delete_message':
            return await this.handleDeleteMessage(args);
          case 'get_message_count':
            return await this.handleGetMessageCount();
          case 'disconnect':
            return await this.handleDisconnect();
          case 'connect_smtp':
            return await this.handleConnectSMTP();
          case 'send_email':
            return await this.handleSendEmail(args);
          case 'disconnect_smtp':
            return await this.handleDisconnectSMTP();
          case 'quick_connect':
            return await this.handleQuickConnect();
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

  private async handleConnect() {
    const config: POP3Config = EMAIL_CONFIG.POP3;

    try {
      this.pop3Client = new POP3Client(config);
      await this.pop3Client.connect();
      await this.pop3Client.authenticate();

      return {
        content: [
          {
            type: 'text',
            text: `Successfully connected to POP3 server ${config.host}:${config.port}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to connect: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleListMessages() {
    if (!this.pop3Client) {
      throw new Error('Not connected to POP3 server');
    }

    const messages = await this.pop3Client.listMessages();
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(messages, null, 2),
        },
      ],
    };
  }

  private async handleGetMessage(args: any) {
    if (!this.pop3Client) {
      throw new Error('Not connected to POP3 server');
    }

    const messageId = args.messageId;
    if (typeof messageId !== 'number') {
      throw new Error('messageId must be a number');
    }

    const message = await this.pop3Client.retrieveMessage(messageId);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(message, null, 2),
        },
      ],
    };
  }

  private async handleDeleteMessage(args: any) {
    if (!this.pop3Client) {
      throw new Error('Not connected to POP3 server');
    }

    const messageId = args.messageId;
    if (typeof messageId !== 'number') {
      throw new Error('messageId must be a number');
    }

    await this.pop3Client.deleteMessage(messageId);
    
    return {
      content: [
        {
          type: 'text',
          text: `Message ${messageId} marked for deletion`,
        },
      ],
    };
  }

  private async handleGetMessageCount() {
    if (!this.pop3Client) {
      throw new Error('Not connected to POP3 server');
    }

    const count = await this.pop3Client.getMessageCount();
    
    return {
      content: [
        {
          type: 'text',
          text: `Total messages: ${count}`,
        },
      ],
    };
  }

  private async handleDisconnect() {
    if (!this.pop3Client) {
      throw new Error('Not connected to POP3 server');
    }

    await this.pop3Client.quit();
    this.pop3Client = null;
    
    return {
      content: [
        {
          type: 'text',
          text: 'Disconnected from POP3 server',
        },
      ],
    };
  }

  private async handleConnectSMTP() {
    const config: SMTPConfig = EMAIL_CONFIG.SMTP;

    try {
      this.smtpClient = new SMTPClient(config);
      await this.smtpClient.connect();

      return {
        content: [
          {
            type: 'text',
            text: `Successfully connected to SMTP server ${config.host}:${config.port}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to connect to SMTP server: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleSendEmail(args: any) {
    if (!this.smtpClient) {
      throw new Error('Not connected to SMTP server');
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

    try {
      const result = await this.smtpClient.sendMail(emailOptions);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to send email: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async handleDisconnectSMTP() {
    if (!this.smtpClient) {
      throw new Error('Not connected to SMTP server');
    }

    await this.smtpClient.disconnect();
    this.smtpClient = null;
    
    return {
      content: [
        {
          type: 'text',
          text: 'Disconnected from SMTP server',
        },
      ],
    };
  }

  private async handleQuickConnect() {
    const results = [];
    let pop3Success = false;
    let smtpSuccess = false;

    // 连接POP3
    try {
      const pop3Config: POP3Config = EMAIL_CONFIG.POP3;
      this.pop3Client = new POP3Client(pop3Config);
      await this.pop3Client.connect();
      await this.pop3Client.authenticate();
      results.push(`✅ POP3: Successfully connected to ${pop3Config.host}:${pop3Config.port}`);
      pop3Success = true;
    } catch (error) {
      results.push(`❌ POP3: Failed to connect - ${error instanceof Error ? error.message : String(error)}`);
    }

    // 连接SMTP
    try {
      const smtpConfig: SMTPConfig = EMAIL_CONFIG.SMTP;
      this.smtpClient = new SMTPClient(smtpConfig);
      await this.smtpClient.connect();
      results.push(`✅ SMTP: Successfully connected to ${smtpConfig.host}:${smtpConfig.port}`);
      smtpSuccess = true;
    } catch (error) {
      results.push(`❌ SMTP: Failed to connect - ${error instanceof Error ? error.message : String(error)}`);
    }

    const summary = `Connection Summary: POP3 ${pop3Success ? '✅' : '❌'} | SMTP ${smtpSuccess ? '✅' : '❌'}`;
    results.push('', summary);

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
      console.error(`POP3: ${EMAIL_CONFIG.POP3.host}:${EMAIL_CONFIG.POP3.port} (TLS: ${EMAIL_CONFIG.POP3.tls})`);
      console.error(`SMTP: ${EMAIL_CONFIG.SMTP.host}:${EMAIL_CONFIG.SMTP.port} (Secure: ${EMAIL_CONFIG.SMTP.secure})`);
      console.error(`User: ${EMAIL_CONFIG.POP3.username}`);
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
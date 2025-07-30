import net from 'net';
import tls from 'tls';
import { EventEmitter } from 'events';

export interface POP3Config {
  host: string;
  port: number;
  username: string;
  password: string;
  tls?: boolean;
}

export interface EmailMessage {
  id: number;
  size: number;
  headers: Record<string, string>;
  body: string;
  raw: string;
}

export class POP3Client extends EventEmitter {
  private socket: net.Socket | null = null;
  private config: POP3Config;
  private connected = false;
  private authenticated = false;
  private buffer = '';

  constructor(config: POP3Config) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.error(`[POP3] Connecting to ${this.config.host}:${this.config.port} (TLS: ${this.config.tls})`);
      
      // 设置连接超时
      const timeout = setTimeout(() => {
        if (this.socket) {
          this.socket.destroy();
        }
        reject(new Error(`Connection timeout to ${this.config.host}:${this.config.port}`));
      }, 10000); // 10秒超时

      // 创建socket连接
      if (this.config.tls) {
        // 使用TLS连接（POP3S）
        this.socket = tls.connect({
          host: this.config.host,
          port: this.config.port,
          rejectUnauthorized: false // 允许自签名证书，生产环境建议设为true
        });
      } else {
        // 使用普通连接
        this.socket = net.createConnection(this.config.port, this.config.host);
      }
      
      this.socket.on('connect', () => {
        console.error('[POP3] Socket connected, waiting for server greeting...');
        this.connected = true;
      });

      this.socket.on('secureConnect', () => {
        console.error('[POP3] TLS connection established, waiting for server greeting...');
        this.connected = true;
      });

      this.socket.on('data', (data) => {
        console.error('[POP3] Received data:', data.toString().trim());
        this.buffer += data.toString();
        this.processBuffer(resolve, reject, timeout);
      });

      this.socket.on('error', (error) => {
        console.error('[POP3] Connection error:', error.message);
        clearTimeout(timeout);
        reject(new Error(`POP3 connection failed: ${error.message}`));
      });

      this.socket.on('close', () => {
        console.error('[POP3] Connection closed');
        clearTimeout(timeout);
        this.connected = false;
        this.authenticated = false;
      });
    });
  }

  private processBuffer(resolve?: Function, reject?: Function, timeout?: NodeJS.Timeout) {
    const lines = this.buffer.split('\r\n');
    
    if (lines.length > 1) {
      const response = lines[0];
      this.buffer = lines.slice(1).join('\r\n');

      console.error('[POP3] Server response:', response);

      if (response.startsWith('+OK')) {
        if (timeout) clearTimeout(timeout);
        if (resolve) {
          console.error('[POP3] Connection successful!');
          resolve();
        }
      } else if (response.startsWith('-ERR')) {
        if (timeout) clearTimeout(timeout);
        if (reject) {
          console.error('[POP3] Server error:', response);
          reject(new Error(`POP3 server error: ${response}`));
        }
      }
    }
  }

  private async sendCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error('Not connected'));
        return;
      }

      this.socket.write(command + '\r\n');
      
      const onData = (data: Buffer) => {
        const response = data.toString();
        this.socket?.removeListener('data', onData);
        
        if (response.startsWith('+OK')) {
          resolve(response);
        } else {
          reject(new Error(response));
        }
      };

      this.socket.on('data', onData);
    });
  }

  async authenticate(): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to server');
    }

    try {
      console.error('[POP3] Authenticating user:', this.config.username);
      await this.sendCommand(`USER ${this.config.username}`);
      console.error('[POP3] Sending password...');
      await this.sendCommand(`PASS ${this.config.password}`);
      this.authenticated = true;
      console.error('[POP3] Authentication successful!');
    } catch (error) {
      console.error('[POP3] Authentication failed:', error);
      throw new Error(`Authentication failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getMessageCount(): Promise<number> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    const response = await this.sendCommand('STAT');
    const match = response.match(/\+OK (\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  async listMessages(): Promise<Array<{id: number, size: number}>> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }

      this.socket.write('LIST\r\n');
      
      let buffer = '';
      const onData = (data: Buffer) => {
        buffer += data.toString();
        
        if (buffer.includes('\r\n.\r\n')) {
          this.socket?.removeListener('data', onData);
          
          const lines = buffer.split('\r\n');
          const messages: Array<{id: number, size: number}> = [];
          
          for (let i = 1; i < lines.length - 2; i++) {
            const parts = lines[i].split(' ');
            if (parts.length >= 2) {
              messages.push({
                id: parseInt(parts[0]),
                size: parseInt(parts[1])
              });
            }
          }
          
          resolve(messages);
        }
      };

      this.socket.on('data', onData);
    });
  }

  async retrieveMessage(messageId: number): Promise<EmailMessage> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }

      this.socket.write(`RETR ${messageId}\r\n`);
      
      let buffer = '';
      const onData = (data: Buffer) => {
        buffer += data.toString();
        
        if (buffer.includes('\r\n.\r\n')) {
          this.socket?.removeListener('data', onData);
          
          const content = buffer.substring(buffer.indexOf('\r\n') + 2, buffer.lastIndexOf('\r\n.\r\n'));
          const message = this.parseMessage(messageId, content);
          resolve(message);
        }
      };

      this.socket.on('data', onData);
    });
  }

  private parseMessage(id: number, content: string): EmailMessage {
    const headerEndIndex = content.indexOf('\r\n\r\n');
    const headerSection = headerEndIndex > -1 ? content.substring(0, headerEndIndex) : '';
    const body = headerEndIndex > -1 ? content.substring(headerEndIndex + 4) : content;

    const headers: Record<string, string> = {};
    const headerLines = headerSection.split('\r\n');
    
    for (const line of headerLines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > -1) {
        const key = line.substring(0, colonIndex).trim().toLowerCase();
        const value = line.substring(colonIndex + 1).trim();
        headers[key] = value;
      }
    }

    return {
      id,
      size: content.length,
      headers,
      body: body.trim(),
      raw: content
    };
  }

  async deleteMessage(messageId: number): Promise<void> {
    if (!this.authenticated) {
      throw new Error('Not authenticated');
    }

    await this.sendCommand(`DELE ${messageId}`);
  }

  async quit(): Promise<void> {
    if (this.socket && this.connected) {
      await this.sendCommand('QUIT');
      this.socket.end();
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.connected = false;
      this.authenticated = false;
    }
  }
}
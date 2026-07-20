import { MailMCPServer } from './mail-mcp-server.js';

const server = new MailMCPServer();
server.run().catch(console.error);

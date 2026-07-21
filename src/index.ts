import { MailMCPServer } from './mail-mcp-server';

const server = new MailMCPServer();
server.run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

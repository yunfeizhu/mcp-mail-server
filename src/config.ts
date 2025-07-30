function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Please set this variable in your MCP server configuration.`);
  }
  return value;
}

function getRequiredBooleanEnvVar(name: string): boolean {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Please set this variable to 'true' or 'false' in your MCP server configuration.`);
  }
  if (value.toLowerCase() !== 'true' && value.toLowerCase() !== 'false') {
    throw new Error(`Invalid boolean value for environment variable ${name}: ${value}. Must be 'true' or 'false'.`);
  }
  return value.toLowerCase() === 'true';
}

function getRequiredNumberEnvVar(name: string): number {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Please set this variable to a valid number in your MCP server configuration.`);
  }
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`Invalid number value for environment variable ${name}: ${value}. Must be a valid number.`);
  }
  return num;
}

export const EMAIL_CONFIG = {
  // POP3配置（接收邮件）
  POP3: {
    host: getRequiredEnvVar('POP3_HOST'),
    port: getRequiredNumberEnvVar('POP3_PORT'),
    username: getRequiredEnvVar('EMAIL_USER'),
    password: getRequiredEnvVar('EMAIL_PASS'),
    tls: getRequiredBooleanEnvVar('POP3_SECURE')
  },
  
  // SMTP配置（发送邮件）
  SMTP: {
    host: getRequiredEnvVar('SMTP_HOST'),
    port: getRequiredNumberEnvVar('SMTP_PORT'),
    username: getRequiredEnvVar('EMAIL_USER'),
    password: getRequiredEnvVar('EMAIL_PASS'),
    secure: getRequiredBooleanEnvVar('SMTP_SECURE')
  }
};
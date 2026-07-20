import path from 'path';

function getRequiredEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
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
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`Invalid number value for environment variable ${name}: ${value}. Must be a positive integer.`);
  }
  return num;
}

function getOptionalBooleanEnvVar(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  if (value.toLowerCase() !== 'true' && value.toLowerCase() !== 'false') {
    throw new Error(`Invalid boolean value for environment variable ${name}: ${value}. Must be 'true' or 'false'.`);
  }
  return value.toLowerCase() === 'true';
}

function getOptionalPositiveIntegerEnvVar(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`Invalid number value for environment variable ${name}: ${value}. Must be a positive integer.`);
  }
  return num;
}

function getAllowedRoots(): string[] {
  return (process.env.MAIL_ALLOWED_ROOTS || '')
    .split(path.delimiter)
    .map(root => root.trim())
    .filter(Boolean);
}

export const EMAIL_CONFIG = {
  // IMAP配置（接收邮件）
  IMAP: {
    host: getRequiredEnvVar('IMAP_HOST'),
    port: getRequiredNumberEnvVar('IMAP_PORT'),
    username: getRequiredEnvVar('EMAIL_USER'),
    password: getRequiredEnvVar('EMAIL_PASS'),
    tls: getRequiredBooleanEnvVar('IMAP_SECURE'),
    tlsRejectUnauthorized: getOptionalBooleanEnvVar('IMAP_TLS_REJECT_UNAUTHORIZED', true),
    maxMessageBytes: getOptionalPositiveIntegerEnvVar('MAIL_MAX_MESSAGE_BYTES', 25 * 1024 * 1024)
  },
  
  // SMTP配置（发送邮件）
  SMTP: {
    host: getRequiredEnvVar('SMTP_HOST'),
    port: getRequiredNumberEnvVar('SMTP_PORT'),
    username: getRequiredEnvVar('EMAIL_USER'),
    password: getRequiredEnvVar('EMAIL_PASS'),
    secure: getRequiredBooleanEnvVar('SMTP_SECURE')
  },

  FILES: {
    allowedRoots: getAllowedRoots(),
    maxAttachmentBytes: getOptionalPositiveIntegerEnvVar('MAIL_MAX_ATTACHMENT_BYTES', 25 * 1024 * 1024),
    maxBase64Bytes: getOptionalPositiveIntegerEnvVar('MAIL_MAX_BASE64_BYTES', 1024 * 1024),
    maxBodyCharacters: getOptionalPositiveIntegerEnvVar('MAIL_MAX_BODY_CHARACTERS', 200_000)
  }
};

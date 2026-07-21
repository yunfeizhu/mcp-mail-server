import path from 'path';

function getRequiredEnvVar(name: string, defaultValue?: string): string {
  const value = process.env[name];
  if (!value) {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(
      `Missing required environment variable: ${name}. Please set this variable in your MCP server configuration.`,
    );
  }
  return value;
}

function getRequiredBooleanEnvVar(name: string): boolean {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Please set this variable to 'true' or 'false' in your MCP server configuration.`,
    );
  }
  if (value.toLowerCase() !== 'true' && value.toLowerCase() !== 'false') {
    throw new Error(
      `Invalid boolean value for environment variable ${name}: ${value}. Must be 'true' or 'false'.`,
    );
  }
  return value.toLowerCase() === 'true';
}

function getRequiredPortEnvVar(name: string): number {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Please set this variable to a valid port in your MCP server configuration.`,
    );
  }
  const num = Number(value);
  if (!Number.isSafeInteger(num) || num < 1 || num > 65_535) {
    throw new Error(
      `Invalid port value for environment variable ${name}: ${value}. Must be an integer between 1 and 65535.`,
    );
  }
  return num;
}

function getOptionalBooleanEnvVar(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  if (value.toLowerCase() !== 'true' && value.toLowerCase() !== 'false') {
    throw new Error(
      `Invalid boolean value for environment variable ${name}: ${value}. Must be 'true' or 'false'.`,
    );
  }
  return value.toLowerCase() === 'true';
}

function getOptionalPositiveIntegerEnvVar(
  name: string,
  defaultValue: number,
  maximum: number,
): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const num = Number(value);
  if (!Number.isSafeInteger(num) || num <= 0 || num > maximum) {
    throw new Error(
      `Invalid number value for environment variable ${name}: ${value}. Must be a positive safe integer no greater than ${maximum}.`,
    );
  }
  return num;
}

function getAllowedRoots(): string[] {
  return (process.env.MAIL_ALLOWED_ROOTS || '')
    .split(path.delimiter)
    .map(root => root.trim())
    .filter(Boolean);
}

function getOptionalEnvVar(name: string, defaultValue: string): string {
  const value = process.env[name]?.trim();
  return value || defaultValue;
}

const imapSecure = getRequiredBooleanEnvVar('IMAP_SECURE');
if (!imapSecure) {
  throw new Error(
    'IMAP_SECURE=false is not supported because the current IMAP client cannot guarantee STARTTLS before authentication. Use an implicit TLS IMAP endpoint, normally port 993.',
  );
}
const smtpSecure = getRequiredBooleanEnvVar('SMTP_SECURE');

export const EMAIL_CONFIG = {
  // IMAP配置（接收邮件）
  IMAP: {
    host: getRequiredEnvVar('IMAP_HOST'),
    port: getRequiredPortEnvVar('IMAP_PORT'),
    username: getRequiredEnvVar('EMAIL_USER'),
    password: getRequiredEnvVar('EMAIL_PASS'),
    tls: imapSecure,
    tlsRejectUnauthorized: getOptionalBooleanEnvVar('IMAP_TLS_REJECT_UNAUTHORIZED', true),
    maxMessageBytes: getOptionalPositiveIntegerEnvVar(
      'MAIL_MAX_MESSAGE_BYTES',
      25 * 1024 * 1024,
      1024 * 1024 * 1024,
    ),
  },

  // SMTP配置（发送邮件）
  SMTP: {
    host: getRequiredEnvVar('SMTP_HOST'),
    port: getRequiredPortEnvVar('SMTP_PORT'),
    username: getRequiredEnvVar('EMAIL_USER'),
    password: getRequiredEnvVar('EMAIL_PASS'),
    secure: smtpSecure,
    requireTLS: !smtpSecure,
    tlsRejectUnauthorized: getOptionalBooleanEnvVar('SMTP_TLS_REJECT_UNAUTHORIZED', true),
    fromAddress: getOptionalEnvVar('EMAIL_ADDRESS', getRequiredEnvVar('EMAIL_USER')),
  },

  ACCOUNT: {
    emailAddress: getOptionalEnvVar('EMAIL_ADDRESS', getRequiredEnvVar('EMAIL_USER')),
  },

  FILES: {
    allowedRoots: getAllowedRoots(),
    maxAttachmentBytes: getOptionalPositiveIntegerEnvVar(
      'MAIL_MAX_ATTACHMENT_BYTES',
      25 * 1024 * 1024,
      1024 * 1024 * 1024,
    ),
    maxBase64Bytes: getOptionalPositiveIntegerEnvVar(
      'MAIL_MAX_BASE64_BYTES',
      1024 * 1024,
      100 * 1024 * 1024,
    ),
    maxBodyCharacters: getOptionalPositiveIntegerEnvVar(
      'MAIL_MAX_BODY_CHARACTERS',
      200_000,
      10_000_000,
    ),
    maxResponseCharacters: getOptionalPositiveIntegerEnvVar(
      'MAIL_MAX_RESPONSE_CHARACTERS',
      2_000_000,
      100_000_000,
    ),
    maxSearchCandidates: getOptionalPositiveIntegerEnvVar(
      'MAIL_MAX_SEARCH_CANDIDATES',
      5_000,
      100_000,
    ),
    maxSearchHeaderBytes: getOptionalPositiveIntegerEnvVar(
      'MAIL_MAX_SEARCH_HEADER_BYTES',
      16 * 1024 * 1024,
      1024 * 1024 * 1024,
    ),
  },
};

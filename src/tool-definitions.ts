import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} satisfies ToolAnnotations;

const MAX_MAILBOX_LENGTH = 1024;
const MAX_ADDRESS_LIST_LENGTH = 8192;
const MAX_SUBJECT_LENGTH = 998;
const MAX_BODY_LENGTH = 10_000_000;
const MAX_SEARCH_TEXT_LENGTH = 4096;
const MAX_PATH_LENGTH = 4096;

const mailboxSchema = z
  .string()
  .min(1)
  .max(MAX_MAILBOX_LENGTH)
  .describe('Mailbox containing the message, as returned in sourceMailbox');

const uidValiditySchema = z
  .number()
  .int()
  .safe()
  .min(1)
  .describe('Optional UIDVALIDITY returned with the message reference')
  .optional();

const bodyTextSchema = z.string().min(1).max(MAX_BODY_LENGTH).describe('Plain-text body');

const bodyHtmlSchema = z.string().min(1).max(MAX_BODY_LENGTH).describe('HTML body');

const signatureSchema = z
  .object({
    text: z.string().min(1).max(MAX_BODY_LENGTH).describe('Plain-text signature').optional(),
    html: z.string().min(1).max(MAX_BODY_LENGTH).describe('Trusted HTML signature').optional(),
  })
  .strict()
  .refine(value => value.text !== undefined || value.html !== undefined, {
    message: 'Signature must contain text, html, or both',
  })
  .meta({
    description: 'Optional signature appended after the new body. Provide text, html, or both.',
    anyOf: [{ required: ['text'] }, { required: ['html'] }],
  });

const uniqueMailboxesSchema = z
  .array(z.string().min(1).max(MAX_MAILBOX_LENGTH))
  .min(1)
  .max(20)
  .refine(value => new Set(value).size === value.length, {
    message: 'Mailbox names must not contain duplicates',
  })
  .meta({ uniqueItems: true });

const optionalDateSchema = (description: string) =>
  z.string().min(1).max(64).describe(description).optional();

const messageRefShape = {
  mailbox: mailboxSchema,
  uidValidity: uidValiditySchema,
};

const withRequiredBody = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z
    .object(shape)
    .strict()
    .refine(
      value =>
        (value as { text?: string }).text !== undefined ||
        (value as { html?: string }).html !== undefined,
      { message: 'At least one of text or html is required' },
    )
    .meta({
      anyOf: [{ required: ['text'] }, { required: ['html'] }],
    });

export interface MailToolDefinition {
  name: string;
  description: string;
  annotations: ToolAnnotations;
  inputSchema: z.ZodType;
}

export const MAIL_TOOLS = [
  {
    name: 'check_connection',
    description:
      'Connect to IMAP when needed, actively verify SMTP, then return structured status for both services.',
    annotations: readOnlyAnnotations,
    inputSchema: z.object({}).strict(),
  },
  {
    name: 'list_mailboxes',
    description: 'List all available mailboxes (folders). Auto-connects to IMAP when needed.',
    annotations: readOnlyAnnotations,
    inputSchema: z.object({}).strict(),
  },
  {
    name: 'search_messages',
    description:
      'Search one or more mailboxes with combined filters. Defaults to INBOX and the detected sent mailbox. Returns message summaries unless includeBody is true; full-body hydration fails explicitly if a selected message disappears or the aggregate response-body budget would be exceeded.',
    annotations: readOnlyAnnotations,
    inputSchema: z
      .object({
        mailboxes: uniqueMailboxesSchema
          .describe(
            'Explicit mailbox names to search. Omit to search INBOX and the detected sent mailbox.',
          )
          .optional(),
        from: z
          .string()
          .min(1)
          .max(MAX_SEARCH_TEXT_LENGTH)
          .describe('Match the From header')
          .optional(),
        to: z
          .string()
          .min(1)
          .max(MAX_SEARCH_TEXT_LENGTH)
          .describe('Match the To header')
          .optional(),
        subject: z
          .string()
          .min(1)
          .max(MAX_SEARCH_TEXT_LENGTH)
          .describe('Match text in the Subject header')
          .optional(),
        body: z
          .string()
          .min(1)
          .max(MAX_SEARCH_TEXT_LENGTH)
          .describe('Match text in the message body')
          .optional(),
        keywords: z
          .array(z.string().min(1).max(255))
          .min(1)
          .max(10)
          .refine(value => new Set(value).size === value.length, {
            message: 'Keywords must not contain duplicates',
          })
          .meta({ uniqueItems: true })
          .describe(
            'Atom-safe custom IMAP keywords to require. Whitespace, control characters, IMAP syntax characters, and system flags are rejected; use unread for the Seen state.',
          )
          .optional(),
        unread: z
          .boolean()
          .describe('true matches unread messages; false matches read messages; omit for either')
          .optional(),
        since: optionalDateSchema(
          'Inclusive lower date/time bound, for example 2026-07-01 or an ISO date-time',
        ),
        before: optionalDateSchema(
          'Exclusive upper date/time bound, for example 2026-08-01 or an ISO date-time',
        ),
        limit: z
          .number()
          .int()
          .safe()
          .min(1)
          .max(200)
          .default(50)
          .describe('Maximum number of messages returned'),
        includeBody: z
          .boolean()
          .default(false)
          .describe(
            'Include text and HTML bodies in search results. Leave false and use get_message for full content.',
          ),
      })
      .strict(),
  },
  {
    name: 'find_unreplied_messages',
    description:
      'Find messages from a sender that have no thread-header reply in the sent mailbox. Messages without Message-ID are returned separately as unknown.',
    annotations: readOnlyAnnotations,
    inputSchema: z
      .object({
        sender: z
          .string()
          .min(1)
          .max(MAX_ADDRESS_LIST_LENGTH)
          .describe('Sender email address to inspect'),
        mailboxes: uniqueMailboxesSchema
          .describe('Source mailboxes containing received messages. Defaults to INBOX.')
          .optional(),
        since: optionalDateSchema('Inclusive lower date/time bound for received messages'),
        before: optionalDateSchema('Exclusive upper date/time bound for received messages'),
        limit: z
          .number()
          .int()
          .safe()
          .min(1)
          .max(200)
          .default(50)
          .describe('Maximum number of newest received-message candidates to analyze'),
      })
      .strict(),
  },
  {
    name: 'get_message',
    description:
      'Retrieve one message, including full bodies and attachment metadata. Set markSeen only when the message should be marked as read.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: z
      .object({
        ...messageRefShape,
        uid: z.number().int().safe().min(1).describe('Message UID within the mailbox'),
        markSeen: z
          .boolean()
          .default(false)
          .describe('Mark the message as read while retrieving it'),
      })
      .strict(),
  },
  {
    name: 'get_messages',
    description:
      'Retrieve multiple messages from one mailbox, including full bodies and attachment metadata. Fails if any requested UID is missing or the aggregate response-body budget would be exceeded.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: z
      .object({
        ...messageRefShape,
        uids: z
          .array(z.number().int().safe().min(1))
          .min(1)
          .max(50)
          .refine(value => new Set(value).size === value.length, {
            message: 'UIDs must not contain duplicates',
          })
          .meta({ uniqueItems: true })
          .describe('Message UIDs within the mailbox'),
        markSeen: z
          .boolean()
          .default(false)
          .describe('Mark the messages as read while retrieving them'),
      })
      .strict(),
  },
  {
    name: 'send_email',
    description:
      'Send a new email via SMTP and try to save a MIME-equivalent copy with the accepted Message-ID to the sent mailbox.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: withRequiredBody({
      to: z
        .string()
        .min(1)
        .max(MAX_ADDRESS_LIST_LENGTH)
        .describe('Recipient addresses, comma-separated'),
      subject: z.string().min(1).max(MAX_SUBJECT_LENGTH).describe('Email subject'),
      text: bodyTextSchema.optional(),
      html: bodyHtmlSchema.optional(),
      signature: signatureSchema.optional(),
      cc: z
        .string()
        .max(MAX_ADDRESS_LIST_LENGTH)
        .describe('CC addresses, comma-separated')
        .optional(),
      bcc: z
        .string()
        .max(MAX_ADDRESS_LIST_LENGTH)
        .describe('BCC addresses, comma-separated')
        .optional(),
      attachments: z
        .array(z.string().min(1).max(MAX_PATH_LENGTH))
        .max(20)
        .describe('Absolute paths to local files allowed by MAIL_ALLOWED_ROOTS')
        .optional(),
    }),
  },
  {
    name: 'reply_to_email',
    description:
      'Reply to a mailbox-scoped message with threading headers, optional reply-all recipients, signature, and quoted original content.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: withRequiredBody({
      ...messageRefShape,
      originalUid: z.number().int().safe().min(1).describe('UID of the original message'),
      text: bodyTextSchema.describe('Plain-text reply body').optional(),
      html: bodyHtmlSchema.describe('HTML reply body').optional(),
      signature: signatureSchema.optional(),
      replyToAll: z
        .boolean()
        .default(false)
        .describe('Reply to the sender and all original To/CC recipients except this account'),
      includeOriginal: z
        .boolean()
        .default(true)
        .describe('Quote the original message below the new reply'),
    }),
  },
  {
    name: 'continue_email_thread',
    description:
      'Find the newest sent message with the same normalized subject, optionally narrowed by recipient and date, then continue its thread. Designed for recurring reports; reply-all and quoted history both default to true.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: withRequiredBody({
      subject: z
        .string()
        .min(1)
        .max(MAX_SUBJECT_LENGTH)
        .describe(
          'Exact thread subject after ignoring repeated Re:/回复:/答复: prefixes, case, and surrounding whitespace',
        ),
      recipient: z
        .string()
        .min(1)
        .max(MAX_ADDRESS_LIST_LENGTH)
        .describe('Optional To-header match used to narrow same-subject sent threads')
        .optional(),
      since: optionalDateSchema(
        'Optional inclusive lower date/time bound for the sent-message lookup',
      ),
      text: bodyTextSchema.describe('Plain-text body for the new report or update').optional(),
      html: bodyHtmlSchema.describe('HTML body for the new report or update').optional(),
      signature: signatureSchema.optional(),
      replyToAll: z
        .boolean()
        .default(true)
        .describe('Preserve the latest sent message To/CC recipients except this account'),
      includeOriginal: z
        .boolean()
        .default(true)
        .describe(
          'Quote the complete previous sent-message body below the new content; subject to the configured body safety limit',
        ),
    }),
  },
  {
    name: 'move_message',
    description:
      'Move an existing mailbox-scoped message to another existing mailbox. If a move, copy, or source-cleanup outcome cannot be confirmed, returns a structured partial error that must be inspected before retrying.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: z
      .object({
        ...messageRefShape,
        uid: z.number().int().safe().min(1).describe('UID in the source mailbox'),
        targetMailbox: z
          .string()
          .min(1)
          .max(MAX_MAILBOX_LENGTH)
          .describe('Existing destination mailbox returned by list_mailboxes'),
      })
      .strict(),
  },
  {
    name: 'delete_message',
    description:
      'Permanently delete one existing mailbox-scoped message using targeted UID EXPUNGE. Fails safely when the UID is missing or the IMAP server lacks UIDPLUS, and returns a structured unknown outcome when a transport failure prevents confirmation.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: z
      .object({
        ...messageRefShape,
        uid: z.number().int().safe().min(1).describe('UID of the message to permanently delete'),
      })
      .strict(),
  },
  {
    name: 'save_attachment',
    description:
      'Save one or all attachments from a mailbox-scoped message into an allowed local directory. If a later write fails, returns the files already saved as a structured partial result.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    inputSchema: z
      .object({
        ...messageRefShape,
        uid: z
          .number()
          .int()
          .safe()
          .min(1)
          .describe('UID of the message containing the attachments'),
        savePath: z
          .string()
          .min(1)
          .max(MAX_PATH_LENGTH)
          .describe('Absolute allowed directory where files will be created'),
        attachmentIndex: z
          .number()
          .int()
          .safe()
          .min(0)
          .describe('Zero-based attachment index. Omit to save all attachments.')
          .optional(),
        returnBase64: z
          .boolean()
          .default(false)
          .describe('Also include saved content as Base64 when within the configured size limit'),
      })
      .strict(),
  },
] as const satisfies readonly MailToolDefinition[];

export type MailToolName = (typeof MAIL_TOOLS)[number]['name'];

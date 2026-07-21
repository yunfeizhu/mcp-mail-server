import { type EmailMessage } from './imap-client';

export interface ExtendedEmailMessage extends EmailMessage {
  sourceMailbox: string;
}

export interface SearchResult {
  query: SearchMessagesArgs;
  searchCriteria: any[];
  mailboxesSearched: MailboxSearchResult[];
  totalMatches: number;
  returnedCount: number;
  hasMore: boolean;
  messages: ExtendedEmailMessage[];
  note?: string;
  warning?: string;
}

export interface MailboxSearchResult {
  mailbox: string;
  uidValidity?: number;
  totalMatches: number;
  returnedCount: number;
  error?: string;
}

export interface SearchMessagesArgs {
  mailboxes?: string[];
  from?: string;
  to?: string;
  subject?: string;
  body?: string;
  keywords?: string[];
  unread?: boolean;
  since?: string;
  before?: string;
  limit?: number;
  includeBody?: boolean;
}

export interface FindUnrepliedMessagesArgs {
  sender: string;
  mailboxes?: string[];
  since?: string;
  before?: string;
  limit?: number;
}

export interface ReplyInfo {
  originalUid: number;
  sourceMailbox: string;
  uidValidity: number;
  originalFrom: string;
  originalSubject?: string;
  replyToAll: boolean;
  includeOriginal: boolean;
  recipients: {
    to: string[];
    cc?: string[];
  };
}

export interface EmailSignature {
  text?: string;
  html?: string;
}

export interface ReplyToEmailArgs {
  originalUid: number;
  mailbox: string;
  uidValidity?: number;
  text?: string;
  html?: string;
  signature?: EmailSignature;
  replyToAll?: boolean;
  includeOriginal?: boolean;
}

export interface ContinueEmailThreadArgs {
  subject: string;
  recipient?: string;
  since?: string;
  text?: string;
  html?: string;
  signature?: EmailSignature;
  replyToAll?: boolean;
  includeOriginal?: boolean;
}

export interface GetMessagesArgs {
  mailbox: string;
  uidValidity?: number;
  uids: number[];
  markSeen?: boolean;
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  signature?: EmailSignature;
  cc?: string;
  bcc?: string;
  attachments?: string[];
}

export interface SentFolderError {
  stage: 'connection' | 'detect' | 'build' | 'append';
  code:
    | 'IMAP_CONNECTION_FAILED'
    | 'SENT_MAILBOX_NOT_FOUND'
    | 'RAW_MESSAGE_BUILD_FAILED'
    | 'IMAP_APPEND_FAILED';
  message: string;
  mailbox?: string;
  attempts?: Array<{
    mailbox: string;
    stage: 'select' | 'append';
    outcome: 'not-appended' | 'unknown';
    message: string;
  }>;
}

export interface SentFolderSaveResult {
  saved: boolean;
  mailbox?: string;
  error?: SentFolderError;
}

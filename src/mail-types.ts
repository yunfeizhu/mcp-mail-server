import { EmailMessage } from './imap-client.js';

export interface ExtendedEmailMessage extends EmailMessage {
  sourceMailbox: string;
}

export interface SearchResult {
  searchType: string;
  searchValue: string;
  searchCriteria: any[];
  mailboxesSearched: MailboxSearchResult[];
  totalMatches: number;
  returnedCount?: number;
  messages: ExtendedEmailMessage[];
  note?: string;
  warning?: string;
  sender?: string;
  recipient?: string;
  subjectKeywords?: string;
  bodyText?: string;
  keyword?: string;
  sinceDate?: string;
  startDate?: string;
  endDate?: string;
}

export interface MailboxSearchResult {
  mailbox: string;
  uidValidity?: number;
  matchingUIDs: number[];
  messageCount: number;
  error?: string;
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

export interface SearchArgs {
  sender?: string;
  subject?: string;
  recipient?: string;
  text?: string;
  keyword?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  inboxOnly?: boolean;
  limit?: number;
}

export interface MailboxArgs {
  mailboxName?: string;
  readOnly?: boolean;
  openSent?: boolean;
}

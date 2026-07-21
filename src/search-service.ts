import {
  type EmailMessage,
  type FetchByteBudget,
  FetchByteLimitError,
  type IMAPClient,
} from './imap-client';
import {
  type ExtendedEmailMessage,
  type FindUnrepliedMessagesArgs,
  type MailboxSearchResult,
  type SearchMessagesArgs,
  type SearchResult,
} from './mail-types';
import { cleanReplySubject } from './mail-utils';

interface MailSearchServiceDependencies {
  ensureIMAPConnection: () => Promise<void>;
  getIMAPClient: () => IMAPClient;
  findSentMailbox: () => Promise<string | null>;
  maxBodyCharacters: number;
  maxResponseCharacters: number;
  maxSearchCandidates: number;
  maxSearchHeaderBytes: number;
}

type SearchResponse = {
  content: Array<{ type: 'text'; text: string }>;
};

interface CollectedSearch {
  criteria: any[];
  mailboxesSearched: MailboxSearchResult[];
  messages: ExtendedEmailMessage[];
  totalMatches: number;
  warning?: string;
}

interface CollectOptions {
  candidateBudget?: SearchCandidateBudget;
}

interface SearchCandidateBudget {
  used: number;
  limit: number;
  headerBytes: FetchByteBudget;
}

class SearchResourceLimitError extends Error {}

const SEARCH_FETCH_BATCH_SIZE = 50;
const SEARCH_HEADER_FIELDS =
  'HEADER.FIELDS (FROM REPLY-TO TO CC BCC SUBJECT MESSAGE-ID IN-REPLY-TO REFERENCES)';
const INVALID_IMAP_KEYWORD_CHARS = /[(){}\\\]"%*]/;

function hasUnsafeImapKeywordCharacter(value: string): boolean {
  return (
    INVALID_IMAP_KEYWORD_CHARS.test(value) ||
    [...value].some(character => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x20 || codePoint === 0x7f;
    })
  );
}

export class MailSearchService {
  constructor(private readonly dependencies: MailSearchServiceDependencies) {}

  async findLatestSentMessage(args: {
    subject: string;
    recipient?: string;
    since?: string;
  }): Promise<ExtendedEmailMessage | null> {
    try {
      const subject = this.requireString(args.subject, 'subject');
      const recipient =
        args.recipient === undefined ? undefined : this.requireString(args.recipient, 'recipient');
      await this.dependencies.ensureIMAPConnection();
      const sentMailbox = await this.dependencies.findSentMailbox();
      if (!sentMailbox) {
        throw new Error('Could not find a sent mailbox');
      }

      const query = this.normalizeSearchArgs(
        {
          mailboxes: [sentMailbox],
          subject: cleanReplySubject(subject),
          to: recipient,
          since: args.since,
          limit: 200,
          includeBody: false,
        },
        200,
        false,
      );
      const collected = await this.collectMessages(query);
      if (collected.warning) {
        throw new Error(`The sent mailbox could not be searched reliably: ${collected.warning}`);
      }

      const normalizedSubject = this.normalizeThreadSubject(subject);
      return (
        collected.messages
          .filter(
            message => this.normalizeThreadSubject(message.subject || '') === normalizedSubject,
          )
          .sort((left, right) => this.messageTimestamp(right) - this.messageTimestamp(left))[0] ||
        null
      );
    } catch (error) {
      throw new Error(this.formatError(error, 'Find latest sent message failed'), { cause: error });
    }
  }

  async searchMessages(args: SearchMessagesArgs): Promise<SearchResponse> {
    try {
      const limit = this.normalizeLimit(args.limit, 50);
      const includeBody = args.includeBody === true;
      const normalizedArgs = this.normalizeSearchArgs(args, limit, includeBody);
      await this.dependencies.ensureIMAPConnection();
      const candidateBudget = this.createCandidateBudget();
      const collected = await this.collectMessages(normalizedArgs, {
        candidateBudget,
      });
      const selected = collected.messages
        .sort((left, right) => this.messageTimestamp(right) - this.messageTimestamp(left))
        .slice(0, limit);
      const messages = includeBody
        ? await this.hydrateMessages(selected, this.createResponseBudget())
        : selected.map(message => this.messageForResponse(message, false));

      const result: SearchResult = {
        query: normalizedArgs,
        searchCriteria: collected.criteria,
        mailboxesSearched: collected.mailboxesSearched,
        totalMatches: collected.totalMatches,
        returnedCount: messages.length,
        hasMore: collected.totalMatches > messages.length,
        messages,
        note: `Found ${collected.totalMatches} matching messages and returned ${messages.length}`,
        warning: collected.warning,
      };

      return this.response(result);
    } catch (error) {
      throw new Error(this.formatError(error, 'Search messages failed'), { cause: error });
    }
  }

  async findUnrepliedMessages(args: FindUnrepliedMessagesArgs): Promise<SearchResponse> {
    try {
      const sender = this.requireString(args.sender, 'sender');
      const limit = this.normalizeLimit(args.limit, 50);
      const sourceMailboxes = this.normalizeMailboxes(args.mailboxes, ['INBOX']);
      const candidateBudget = this.createCandidateBudget();
      const incomingQuery = this.normalizeSearchArgs(
        {
          mailboxes: sourceMailboxes,
          from: sender,
          since: args.since,
          before: args.before,
          limit,
          includeBody: false,
        },
        limit,
        false,
      );
      await this.dependencies.ensureIMAPConnection();
      const incoming = await this.collectMessages(incomingQuery, {
        candidateBudget,
      });
      if (incoming.warning) {
        throw new Error(
          `Reply-state analysis requires every source mailbox to succeed: ${incoming.warning}`,
        );
      }
      const candidates = incoming.messages
        .sort((left, right) => this.messageTimestamp(right) - this.messageTimestamp(left))
        .slice(0, limit);

      if (candidates.length === 0) {
        return this.response({
          sender,
          sourceMailboxes,
          sentMailbox: null,
          totalCandidates: 0,
          repliedCount: 0,
          unrepliedCount: 0,
          unknownCount: 0,
          messages: [],
          unknownMessages: [],
          note: `No messages from ${sender} matched the requested range.`,
        });
      }

      const sentMailbox = await this.dependencies.findSentMailbox();
      if (!sentMailbox) {
        throw new Error(
          'Could not find a sent mailbox, so reply state cannot be determined safely',
        );
      }

      const earliestCandidate = candidates.reduce(
        (earliest, message) => Math.min(earliest, this.messageTimestamp(message)),
        Number.POSITIVE_INFINITY,
      );
      const sentQuery = this.normalizeSearchArgs(
        {
          mailboxes: [sentMailbox],
          since: Number.isFinite(earliestCandidate)
            ? new Date(earliestCandidate).toISOString()
            : args.since,
          includeBody: false,
          limit: 200,
        },
        200,
        false,
      );
      const sent = await this.collectMessages(sentQuery, {
        candidateBudget,
      });
      const replyTimestamps = this.collectReplyTimestamps(sent.messages);
      const replied: ExtendedEmailMessage[] = [];
      const unreplied: ExtendedEmailMessage[] = [];
      const unknown: ExtendedEmailMessage[] = [];

      for (const message of candidates) {
        const messageId = this.normalizeMessageId(message.messageId);
        if (!messageId) {
          unknown.push(message);
        } else if (
          (replyTimestamps.get(messageId) ?? Number.NEGATIVE_INFINITY) >
          this.messageTimestamp(message)
        ) {
          replied.push(message);
        } else {
          unreplied.push(message);
        }
      }

      return this.response({
        sender,
        sourceMailboxes,
        sentMailbox,
        totalCandidates: candidates.length,
        repliedCount: replied.length,
        unrepliedCount: unreplied.length,
        unknownCount: unknown.length,
        messages: unreplied.map(message => this.messageForResponse(message, false)),
        unknownMessages: unknown.map(message => ({
          sourceMailbox: message.sourceMailbox,
          uid: message.uid,
          uidValidity: message.uidValidity,
          subject: message.subject,
          date: message.date,
          reason: 'The message has no Message-ID header, so reply state cannot be verified.',
        })),
        note: 'Reply state is determined from In-Reply-To and References headers in the sent mailbox. Messages without a Message-ID are reported as unknown instead of being guessed from their subject.',
      });
    } catch (error) {
      throw new Error(this.formatError(error, 'Find unreplied messages failed'), { cause: error });
    }
  }

  private async collectMessages(
    args: SearchMessagesArgs,
    options: CollectOptions = {},
  ): Promise<CollectedSearch> {
    const imapClient = this.dependencies.getIMAPClient();
    const mailboxes = args.mailboxes || (await this.defaultMailboxes());
    const criteria = this.buildCriteria(args);
    const exactRange = this.parseExactDateRange(args.since, args.before);
    const candidateBudget = options.candidateBudget ?? this.createCandidateBudget();
    const messages: ExtendedEmailMessage[] = [];
    const mailboxesSearched: MailboxSearchResult[] = [];
    let totalMatches = 0;
    let successfulMailboxes = 0;

    for (const mailbox of mailboxes) {
      try {
        console.error(`[IMAP] Searching in mailbox: ${mailbox}`);
        const mailboxInfo = await imapClient.openBox(mailbox, true);
        const uids = await imapClient.search(criteria);
        // UID order is arrival order, not a reliable INTERNALDATE order (for
        // example after imports). Inspect every bounded candidate before
        // sorting so `limit` consistently means the newest matching messages.
        const candidateUIDs = uids;
        const nextUsed = candidateBudget.used + candidateUIDs.length;
        if (nextUsed > candidateBudget.limit) {
          throw new SearchResourceLimitError(
            `Search would inspect ${nextUsed} message headers across the request, exceeding MAIL_MAX_SEARCH_CANDIDATES=${candidateBudget.limit}. Narrow the mailboxes, filters, or date range.`,
          );
        }
        candidateBudget.used = nextUsed;
        const fetched = await this.fetchMessagesInBatches(
          imapClient,
          candidateUIDs,
          false,
          candidateBudget.headerBytes,
        );
        const filtered = fetched.filter(message => this.isWithinExactRange(message, exactRange));

        messages.push(...filtered);
        totalMatches += filtered.length;
        successfulMailboxes += 1;
        mailboxesSearched.push({
          mailbox,
          uidValidity: mailboxInfo.uidvalidity,
          totalMatches: filtered.length,
          returnedCount: filtered.length,
        });
      } catch (error) {
        if (error instanceof SearchResourceLimitError) throw error;
        console.error(`[IMAP] Error searching in ${mailbox}:`, error);
        mailboxesSearched.push({
          mailbox,
          totalMatches: 0,
          returnedCount: 0,
          error: `Failed to search: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }

    if (successfulMailboxes === 0) {
      const errors = mailboxesSearched
        .map(result => `${result.mailbox}: ${result.error}`)
        .join('; ');
      throw new Error(`All mailbox searches failed: ${errors}`);
    }

    const failedCount = mailboxesSearched.length - successfulMailboxes;
    return {
      criteria,
      mailboxesSearched,
      messages,
      totalMatches,
      warning:
        failedCount > 0
          ? `${failedCount} mailbox search(es) failed; inspect mailboxesSearched for details.`
          : undefined,
    };
  }

  private async defaultMailboxes(): Promise<string[]> {
    const sentMailbox = await this.dependencies.findSentMailbox();
    return [...new Set(sentMailbox ? ['INBOX', sentMailbox] : ['INBOX'])];
  }

  private createCandidateBudget(): SearchCandidateBudget {
    return {
      used: 0,
      limit: this.dependencies.maxSearchCandidates,
      headerBytes: {
        used: 0,
        limit: this.dependencies.maxSearchHeaderBytes,
      },
    };
  }

  private createResponseBudget(): { used: number; limit: number } {
    const limit = this.dependencies.maxResponseCharacters;
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new Error('maxResponseCharacters must be a positive safe integer');
    }
    return { used: 0, limit };
  }

  private normalizeThreadSubject(subject: string): string {
    return cleanReplySubject(subject).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  private normalizeSearchArgs(
    args: SearchMessagesArgs,
    limit: number,
    includeBody: boolean,
  ): SearchMessagesArgs {
    if (args.includeBody !== undefined && typeof args.includeBody !== 'boolean') {
      throw new Error('includeBody must be a boolean');
    }
    if (args.unread !== undefined && typeof args.unread !== 'boolean') {
      throw new Error('unread must be a boolean');
    }
    const normalized: SearchMessagesArgs = {
      limit,
      includeBody,
    };
    if (args.mailboxes !== undefined)
      normalized.mailboxes = this.normalizeMailboxes(args.mailboxes);
    if (args.from !== undefined) normalized.from = this.requireString(args.from, 'from');
    if (args.to !== undefined) normalized.to = this.requireString(args.to, 'to');
    if (args.subject !== undefined)
      normalized.subject = this.requireString(args.subject, 'subject');
    if (args.body !== undefined) normalized.body = this.requireString(args.body, 'body');
    if (args.keywords !== undefined) normalized.keywords = this.normalizeKeywords(args.keywords);
    if (args.unread !== undefined) normalized.unread = args.unread;
    if (args.since !== undefined) normalized.since = this.requireString(args.since, 'since');
    if (args.before !== undefined) normalized.before = this.requireString(args.before, 'before');
    this.parseExactDateRange(normalized.since, normalized.before);
    return normalized;
  }

  private buildCriteria(args: SearchMessagesArgs): any[] {
    const criteria: any[] = [];
    if (args.from) criteria.push(['FROM', args.from]);
    if (args.to) criteria.push(['TO', args.to]);
    if (args.subject) criteria.push(['SUBJECT', args.subject]);
    if (args.body) criteria.push(['BODY', args.body]);
    for (const keyword of args.keywords || []) criteria.push(['KEYWORD', keyword]);
    if (args.unread === true) criteria.push('UNSEEN');
    if (args.unread === false) criteria.push('SEEN');

    if (args.since) {
      const since = this.parseDate(args.since, 'since');
      const startOfDay = new Date(since);
      startOfDay.setHours(0, 0, 0, 0);
      // IMAP SINCE compares only the calendar date embedded in INTERNALDATE
      // and explicitly disregards its time and timezone. Imported messages
      // can therefore have an INTERNALDATE calendar day that differs from the
      // same instant in this process's timezone. Widen the server-side query
      // by two days to cover the full UTC+14 to UTC-12 calendar spread, then
      // apply the exact instant bound locally below.
      startOfDay.setDate(startOfDay.getDate() - 2);
      criteria.push(['SINCE', startOfDay]);
    }
    if (args.before) {
      const before = this.parseDate(args.before, 'before');
      const nextDay = new Date(before);
      nextDay.setHours(0, 0, 0, 0);
      if (before.getTime() > nextDay.getTime()) nextDay.setDate(nextDay.getDate() + 1);
      // Add the matching two-day timezone margin on the exclusive upper
      // bound. Exact filtering still uses the original timestamp.
      nextDay.setDate(nextDay.getDate() + 2);
      criteria.push(['BEFORE', nextDay]);
    }

    return criteria.length > 0 ? criteria : ['ALL'];
  }

  private parseExactDateRange(
    sinceValue?: string,
    beforeValue?: string,
  ): { since?: Date; before?: Date } {
    const since = sinceValue ? this.parseDate(sinceValue, 'since') : undefined;
    const before = beforeValue ? this.parseDate(beforeValue, 'before') : undefined;
    if (since && before && since >= before) {
      throw new Error('since must be earlier than before');
    }
    return { since, before };
  }

  private parseDate(value: string, name: string): Date {
    const trimmed = value.trim();
    const dateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let parsed: Date;
    if (dateOnly) {
      const year = Number(dateOnly[1]);
      const month = Number(dateOnly[2]);
      const day = Number(dateOnly[3]);
      parsed = new Date(year, month - 1, day);
      if (
        parsed.getFullYear() !== year ||
        parsed.getMonth() !== month - 1 ||
        parsed.getDate() !== day
      ) {
        throw new Error(`${name} must be a valid calendar date`);
      }
    } else {
      parsed = new Date(trimmed);
    }
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`${name} must be a valid date or ISO date-time`);
    }
    return parsed;
  }

  private isWithinExactRange(
    message: ExtendedEmailMessage,
    range: { since?: Date; before?: Date },
  ): boolean {
    if (!range.since && !range.before) return true;
    const timestamp = this.messageTimestamp(message);
    if (!Number.isFinite(timestamp)) return false;
    return (
      (!range.since || timestamp >= range.since.getTime()) &&
      (!range.before || timestamp < range.before.getTime())
    );
  }

  private async fetchMessagesInBatches(
    imapClient: IMAPClient,
    uids: number[],
    includeBody: boolean,
    byteBudget?: FetchByteBudget,
    responseBudget?: { used: number; limit: number },
  ): Promise<ExtendedEmailMessage[]> {
    const messages: ExtendedEmailMessage[] = [];
    const batchSize = includeBody ? 1 : SEARCH_FETCH_BATCH_SIZE;
    for (let offset = 0; offset < uids.length; offset += batchSize) {
      const batch = uids.slice(offset, offset + batchSize);
      let fetched: EmailMessage[];
      try {
        fetched = await imapClient.fetchMessages(
          batch,
          includeBody
            ? { markSeen: false }
            : {
                bodies: [SEARCH_HEADER_FIELDS],
                struct: false,
                envelope: false,
                markSeen: false,
                byteBudget,
              },
        );
      } catch (error) {
        if (error instanceof FetchByteLimitError && byteBudget) {
          throw new SearchResourceLimitError(
            `Search would buffer more than MAIL_MAX_SEARCH_HEADER_BYTES=${byteBudget.limit} bytes of message header fields across the request. Narrow the mailboxes, filters, or date range.`,
          );
        }
        throw error;
      }
      messages.push(
        ...(includeBody
          ? fetched.map(message => this.messageForResponse(message, true, responseBudget))
          : fetched),
      );
    }
    return messages;
  }

  private async hydrateMessages(
    messages: ExtendedEmailMessage[],
    responseBudget: { used: number; limit: number },
  ): Promise<ExtendedEmailMessage[]> {
    const imapClient = this.dependencies.getIMAPClient();
    const hydratedByRef = new Map<string, ExtendedEmailMessage>();
    const byMailbox = new Map<string, ExtendedEmailMessage[]>();
    for (const message of messages) {
      const existing = byMailbox.get(message.sourceMailbox) || [];
      existing.push(message);
      byMailbox.set(message.sourceMailbox, existing);
    }

    for (const [mailbox, mailboxMessages] of byMailbox) {
      const mailboxInfo = await imapClient.openBox(mailbox, true);
      const expectedUidValidity = mailboxMessages[0]?.uidValidity;
      if (expectedUidValidity !== undefined && mailboxInfo.uidvalidity !== expectedUidValidity) {
        throw new Error(
          `Mailbox UIDVALIDITY changed for ${mailbox}: expected ${expectedUidValidity}, got ${mailboxInfo.uidvalidity}`,
        );
      }
      const fetched = await this.fetchMessagesInBatches(
        imapClient,
        mailboxMessages.map(message => message.uid),
        true,
        undefined,
        responseBudget,
      );
      for (const message of fetched) {
        hydratedByRef.set(this.messageKey(message.sourceMailbox, message.uid), message);
      }
    }

    const missing = messages.filter(
      message => !hydratedByRef.has(this.messageKey(message.sourceMailbox, message.uid)),
    );
    if (missing.length > 0) {
      const refs = missing.map(message => `${message.sourceMailbox}/UID ${message.uid}`).join(', ');
      throw new Error(`Messages disappeared before full-body hydration: ${refs}`);
    }

    return messages.map(message =>
      hydratedByRef.get(this.messageKey(message.sourceMailbox, message.uid))!,
    );
  }

  private messageKey(mailbox: string, uid: number): string {
    return `${mailbox}\u0000${uid}`;
  }

  private collectReplyTimestamps(messages: ExtendedEmailMessage[]): Map<string, number> {
    const referenced = new Map<string, number>();
    for (const message of messages) {
      const timestamp = this.messageTimestamp(message);
      if (!Number.isFinite(timestamp)) continue;
      const values = [message.inReplyTo, ...(message.references || [])];
      for (const value of values) {
        const normalized = this.normalizeMessageId(value);
        if (normalized) {
          referenced.set(
            normalized,
            Math.max(referenced.get(normalized) ?? Number.NEGATIVE_INFINITY, timestamp),
          );
        }
      }
    }
    return referenced;
  }

  private normalizeMessageId(value?: string): string | null {
    if (!value) return null;
    const normalized = value.trim().replace(/^<|>$/g, '').toLowerCase();
    return normalized || null;
  }

  private normalizeMailboxes(value: string[] | undefined, fallback?: string[]): string[] {
    const mailboxes = value ?? fallback;
    if (!Array.isArray(mailboxes) || mailboxes.length === 0) {
      throw new Error('mailboxes must contain at least one mailbox name');
    }
    if (mailboxes.length > 20) throw new Error('mailboxes cannot contain more than 20 entries');
    const normalized = mailboxes.map((mailbox, index) =>
      this.requireString(mailbox, `mailboxes[${index}]`),
    );
    return [
      ...new Map(
        normalized.map(mailbox => [mailbox.toUpperCase() === 'INBOX' ? 'INBOX' : mailbox, mailbox]),
      ).values(),
    ];
  }

  private normalizeKeywords(value: string[]): string[] {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error('keywords must contain at least one custom IMAP keyword');
    }
    if (value.length > 10) throw new Error('keywords cannot contain more than 10 entries');
    const normalized = value.map((keyword, index) => {
      const result = this.requireString(keyword, `keywords[${index}]`);
      if (hasUnsafeImapKeywordCharacter(result)) {
        throw new Error(
          `keywords[${index}] contains characters that are unsafe in an IMAP keyword`,
        );
      }
      return result;
    });
    return [...new Set(normalized)];
  }

  private messageForResponse<T extends EmailMessage>(
    message: T,
    includeBody: boolean,
    responseBudget?: { used: number; limit: number },
  ): T & { textTruncated?: boolean; htmlTruncated?: boolean } {
    const result = { ...message } as T & { textTruncated?: boolean; htmlTruncated?: boolean };
    if (!includeBody) {
      delete result.text;
      delete result.html;
      return result;
    }

    const limit = this.dependencies.maxBodyCharacters;
    if (result.text && result.text.length > limit && !result.textTruncated) {
      result.text = `${result.text.slice(0, limit)}\n\n[truncated]`;
      result.textTruncated = true;
    }
    if (result.html && result.html.length > limit && !result.htmlTruncated) {
      result.html = `${result.html.slice(0, limit)}<!-- truncated -->`;
      result.htmlTruncated = true;
    }
    if (responseBudget) {
      const bodyCharacters = (result.text?.length || 0) + (result.html?.length || 0);
      const nextUsed = responseBudget.used + bodyCharacters;
      if (nextUsed > responseBudget.limit) {
        throw new SearchResourceLimitError(
          `Response bodies would contain ${nextUsed} characters, exceeding MAIL_MAX_RESPONSE_CHARACTERS=${responseBudget.limit}. Lower limit or retrieve messages individually with get_message.`,
        );
      }
      responseBudget.used = nextUsed;
    }
    return result;
  }

  private messageTimestamp(message: EmailMessage): number {
    const timestamp = new Date(message.date).getTime();
    return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
  }

  private requireString(value: unknown, name: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${name} must be a non-empty string`);
    }
    return value.trim();
  }

  private normalizeLimit(value: number | undefined, fallback: number): number {
    if (value !== undefined && (!Number.isInteger(value) || value < 1 || value > 200)) {
      throw new Error('limit must be an integer between 1 and 200');
    }
    return value ?? fallback;
  }

  private response(result: unknown): SearchResponse {
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  private formatError(error: unknown, context: string): string {
    return `${context}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

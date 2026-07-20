import { EmailMessage, IMAPClient } from './imap-client.js';
import { ExtendedEmailMessage, SearchArgs, SearchResult } from './mail-types.js';
import { cleanReplySubject } from './mail-utils.js';

interface MailSearchServiceDependencies {
  ensureIMAPConnection: () => Promise<void>;
  getIMAPClient: () => IMAPClient;
  findSentMailbox: () => Promise<string | null>;
  maxBodyCharacters: number;
}

type SearchResponse = {
  content: Array<{ type: 'text'; text: string }>;
};

export class MailSearchService {
  constructor(private readonly dependencies: MailSearchServiceDependencies) {}

  async searchBySender(args: SearchArgs): Promise<SearchResponse> {
    const sender = this.requireString(args.sender, 'sender');
    return this.runSearch(
      args,
      [['FROM', sender]],
      'By Sender',
      sender,
      'Search by sender failed',
      result => { result.sender = sender; }
    );
  }

  async searchBySubject(args: SearchArgs): Promise<SearchResponse> {
    const subject = this.requireString(args.subject, 'subject');
    return this.runSearch(
      args,
      [['SUBJECT', subject]],
      'By Subject',
      subject,
      'Search by subject failed',
      result => { result.subjectKeywords = subject; }
    );
  }

  async searchByRecipient(args: SearchArgs): Promise<SearchResponse> {
    const recipient = this.requireString(args.recipient, 'recipient');
    return this.runSearch(
      args,
      [['TO', recipient]],
      'By Recipient',
      recipient,
      'Search by recipient failed',
      result => { result.recipient = recipient; }
    );
  }

  async searchSinceDate(args: SearchArgs): Promise<SearchResponse> {
    const date = this.requireString(args.date, 'date');

    try {
      await this.dependencies.ensureIMAPConnection();
      const parsedDate = new Date(date);
      if (Number.isNaN(parsedDate.getTime())) {
        throw new Error(`Invalid date format: ${date}. Use formats like "2026-03-17", "17-Mar-2026", or "March 17, 2026"`);
      }

      const result = await this.searchInMultipleMailboxes(
        [['SINCE', parsedDate]],
        'Since Date',
        date,
        '',
        '',
        args.inboxOnly ?? false
      );
      result.sinceDate = date;
      result.note = 'Date format should be like "April 20, 2010" or "20-Apr-2010". Searched across multiple mailboxes.';
      return this.response(result);
    } catch (error) {
      throw new Error(this.formatError(error, 'Search since date failed'));
    }
  }

  async searchUnreadFromSender(args: SearchArgs): Promise<SearchResponse> {
    const sender = this.requireString(args.sender, 'sender');
    return this.runSearch(
      args,
      ['UNSEEN', ['FROM', sender]],
      'Unread messages from specific sender',
      sender,
      'Search unread from sender failed',
      result => {
        result.sender = sender;
        result.note = 'By default, all criteria are ANDed together - finds messages that are BOTH unread AND from the specified sender. Searched across multiple mailboxes.';
      }
    );
  }

  async searchUnrepliedFromSender(args: SearchArgs): Promise<SearchResponse> {
    const sender = this.requireString(args.sender, 'sender');
    const startDate = args.startDate ?? '';
    const endDate = args.endDate ?? '';
    const limit = this.normalizeLimit(args.limit, 10);

    try {
      await this.dependencies.ensureIMAPConnection();
      console.error(`[IMAP] Searching unreplied messages from sender: ${sender}`);

      const fromSenderResult = await this.searchInMultipleMailboxes(
        [['FROM', sender]],
        'From Sender',
        sender,
        startDate,
        endDate,
        args.inboxOnly ?? false,
        limit
      );
      const toSenderResult = await this.searchInMultipleMailboxes(
        [['TO', sender]],
        'To Sender',
        sender,
        startDate,
        endDate,
        args.inboxOnly ?? false,
        limit
      );

      console.error(`[IMAP] Found ${fromSenderResult.messages.length} messages from sender, ${toSenderResult.messages.length} messages to sender`);
      const unrepliedMessages = this.detectUnrepliedMessages(
        fromSenderResult.messages,
        toSenderResult.messages,
        limit
      );

      const result: SearchResult = {
        searchType: 'Unreplied messages from sender (Advanced)',
        searchValue: sender,
        searchCriteria: ['FROM', sender],
        mailboxesSearched: fromSenderResult.mailboxesSearched,
        totalMatches: unrepliedMessages.length,
        returnedCount: unrepliedMessages.length,
        messages: unrepliedMessages,
        sender,
        note: `Found ${unrepliedMessages.length} unreplied messages from ${sender} using advanced thread-aware detection.${limit < 200 ? ` (limited to ${limit} messages per search)` : ''}`
      };
      if (startDate) result.startDate = startDate;
      if (endDate) result.endDate = endDate;
      if (startDate || endDate) result.note += ' (filtered by date range)';

      return this.response(result);
    } catch (error) {
      throw new Error(this.formatError(error, 'Search unreplied from sender failed'));
    }
  }

  async searchByBody(args: SearchArgs): Promise<SearchResponse> {
    const bodyText = this.requireString(args.text, 'text');
    return this.runSearch(
      args,
      [['BODY', bodyText]],
      'By Body Text',
      bodyText,
      'Search by body failed',
      result => { result.bodyText = bodyText; }
    );
  }

  async searchWithKeyword(args: SearchArgs): Promise<SearchResponse> {
    const keyword = this.requireString(args.keyword, 'keyword');
    return this.runSearch(
      args,
      [['KEYWORD', keyword]],
      'With Keyword',
      keyword,
      'Search with keyword failed',
      result => { result.keyword = keyword; }
    );
  }

  async searchAllMessages(args: SearchArgs): Promise<SearchResponse> {
    const startDate = args.startDate ?? '';
    const endDate = args.endDate ?? '';
    const limit = this.normalizeLimit(args.limit, 50);

    try {
      await this.dependencies.ensureIMAPConnection();
      const result = await this.searchInMultipleMailboxes(
        ['ALL'],
        'All Messages',
        '*',
        startDate,
        endDate,
        args.inboxOnly ?? false,
        limit
      );
      this.addDateMetadata(result, startDate, endDate);
      return this.response(result);
    } catch (error) {
      throw new Error(this.formatError(error, 'Search all messages failed'));
    }
  }

  private async runSearch(
    args: SearchArgs,
    criteria: any[],
    searchType: string,
    searchValue: string,
    errorContext: string,
    decorate?: (result: SearchResult) => void
  ): Promise<SearchResponse> {
    const startDate = args.startDate ?? '';
    const endDate = args.endDate ?? '';

    try {
      await this.dependencies.ensureIMAPConnection();
      const result = await this.searchInMultipleMailboxes(
        criteria,
        searchType,
        searchValue,
        startDate,
        endDate,
        args.inboxOnly ?? false
      );
      decorate?.(result);
      this.addDateMetadata(result, startDate, endDate);
      return this.response(result);
    } catch (error) {
      throw new Error(this.formatError(error, errorContext));
    }
  }

  private async searchInMultipleMailboxes(
    criteria: any[],
    searchType: string,
    searchValue: string,
    startDate = '',
    endDate = '',
    inboxOnly = false,
    limit = 50
  ): Promise<SearchResult> {
    const sentMailbox = inboxOnly ? null : await this.dependencies.findSentMailbox();
    const candidateMailboxes = [...new Set(sentMailbox ? ['INBOX', sentMailbox] : ['INBOX'])];
    const effectiveLimit = this.normalizeLimit(limit, 50);
    const imapClient = this.dependencies.getIMAPClient();
    const result: SearchResult = {
      searchType,
      searchValue,
      searchCriteria: criteria,
      mailboxesSearched: [],
      totalMatches: 0,
      messages: []
    };

    for (const mailbox of candidateMailboxes) {
      try {
        console.error(`[IMAP] Searching in mailbox: ${mailbox}`);
        const mailboxInfo = await imapClient.openBox(mailbox, true);
        const uids = await imapClient.search(criteria);
        const limitedUIDs = uids.slice(-effectiveLimit);
        let messages: ExtendedEmailMessage[] = [];

        if (limitedUIDs.length > 0) {
          const fetched = await imapClient.fetchMessages(limitedUIDs);
          messages = fetched.map(message => ({
            ...message,
            sourceMailbox: mailbox,
            uidValidity: mailboxInfo.uidvalidity
          }));
          messages = this.filterMessagesByDateRange(messages, startDate, endDate);
          result.messages.push(...messages);
        }

        result.mailboxesSearched.push({
          mailbox,
          uidValidity: mailboxInfo.uidvalidity,
          matchingUIDs: messages.map(message => message.uid),
          messageCount: messages.length
        });
      } catch (error) {
        console.error(`[IMAP] Error searching in ${mailbox}:`, error);
        result.mailboxesSearched.push({
          mailbox,
          error: `Failed to search: ${error instanceof Error ? error.message : String(error)}`,
          matchingUIDs: [],
          messageCount: 0
        });
      }
    }

    result.totalMatches = result.messages.length;
    result.messages.sort((left, right) => new Date(right.date || 0).getTime() - new Date(left.date || 0).getTime());
    result.messages = result.messages
      .slice(0, effectiveLimit)
      .map(message => this.messageForResponse(message));
    result.returnedCount = result.messages.length;

    if (result.totalMatches > 0) {
      result.note = `Found ${result.totalMatches} matching messages and returned ${result.returnedCount} across ${result.mailboxesSearched.length} mailboxes`;
      if (startDate || endDate) result.note += ' (filtered by date range)';
    } else {
      result.note = 'No messages found in any of the searched mailboxes';
    }
    if (!inboxOnly && !sentMailbox) {
      result.warning = 'Could not find sent mailbox - only searched INBOX';
    }

    return result;
  }

  private filterMessagesByDateRange(
    messages: ExtendedEmailMessage[],
    startDate?: string,
    endDate?: string
  ): ExtendedEmailMessage[] {
    if (!startDate && !endDate) return messages;

    const start = startDate ? this.parseFilterDate(startDate, false) : null;
    const end = endDate ? this.parseFilterDate(endDate, true) : null;
    if (start && end && start > end) {
      throw new Error('startDate must not be after endDate');
    }

    return messages.filter(message => {
      if (!message.date) return true;
      const messageDate = new Date(message.date);
      if (Number.isNaN(messageDate.getTime())) return true;
      return (!start || messageDate >= start) && (!end || messageDate <= end);
    });
  }

  private parseFilterDate(value: string, endOfDay: boolean): Date {
    const trimmed = value.trim();
    const isoDateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let parsed: Date;

    if (isoDateOnly) {
      const [, year, month, day] = isoDateOnly;
      parsed = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        endOfDay ? 23 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 59 : 0,
        endOfDay ? 999 : 0
      );
    } else {
      parsed = new Date(trimmed);
      if (endOfDay && this.isDateOnly(trimmed)) parsed.setHours(23, 59, 59, 999);
    }

    if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date format: ${value}`);
    return parsed;
  }

  private isDateOnly(value: string): boolean {
    return [
      /^\d{4}-\d{2}-\d{2}$/,
      /^\d{2}-\w{3}-\d{4}$/,
      /^\w{3}\s+\d{1,2},?\s+\d{4}$/
    ].some(pattern => pattern.test(value.trim()));
  }

  private detectUnrepliedMessages(
    receivedMessages: ExtendedEmailMessage[],
    sentMessages: ExtendedEmailMessage[],
    limit: number
  ): ExtendedEmailMessage[] {
    const received = [...receivedMessages]
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
      .slice(0, 100);
    const sent = [...sentMessages]
      .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
    const unreplied: ExtendedEmailMessage[] = [];

    for (const message of received) {
      if (!this.isMessageReplied(message, sent)) unreplied.push(message);
      if (unreplied.length >= limit) break;
    }
    return unreplied;
  }

  private isMessageReplied(original: ExtendedEmailMessage, sentMessages: ExtendedEmailMessage[]): boolean {
    const originalDate = new Date(original.date);
    const originalSubject = cleanReplySubject(original.subject || '').toLowerCase();

    if (original.messageId && sentMessages.some(sent => {
      const sentDate = new Date(sent.date);
      return sentDate > originalDate && (
        sent.inReplyTo === original.messageId || sent.references?.includes(original.messageId!)
      );
    })) {
      return true;
    }

    if (sentMessages.some(sent => {
      const subject = cleanReplySubject(sent.subject || '').toLowerCase();
      return new Date(sent.date) > originalDate && subject.length > 0 && subject === originalSubject;
    })) {
      return true;
    }

    if (originalSubject.length > 3 && sentMessages.some(sent => {
      const subject = cleanReplySubject(sent.subject || '').toLowerCase();
      return new Date(sent.date) > originalDate && subject !== originalSubject && subject.includes(originalSubject);
    })) {
      return true;
    }

    const windowEnd = new Date(originalDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    return sentMessages.some(sent => {
      const sentDate = new Date(sent.date);
      return sentDate > originalDate && sentDate <= windowEnd && this.isLikelyReplyByContent(original, sent);
    });
  }

  private isLikelyReplyByContent(original: ExtendedEmailMessage, potentialReply: ExtendedEmailMessage): boolean {
    const originalSubject = cleanReplySubject(original.subject || '').toLowerCase();
    const replySubject = cleanReplySubject(potentialReply.subject || '').toLowerCase();
    if (originalSubject.length > 0 && originalSubject === replySubject) return true;
    if (originalSubject.length > 5 && replySubject.includes(originalSubject)) return true;

    const originalWords = originalSubject.split(/\s+/).filter(word => word.length > 3);
    const replyWords = replySubject.split(/\s+/).filter(word => word.length > 3);
    if (originalWords.length === 0 || replyWords.length === 0) return false;
    const commonWords = originalWords.filter(word => replyWords.includes(word));
    return commonWords.length >= Math.min(2, Math.ceil(originalWords.length / 2));
  }

  private messageForResponse<T extends EmailMessage>(message: T): T & { textTruncated?: boolean; htmlTruncated?: boolean } {
    const result = { ...message } as T & { textTruncated?: boolean; htmlTruncated?: boolean };
    const limit = this.dependencies.maxBodyCharacters;
    if (result.text && result.text.length > limit) {
      result.text = `${result.text.slice(0, limit)}\n\n[truncated]`;
      result.textTruncated = true;
    }
    if (result.html && result.html.length > limit) {
      result.html = `${result.html.slice(0, limit)}<!-- truncated -->`;
      result.htmlTruncated = true;
    }
    return result;
  }

  private requireString(value: string | undefined, name: string): string {
    if (!value) throw new Error(`${name} parameter is required`);
    return value;
  }

  private normalizeLimit(value: number | undefined, fallback: number): number {
    return Math.min(Math.max(Number.isInteger(value) ? value! : fallback, 1), 200);
  }

  private addDateMetadata(result: SearchResult, startDate: string, endDate: string): void {
    if (startDate) result.startDate = startDate;
    if (endDate) result.endDate = endDate;
  }

  private response(result: SearchResult): SearchResponse {
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  private formatError(error: unknown, context: string): string {
    return `${context}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

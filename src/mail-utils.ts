import type { EmailSignature } from './mail-types';

export interface MailContent {
  text?: string;
  html?: string;
}

export const DEFAULT_EMAIL_HTML_STYLE =
  [
    'font-family: -apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, Noto Sans CJK SC, Arial, sans-serif',
    'font-size: 14px',
    'line-height: 1.6',
    'color: #222',
  ].join('; ') + ';';

export function applyDefaultHtmlStyle(html: string | undefined): string | undefined {
  if (html === undefined) return undefined;

  const bodyMatch = /<body\b([^>]*)>/i.exec(html);
  if (!bodyMatch) {
    return `<div style="${DEFAULT_EMAIL_HTML_STYLE}">${html}</div>`;
  }

  const attributes = bodyMatch[1] || '';
  const existingStyle = /\sstyle\s*=\s*(["'])([\s\S]*?)\1/i.exec(attributes);
  let styledAttributes: string;
  if (existingStyle) {
    const userStyle = existingStyle[2].trim();
    const mergedStyle = `${DEFAULT_EMAIL_HTML_STYLE}${userStyle ? ` ${userStyle}` : ''}`;
    styledAttributes = attributes.replace(
      existingStyle[0],
      ` style=${existingStyle[1]}${mergedStyle}${existingStyle[1]}`,
    );
  } else {
    styledAttributes = `${attributes} style="${DEFAULT_EMAIL_HTML_STYLE}"`;
  }

  return html.replace(bodyMatch[0], `<body${styledAttributes}>`);
}

export function extractEmailFromAddress(addressField: any): string | null {
  return extractEmailsFromAddressField(addressField)[0] || null;
}

export function extractEmailsFromAddressField(addressField: any): string[] {
  if (!addressField) return [];
  const collected: string[] = [];
  const visit = (value: any): void => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'string') {
      const matches = value.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      if (matches) {
        collected.push(...matches);
      } else if (value.trim()) {
        collected.push(value.trim());
      }
      return;
    }
    if (typeof value === 'object') {
      if (typeof value.address === 'string') visit(value.address);
      if (Array.isArray(value.value)) visit(value.value);
      if (Array.isArray(value.group)) visit(value.group);
      if (!value.address && !value.value && !value.group && typeof value.text === 'string')
        visit(value.text);
    }
  };

  visit(addressField);
  return [...new Map(collected.map(address => [address.toLowerCase(), address])).values()];
}

export function buildReplyRecipients(
  originalFrom: unknown,
  originalReplyTo: unknown,
  originalTo: unknown,
  originalCc: unknown,
  ownAddresses: string[],
  replyToAll: boolean,
): { to: string[]; cc: string[] } {
  const own = new Set(
    ownAddresses
      .flatMap(address => extractEmailsFromAddressField(address))
      .map(address => address.toLowerCase()),
  );
  const unique = (addresses: string[]) => [
    ...new Map(
      addresses
        .map(address => address.trim())
        .filter(Boolean)
        .map(address => [address.toLowerCase(), address]),
    ).values(),
  ];
  const withoutOwn = (addresses: string[]) =>
    unique(addresses).filter(address => !own.has(address.toLowerCase()));

  const replyTargets = extractEmailsFromAddressField(originalReplyTo);
  const senderTargets = extractEmailsFromAddressField(originalFrom);
  let to = withoutOwn(replyTargets.length > 0 ? replyTargets : senderTargets);
  const originalToAddresses = withoutOwn(extractEmailsFromAddressField(originalTo));
  const originalCcAddresses = withoutOwn(extractEmailsFromAddressField(originalCc));

  // Replying to a message from the configured account (for example from Sent)
  // should target its original recipients instead of producing an empty To list.
  if (to.length === 0) {
    to = originalToAddresses;
  }

  if (!replyToAll) return { to, cc: [] };

  const primary = new Set(to.map(address => address.toLowerCase()));
  const cc = unique([...originalToAddresses, ...originalCcAddresses]).filter(
    address => !primary.has(address.toLowerCase()),
  );
  return { to, cc };
}

export function cleanReplySubject(subject: string): string {
  if (!subject) return '';
  const prefixPattern = /^(?:re:|回复:|答复:)\s*/i;
  let cleaned = subject.trim();
  let previous: string;
  do {
    previous = cleaned;
    cleaned = cleaned.replace(prefixPattern, '').trim();
  } while (cleaned !== previous);
  return cleaned;
}

export function buildQuotedText(originalText: string, date: string, from: string): string {
  const lines = originalText.split('\n').map(line => `> ${line}`);
  return `On ${date}, ${from} wrote:\n${lines.join('\n')}`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildQuotedHtml(originalContent: string, date: string, from: string): string {
  const escapedDate = escapeHtml(date);
  const escapedFrom = escapeHtml(from);
  const quotedContent = escapeHtml(originalContent).replace(/\n/g, '<br>');
  return `<div style="border-left: 3px solid #ccc; padding-left: 10px; margin-left: 10px; color: #666;">
    <p><strong>On ${escapedDate}, ${escapedFrom} wrote:</strong></p>
    <div>${quotedContent}</div>
  </div>`;
}

export function textToHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br>').replace(/ {2}/g, '&nbsp;&nbsp;');
}

export function ensureHtmlAlternative(content: MailContent): MailContent {
  return {
    text: content.text,
    html: content.html ?? (content.text !== undefined ? textToHtml(content.text) : undefined),
  };
}

export function htmlToPlainText(html: string): string {
  const decodeCodePoint = (match: string, value: string, radix: number): string => {
    const codePoint = Number.parseInt(value, radix);
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : match;
  };
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (match, value) => decodeCodePoint(match, value, 10))
    .replace(/&#x([0-9a-f]+);/gi, (match, value) => decodeCodePoint(match, value, 16))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function appendSignature(
  text: string | undefined,
  html: string | undefined,
  signature?: EmailSignature,
): MailContent {
  const signatureText =
    typeof signature?.text === 'string' && signature.text.trim() ? signature.text : undefined;
  const signatureHtml =
    typeof signature?.html === 'string' && signature.html.trim() ? signature.html : undefined;

  if (!signatureText && !signatureHtml) {
    return { text, html };
  }

  const finalText = text && signatureText ? `${text}\n\n${signatureText}` : text;

  let finalHtml = html;
  const htmlSignature = signatureHtml || (signatureText ? textToHtml(signatureText) : undefined);
  if (htmlSignature) {
    if (html) {
      finalHtml = `${html}<br><br><div class="mcp-mail-signature">${htmlSignature}</div>`;
    } else if (text && signatureHtml) {
      finalHtml = `${textToHtml(text)}<br><br><div class="mcp-mail-signature">${signatureHtml}</div>`;
    }
  }

  return { text: finalText, html: finalHtml };
}

export function appendQuotedOriginal(
  content: MailContent,
  originalText: string | undefined,
  originalHtml: string | undefined,
  date: string,
  from: string,
  maxCharacters?: number,
): MailContent {
  const originalPlainText =
    originalText && originalText.trim() ? originalText : htmlToPlainText(originalHtml || '');
  const finalText =
    content.text !== undefined
      ? composeQuotedAlternative(
          content.text,
          '\n\n',
          originalPlainText,
          value => buildQuotedText(value, date, from),
          maxCharacters,
        )
      : undefined;

  const finalHtml =
    content.html !== undefined
      ? composeQuotedAlternative(
          content.html,
          '<br><br>',
          originalPlainText,
          value => buildQuotedHtml(value, date, from),
          maxCharacters,
        )
      : undefined;

  return { text: finalText, html: finalHtml };
}

function composeQuotedAlternative(
  newContent: string,
  separator: string,
  originalContent: string,
  renderQuote: (value: string) => string,
  maxCharacters?: number,
): string {
  const compose = (value: string) => `${newContent}${separator}${renderQuote(value)}`;
  const complete = compose(originalContent);
  if (maxCharacters === undefined || complete.length <= maxCharacters) return complete;

  const marker = '[quoted content truncated]';
  let best: string | undefined;
  let low = 0;
  // No rendered quote can contain more source characters than the entire
  // output limit, and HTML escaping can only increase the rendered length.
  let high = Math.min(originalContent.length, maxCharacters);

  while (low <= high) {
    const prefixLength = Math.floor((low + high) / 2);
    const prefix = originalContent.slice(0, prefixLength).trimEnd();
    const truncatedOriginal = prefix ? `${prefix}\n${marker}` : marker;
    const candidate = compose(truncatedOriginal);
    if (candidate.length <= maxCharacters) {
      best = candidate;
      low = prefixLength + 1;
    } else {
      high = prefixLength - 1;
    }
  }

  // The new reply and signature were validated separately. If even the quote
  // header plus truncation marker cannot fit, preserve the new content rather
  // than failing an otherwise valid reply.
  return best ?? newContent;
}

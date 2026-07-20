export function extractEmailFromAddress(addressField: any): string | null {
  if (!addressField) return null;

  if (Array.isArray(addressField) && addressField.length > 0) {
    return addressField[0].address || addressField[0];
  }

  if (typeof addressField === 'string') {
    const match = addressField.match(/<([^>]+)>/) || addressField.match(/([^\s<>]+@[^\s<>]+)/);
    return match ? match[1] : addressField;
  }

  return addressField.address || null;
}

export function extractEmailsFromAddressField(addressField: any): string[] {
  if (!addressField) return [];

  if (Array.isArray(addressField)) {
    return addressField.map(addr => addr.address || addr).filter(Boolean);
  }

  if (typeof addressField === 'string') {
    return addressField.split(',').map(email => {
      const match = email.trim().match(/<([^>]+)>/) || email.trim().match(/([^\s<>]+@[^\s<>]+)/);
      return match ? match[1] : email.trim();
    }).filter(Boolean);
  }

  const extracted = extractEmailFromAddress(addressField);
  return extracted ? [extracted] : [];
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
  return escapeHtml(text).replace(/\n/g, '<br>').replace(/  /g, '&nbsp;&nbsp;');
}

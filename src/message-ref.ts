export interface MessageRef {
  mailbox: string;
  uid: number;
  uidValidity?: number;
}

export interface MoveMessageRef extends MessageRef {
  targetMailbox: string;
}

export function parseMessageRef(value: unknown, uidField: string = 'uid'): MessageRef {
  if (!value || typeof value !== 'object') {
    throw new Error('message reference must be an object');
  }

  const input = value as Record<string, unknown>;
  const mailbox = typeof input.mailbox === 'string' ? input.mailbox.trim() : '';
  const uid = input[uidField];
  const uidValidity = input.uidValidity;

  if (!mailbox) {
    throw new Error('mailbox must be a non-empty string');
  }
  if (!Number.isInteger(uid) || (uid as number) <= 0) {
    throw new Error(`${uidField} must be a positive integer`);
  }
  if (uidValidity !== undefined && (!Number.isInteger(uidValidity) || (uidValidity as number) <= 0)) {
    throw new Error('uidValidity must be a positive integer when provided');
  }

  return {
    mailbox,
    uid: uid as number,
    uidValidity: uidValidity as number | undefined,
  };
}

export function parseMoveMessageRef(value: unknown): MoveMessageRef {
  const ref = parseMessageRef(value);
  const input = value as Record<string, unknown>;
  const targetMailbox = typeof input.targetMailbox === 'string' ? input.targetMailbox.trim() : '';

  if (!targetMailbox) {
    throw new Error('targetMailbox must be a non-empty string');
  }

  const bothInbox = ref.mailbox.toUpperCase() === 'INBOX' && targetMailbox.toUpperCase() === 'INBOX';
  if (ref.mailbox === targetMailbox || bothInbox) {
    throw new Error('targetMailbox must be different from the source mailbox');
  }

  return {
    ...ref,
    targetMailbox,
  };
}

export interface MessageRef {
  mailbox: string;
  uid: number;
  uidValidity?: number;
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

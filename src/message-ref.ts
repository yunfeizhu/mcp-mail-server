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
  if (
    uidValidity !== undefined &&
    (!Number.isInteger(uidValidity) || (uidValidity as number) <= 0)
  ) {
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

  const bothInbox =
    ref.mailbox.toUpperCase() === 'INBOX' && targetMailbox.toUpperCase() === 'INBOX';
  if (ref.mailbox === targetMailbox || bothInbox) {
    throw new Error('targetMailbox must be different from the source mailbox');
  }

  return {
    ...ref,
    targetMailbox,
  };
}

export const MAX_BATCH_UIDS = 200;

/**
 * Validate a batch of UIDs for the plural move/delete tools.
 *
 * The zod input schema already enforces these rules for well-behaved callers;
 * this mirrors the defensive validation `handleGetMessages` performs so the
 * handlers stay safe when invoked with unvalidated input.
 */
export function parseUidBatch(value: unknown, max: number = MAX_BATCH_UIDS): number[] {
  if (!Array.isArray(value)) {
    throw new Error('uids must be an array of positive integers');
  }
  if (value.some(uid => !Number.isInteger(uid) || (uid as number) <= 0)) {
    throw new Error('uids must be an array of positive integers');
  }
  if (value.length === 0 || value.length > max) {
    throw new Error(`uids must contain between 1 and ${max} entries`);
  }
  if (new Set(value).size !== value.length) {
    throw new Error('uids must not contain duplicates');
  }
  return value as number[];
}

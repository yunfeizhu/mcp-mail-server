export interface MessageRef {
  mailbox: string;
  uid: number;
  uidValidity?: number;
}

export interface MoveMessageRef extends MessageRef {
  targetMailbox: string;
}

/** Validate an opaque IMAP mailbox name without changing significant whitespace. */
export function parseMailboxName(value: unknown, name: string = 'mailbox'): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

/** Validate a mailbox-local UID and optional UIDVALIDITY without rewriting its mailbox. */
export function parseMessageRef(value: unknown, uidField: string = 'uid'): MessageRef {
  if (!value || typeof value !== 'object') {
    throw new Error('message reference must be an object');
  }

  const input = value as Record<string, unknown>;
  const mailbox = parseMailboxName(input.mailbox);
  const uid = input[uidField];
  const uidValidity = input.uidValidity;

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

/** Validate exact source/destination names, treating only INBOX as case-insensitive. */
export function parseMoveMessageRef(value: unknown): MoveMessageRef {
  const ref = parseMessageRef(value);
  const input = value as Record<string, unknown>;
  const targetMailbox = parseMailboxName(input.targetMailbox, 'targetMailbox');

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

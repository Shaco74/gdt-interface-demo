import { GdtParseError } from '../types/errors.js';
import type { GdtParsedLine } from '../types/records.js';

const LENGTH_DIGITS = 3;
const FK_WIDTH = 4;

/**
 * Builds a fully qualified GDT physical row including CRLF terminators required by FK `8xxx`.
 *
 * @param fieldId — Exactly four decimal digits (FK).
 * @param payload — Raw field content **without** length prefix, FK, or line terminators.
 *
 * @returns One line: three-digit LLL, FK, payload, then `\r\n`.
 *
 * @throws {@link GdtParseError} If FK is not four numeric digits or the row would exceed LLL `999`.
 *
 * @remarks The three-digit length equals `LENGTH + FK + payload + CRLF`.
 */
export function buildGdtLine(fieldId: string, payload: string): string {
  if (fieldId.length !== FK_WIDTH) {
    throw new GdtParseError(`FK must be exactly 4 digits — received "${fieldId}".`);
  }
  if (!/^\d{4}$/.test(fieldId)) {
    throw new GdtParseError(`FK must be numeric — received "${fieldId}".`);
  }
  const body = `${fieldId}${payload}`;
  const totalLength = LENGTH_DIGITS + body.length + 2;
  if (totalLength > 999) {
    throw new GdtParseError(`GDT rows may not exceed declared length header 999 (got ${totalLength}).`);
  }
  return `${totalLength.toString().padStart(3, '0')}${body}\r\n`;
}

/**
 * Splits a whole document into non-empty logical rows (no trailing CRLF on each segment).
 *
 * Normalises `\r\n` and lone `\r` to `\n`, then splits. Empty lines are dropped.
 *
 * @param payload — Raw multi-line GDT body as read from disk or transport.
 */
export function splitLogicalRows(payload: string): string[] {
  const normalized = payload.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized.split('\n').filter((row) => row.length > 0);
}

/**
 * Parses one logical row according to GDT framing: `LLL` + `FK` + content (terminators **not** included).
 *
 * @param rawRow — Single line as returned by {@link splitLogicalRows}.
 * @param strictLengths — When `true`, declared LLL must equal `3 + 4 + content.length + 2` (physical row with CRLF).
 *
 * @returns Parsed length header, FK, payload content, and original `rawBody` slice.
 *
 * @throws {@link GdtParseError} On malformed length, FK, or length mismatch in strict mode.
 */
export function parseLogicalRow(rawRow: string, strictLengths: boolean): GdtParsedLine {
  const min = LENGTH_DIGITS + FK_WIDTH;
  if (rawRow.length < min) {
    throw new GdtParseError('Row shorter than LENGTH + FK allows.');
  }
  // 10 is the base for the number system -> this is a function that parses the length header
  const declared = Number.parseInt(rawRow.slice(0, LENGTH_DIGITS), 10);
  if (!Number.isFinite(declared)) {
    throw new GdtParseError(`Invalid LENGTH header "${rawRow.slice(0, LENGTH_DIGITS)}".`);
  }
  const fieldId = rawRow.slice(LENGTH_DIGITS, min);
  // Check if the field ID is exactly 4 digits
  if (!/^\d{4}$/.test(fieldId)) {
    throw new GdtParseError(`Malformed FK segment "${fieldId}".`);
  }
  const content = rawRow.slice(min);
  // Calculate the expected physical length
  const expectedPhysical = LENGTH_DIGITS + FK_WIDTH + content.length + 2;
  if (strictLengths && declared !== expectedPhysical) {
    throw new GdtParseError(
      `LENGTH ${declared} mismatches reconstructed row (${expectedPhysical}) for FK ${fieldId}.`,
    );
  }
  return {
    declaredTotalLength: declared,
    fieldId,
    content,
    rawBody: rawRow,
  };
}

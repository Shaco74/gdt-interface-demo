import { GdtParseError } from '../types/errors.js';
import type { GdtParsedLine } from '../types/records.js';

const LENGTH_DIGITS = 3;
const FK_WIDTH = 4;

/**
 * Builds a fully qualified GDT physical row including CRLF terminators required by FK `8xxx`.
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

/** Splits textual payload while honouring CRLF first, then LF only. */
export function splitLogicalRows(payload: string): string[] {
  const normalized = payload.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized.split('\n').filter((row) => row.length > 0);
}

/** Parses payload without terminator according to GDT framing. */
export function parseLogicalRow(rawRow: string, strictLengths: boolean): GdtParsedLine {
  const min = LENGTH_DIGITS + FK_WIDTH;
  if (rawRow.length < min) {
    throw new GdtParseError('Row shorter than LENGTH + FK allows.');
  }
  const declared = Number.parseInt(rawRow.slice(0, LENGTH_DIGITS), 10);
  if (!Number.isFinite(declared)) {
    throw new GdtParseError(`Invalid LENGTH header "${rawRow.slice(0, LENGTH_DIGITS)}".`);
  }
  const fieldId = rawRow.slice(LENGTH_DIGITS, min);
  if (!/^\d{4}$/.test(fieldId)) {
    throw new GdtParseError(`Malformed FK segment "${fieldId}".`);
  }
  const content = rawRow.slice(min);
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

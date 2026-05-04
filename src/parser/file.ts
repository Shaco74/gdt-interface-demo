import { parseLogicalRow, splitLogicalRows } from './line.js';
import { GDT_FIELD_IDS } from '../types/fields.js';
import { GdtParseError } from '../types/errors.js';
import type { GdtGender } from '../types/gender.js';
import type { GdtParsedLine } from '../types/records.js';

/**
 * Whole-file parse snapshot: every logical row as a structured line plus a multi-map of FK → payloads.
 *
 * `lines` preserves document order from {@link splitLogicalRows}. `fieldBuckets` appends each payload
 * under its four-digit FK (raw `content` only — e.g. DOB `01011977`, gender `1`/`2` as strings).
 *
 * @example
 * Two logical rows `01030002` and `0193101Mustermann` yield roughly:
 * ```ts
 * {
 *   lines: [
 *     { 
 *       declaredTotalLength: 10, 
 *       fieldId: "3000", -> Patient ID
 *       content: "2", 
 *       rawBody: "01030002" 
 *     },
 *     {
 *       declaredTotalLength: 19,
 *       fieldId: "3101", -> Last Name
 *       content: "Mustermann",
 *       rawBody: "0193101Mustermann",
 *     },
 *   ],
 *   fieldBuckets: new Map([
 *     ["3000", ["2"]],
 *     ["3101", ["Mustermann"]],
 *   ]),
 * }
 * ```
 * (`rawBody` = segment from {@link splitLogicalRows} without line terminator; LLL = declared physical length incl. CRLF.)
 */
export interface ParsedGdtFile {
  readonly lines: readonly GdtParsedLine[];
  readonly fieldBuckets: Map<string, string[]>;
}

/**
 * Normalises raw GDT file text into structured lines and FK buckets.
 *
 * Strips a leading UTF-8 BOM, trims outer whitespace, splits on line breaks, then parses each non-empty
 * row with {@link parseLogicalRow}. Unknown or device-specific FKs are still captured in `fieldBuckets`.
 *
 * @param raw — Full document body (typically `latin1`-decoded bytes interpreted as a string).
 * @param strictLengths — When `true`, declared LLL must match reconstructed row length (incl. implied CRLF).
 *
 * @returns {@link ParsedGdtFile} — ordered `lines`, mutable `fieldBuckets`; shape in **@example** on that type.
 *
 * @throws {@link GdtParseError} When any row fails to parse; the message includes the 1-based failing row index.
 */
export function ingestGdtText(raw: string, strictLengths: boolean): ParsedGdtFile {
  const fieldBuckets = new Map<string, string[]>();
  const lines: GdtParsedLine[] = [];
  let index = 0;
  try {
    const trimmed = raw.replace(/^\uFEFF/, '').trim();
    for (const logical of splitLogicalRows(trimmed)) {
      const parsed = parseLogicalRow(logical, strictLengths);
      lines.push(parsed);
      const bucket = fieldBuckets.get(parsed.fieldId) ?? [];
      bucket.push(parsed.content);
      fieldBuckets.set(parsed.fieldId, bucket);
      index += 1;
    }
    return { lines, fieldBuckets };
  } catch (error) {
    throw new GdtParseError(`Failed parsing logical row #${index + 1}.`, { cause: error });
  }
}

/**
 * Returns the first string in an FK bucket, or `undefined` when the bucket is missing or empty.
 *
 * @param entries — Values for a single FK as collected during ingest (usually from `fieldBuckets.get(fk)`).
 */
export function peekFirst(entries: readonly string[] | undefined): string | undefined {
  const [candidate] = entries ?? [];
  return candidate;
}

/**
 * Parses GDT date tokens (`DDMMYYYY`, eight digits) into a UTC midnight {@link Date}.
 *
 * Rejects impossible calendar dates by requiring a round-trip match via {@link formatDdMmYyyy}.
 *
 * @param raw — Exactly eight decimal digits, e.g. `01011977` for 1 Jan 1977.
 *
 * @returns A `Date` at UTC midnight, or `null` if the token is malformed or not a real calendar day.
 */
export function parseDdMmYyyyUtc(raw: string): Date | null {
  if (!/^\d{8}$/.test(raw)) return null;
  const day = Number(raw.slice(0, 2));
  const month = Number(raw.slice(2, 4));
  const year = Number(raw.slice(4, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const millis = Date.UTC(year, month - 1, day);
  const roundTrip = formatDdMmYyyy(new Date(millis));
  return roundTrip === raw ? new Date(millis) : null;
}

/**
 * Formats a calendar day as GDT `DDMMYYYY` using **UTC** date parts (consistent with {@link parseDdMmYyyyUtc}).
 *
 * @param date — Source instant; only year/month/day in UTC are used.
 */
export function formatDdMmYyyy(date: Date): string {
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const year = `${date.getUTCFullYear()}`;
  return `${day}${month}${year}`;
}

function mapGenderToken(token: string | undefined): GdtGender {
  if (token === '1') return 'male';
  if (token === '2') return 'female';
  return 'unknown';
}

/**
 * Patient-facing fields extracted from mandatory / optional demographic FKs after ingest.
 */
export interface NormalizedPatient {
  readonly patientId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: Date | null;
  readonly gender: GdtGender;
}

/**
 * Maps ingested FK buckets onto {@link NormalizedPatient} accessors used by {@link readGdtFromString}.
 *
 * Uses FK `3000`, `3101`, `3102`, `3103`, `3110` (see {@link GDT_FIELD_IDS}). Gender codes `1`/`2` map to
 * `male`/`female`; anything else becomes `unknown`.
 *
 * @param fieldBuckets — FK → payloads as produced by {@link ingestGdtText} (read-only view allowed).
 * @param strict — When `true`, missing or invalid mandatory demographics throw {@link GdtParseError}.
 *   When `false`, absent values yield empty strings, `birthDate: null`, or `gender: 'unknown'` as applicable.
 *
 * @returns Normalised patient slice for {@link GdtReadData}.
 *
 * @throws {@link GdtParseError} In strict mode if mandatory FKs are missing, empty, or DOB is not valid `DDMMYYYY`.
 */
export function hydratePatientBuckets(fieldBuckets: ReadonlyMap<string, readonly string[]>, strict: boolean): NormalizedPatient {
  const expectMandatory = (label: keyof typeof GDT_FIELD_IDS): string => {
    const fk = GDT_FIELD_IDS[label];
    const first = fieldBuckets.get(fk)?.at(0);
    const normalized = first?.trim();
    if (!normalized || normalized.length === 0) {
      if (strict) {
        throw new GdtParseError(`Mandatory FK ${fk} (${String(label)}) missing.`);
      }
      return '';
    }
    return normalized;
  };

  const patientId = expectMandatory('PATIENT_ID');
  const firstName = expectMandatory('FIRST_NAME');
  const lastName = expectMandatory('SURNAME');

  const dobRaw = peekFirst(fieldBuckets.get(GDT_FIELD_IDS.DATE_OF_BIRTH));

  const birthDate = dobRaw !== undefined ? parseDdMmYyyyUtc(dobRaw) : null;
  if (strict) {
    if (!dobRaw || birthDate === null) {
      throw new GdtParseError('Mandatory FK 3103 missing or malformed (expected DDMMYYYY).');
    }
  }

  const genderRaw = peekFirst(fieldBuckets.get(GDT_FIELD_IDS.GENDER));
  if (strict && (genderRaw === undefined || genderRaw.trim().length === 0)) {
    throw new GdtParseError('Mandatory FK 3110 missing while strict parsing is enabled.');
  }

  return {
    patientId,
    firstName,
    lastName,
    birthDate,
    gender: mapGenderToken(genderRaw),
  };
}

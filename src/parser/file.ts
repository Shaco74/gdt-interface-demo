import { parseLogicalRow, splitLogicalRows } from './line.js';
import { GDT_FIELD_IDS } from '../types/fields.js';
import { GdtParseError } from '../types/errors.js';
import type { GdtGender } from '../types/gender.js';
import type { GdtParsedLine } from '../types/records.js';

export interface ParsedGdtFile {
  readonly lines: readonly GdtParsedLine[];
  readonly fieldBuckets: Map<string, string[]>;
}

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

export function peekFirst(entries: readonly string[] | undefined): string | undefined {
  const [candidate] = entries ?? [];
  return candidate;
}

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

export interface NormalizedPatient {
  readonly patientId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: Date | null;
  readonly gender: GdtGender;
}

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

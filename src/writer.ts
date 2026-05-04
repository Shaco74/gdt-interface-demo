import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';

import { buildGdtLine } from './parser/line.js';
import { GDT_FIELD_IDS } from './types/fields.js';
import type { GdtWriteData, WriteOptions } from './types/api.js';
import { GdtWriteError } from './types/errors.js';

interface Row {
  readonly fieldId: string;
  readonly payload: string;
}

/**
 * Writes a deterministic GDT record (FK `6310` / `6311`) including patient linkage and segmented findings (`6228`).
 *
 * `8100` (file length in bytes when encoded latin1 / CR+LF separators) converges automatically to guarantee
 * self-consistent artefacts before persisting onto disk shared with medical peripherals.
 *
 * @param pathToGdt Absolute or workspace-relative filesystem path targeting the outbound `.gdt` file.
 * @param data      Minimum payload mandated by interviewer brief (patient linkage + unstructured finding text).
 *
 * @param options   Overrides for satz identifiers, versioning or optional demographic passthrough snippets.
 *
 * @throws {@link GdtWriteError} when persistence fails unexpectedly.
 *
 * @example
 * ```ts
 * import { writeGdt } from 'gdt-interface-demo';
 *
 * writeGdt('./out/RESULT.GDT', {
 *   patientId: '4711',
 *   befundText: ['Normalbefund', 'PQ-Zeit leicht verkürzt'],
 * });
 * ```
 */
export function writeGdt(pathToGdt: string, data: GdtWriteData, options?: WriteOptions): void {
  const encoding = options?.encoding === 'ascii' ? 'ascii' : 'latin1';
  const serialized = composeDocument({
    payload: data,
    options,
    encoding,
  });

  try {
    mkdirSync(dirname(pathToGdt), { recursive: true });
    writeFileSync(pathToGdt, serialized, encoding);
  } catch (error) {
    throw new GdtWriteError(`Unable to persist GDT artefact → ${pathToGdt}`, { cause: error });
  }
}

/**
 * Mirrors {@link writeGdt} semantics but skips disk IO — invaluable for deterministic unit/integration tests.
 */
export function stringifyGdt(data: GdtWriteData, options?: WriteOptions, encoding?: 'ascii' | 'latin1'): string {
  const enc = encoding === 'ascii' ? 'ascii' : 'latin1';
  return composeDocument({ payload: data, options, encoding: enc });
}

function composeDocument(input: {
  readonly payload: GdtWriteData;
  readonly options?: WriteOptions;
  readonly encoding: 'ascii' | 'latin1';
}): string {
  const findings = flattenFindings(input.payload.befundText);
  const recordTypeValue = resolveRecord(input.options?.recordType);
  const receiver = input.options?.receiverDeviceId ?? 'MTDEVICE';
  const sender = input.options?.senderSystemId ?? 'PVSYSTEM';
  const versionLabel = input.options?.gdtVersion ?? '02.10';
  const procedureDesignation = input.options?.procedureDesignation ?? 'DEMO01';
  const examDdMmYy = input.options?.examinationDateDdMmYyyy ?? todayDdMmYyyy();

  const rows: Row[] = [
    { fieldId: GDT_FIELD_IDS.RECORD_TYPE, payload: recordTypeValue },
    { fieldId: GDT_FIELD_IDS.RECEIVER_DEVICE_ID, payload: receiver },
    { fieldId: GDT_FIELD_IDS.SENDER_SYSTEM_ID, payload: sender },
    { fieldId: GDT_FIELD_IDS.GDT_VERSION, payload: versionLabel },
    { fieldId: GDT_FIELD_IDS.PATIENT_ID, payload: input.payload.patientId },
    { fieldId: GDT_FIELD_IDS.PROCEDURE_ID, payload: procedureDesignation },
    { fieldId: GDT_FIELD_IDS.EXAM_DATE, payload: examDdMmYy },
  ];

  const demographics = input.payload.demographics;
  if (demographics?.lastName) {
    rows.push({ fieldId: GDT_FIELD_IDS.SURNAME, payload: demographics.lastName });
  }
  if (demographics?.firstName) {
    rows.push({ fieldId: GDT_FIELD_IDS.FIRST_NAME, payload: demographics.firstName });
  }

  if (demographics?.dateOfBirthDdMmYyyy) {
    rows.push({
      fieldId: GDT_FIELD_IDS.DATE_OF_BIRTH,
      payload: demographics.dateOfBirthDdMmYyyy,
    });
  }
  if (demographics?.genderCode) {
    rows.push({
      fieldId: GDT_FIELD_IDS.GENDER,
      payload: demographics.genderCode,
    });
  }

  findings.forEach((chunk) =>
    rows.push({ fieldId: GDT_FIELD_IDS.FINDING_TEXT_LONG, payload: chunk }),
  );

  return injectDynamicFileLength(rows, input.encoding);
}

export function flattenFindings(candidate: string | readonly string[]): string[] {
  if (typeof candidate === 'string') {
    return candidate.split(/\r?\n/).flatMap((line) => (line.trim().length > 0 ? [line.trim()] : []));
  }

  const collected: string[] = [];
  for (const fragment of candidate) {
    flattenFindings(fragment).forEach((line) => collected.push(line));
  }
  return collected;
}

export function injectDynamicFileLength(rows: Row[], encoding: 'latin1' | 'ascii'): string {
  let lengthToken = '00000';

  const render = (): string =>
    assembleWithLength(rows, lengthToken).map(([fieldId, payload]) => buildGdtLine(fieldId, payload)).join('');

  let iteration = 0;
  while (iteration < 32) {
    const attempt = render();
    const bytes = Buffer.byteLength(attempt, encoding);
    const nextToken = normalizeLengthToken(bytes, lengthToken.length);
    if (nextToken === lengthToken) {
      return attempt;
    }
    lengthToken = nextToken;
    iteration += 1;
  }

  throw new GdtWriteError('Unable to converge GDT FK 8100 length token within iteration budget.');
}

function assembleWithLength(rows: Row[], token: string): Array<[fieldId: string, payload: string]> {
  if (rows.length === 0) {
    throw new GdtWriteError('Cannot synthesize empty GDT documents.');
  }

  const [first, ...rest] = rows;
  return [
    [first.fieldId, first.payload],
    [GDT_FIELD_IDS.FILE_LENGTH, token],
    ...rest.map((row): [string, string] => [row.fieldId, row.payload]),
  ];
}

function normalizeLengthToken(byteLength: number, width: number): string {
  const candidate = `${byteLength}`;
  const targetWidth = Math.max(width, 5, candidate.length);
  return candidate.padStart(targetWidth, '0');
}

function resolveRecord(candidate: WriteOptions['recordType'] | undefined): string {
  return candidate ?? '6310';
}

function todayDdMmYyyy(): string {
  const now = new Date();
  const dd = `${now.getDate()}`.padStart(2, '0');
  const mm = `${now.getMonth() + 1}`.padStart(2, '0');
  const yyyy = `${now.getFullYear()}`;
  return `${dd}${mm}${yyyy}`;
}


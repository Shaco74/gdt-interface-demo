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

/**
 * Builds the ordered GDT row list from {@link GdtWriteData} and {@link WriteOptions}, then serialises it via
 * {@link injectDynamicFileLength}.
 *
 * Row order: fixed header block (`8000`, `8315`, `8316`, `9218`, `3000`, `8402`, `6200`), optional demographics
 * (`3101`–`3110` when present), then one **`6228`** line per entry from {@link flattenFindings} on `befundText`.
 *
 * @param input.payload — Patient id, optional `demographics`, and `befundText` (string or lines).
 * @param input.options — Receiver/sender IDs, GDT version, record type (`6310`/`6311`), exam date, etc.
 * @param input.encoding — Drives byte length for FK `8100` convergence.
 *
 * @returns Full GDT document string (CRLF lines, self-consistent `8100`).
 *
 * @throws {@link GdtWriteError} Propagated from {@link injectDynamicFileLength} when length convergence fails.
 *
 * @example
 * Input (fixed exam date so the snapshot stays stable):
 * ```ts
 * composeDocument({
 *   payload: {
 *     patientId: '4711',
 *     befundText: 'Eine Zeile',
 *     demographics: { firstName: 'Hans', lastName: 'Mustermann' },
 *   },
 *   options: {
 *     recordType: '6310',
 *     receiverDeviceId: 'MT1',
 *     senderSystemId: 'PVSYSTEM',
 *     gdtVersion: '02.10',
 *     procedureDesignation: 'DEMO01',
 *     examinationDateDdMmYyyy: '04052026',
 *   },
 *   encoding: 'latin1',
 * });
 * ```
 * Output — one concatenated string; every logical row ends with `\r\n`. FK **`8100`** is the second line
 * (payload = total **latin1** byte length of the whole file, here **`166`**):
 * ```txt
 * 01380006310
 * 014810000166
 * 0128315MT1
 * 0178316PVSYSTEM
 * 014921802.10
 * 01330004711
 * 0158402DEMO01
 * 017620004052026
 * 0193101Mustermann
 * 0133102Hans
 * 0196228Eine Zeile
 * ```
 * The real return value joins the rows above with `\r\n` (and ends with `\r\n`). Same bytes as
 * `stringifyGdt(..., options, 'latin1')` / {@link writeGdt} before disk write — `composeDocument` is not exported.
 */
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

/**
 * Flattens a string or an array of strings into a single array of strings.
 *
 * @param candidate - The string or array of strings to flatten.
 * @example
 * ```ts
 * flattenFindings('Hello\nWorld') -> ['Hello', 'World']
 * flattenFindings(['Hello', 'World']) -> ['Hello', 'World']
 * flattenFindings(['Hello', 'World', 'Hello', 'World']) -> ['Hello', 'World', 'Hello', 'World']
 * ```
 * @returns {string[]} - The flattened array of strings.
 */
export function flattenFindings(candidate: string | readonly string[]): string[] {
  if (typeof candidate === 'string') {
    // Split the string into lines and flatten the array
    return candidate.split(/\r?\n/).flatMap((line) => (line.trim().length > 0 ? [line.trim()] : []));
  }

  const collected: string[] = [];
  for (const fragment of candidate) {
    flattenFindings(fragment).forEach((line) => collected.push(line));
  }
  return collected;
}

/**
 * Renders `rows` into a full GDT string and converges FK **`8100`** (total file byte length) with the actual
 * `Buffer.byteLength` of that string — the `8100` payload **feeds back** into the byte count, hence the loop.
 *
 * **`rows` must not include FK `8100`.** {@link assembleWithLength} inserts **`8100`** immediately after the
 * first row (typically FK `8000`), then appends the remaining rows — same layout as {@link composeDocument}.
 *
 * @param rows — Header + body lines only (no `8100`); must be non-empty.
 * @param encoding — Passed to `Buffer.byteLength` for the final artefact.
 *
 * @returns Complete GDT text (`\r\n` lines) with a self-consistent `8100` payload.
 *
 * @throws {@link GdtWriteError} If `rows` is empty or the length token fails to stabilise within 32 iterations.
 *
 * @example
 * Input — **`8100` must not appear** in `rows`; it is injected after `8000`:
 * ```ts
 * injectDynamicFileLength(
 *   [
 *     { fieldId: '8000', payload: '6310' },
 *     { fieldId: '3000', payload: '4711' },
 *   ],
 *   'latin1',
 * );
 * ```
 * Output — three physical lines; FK **`8100`** payload is **`00040`** (= **latin1** byte length of the full string):
 * ```txt
 * 01380006310
 * 014810000040
 * 01330004711
 * ```
 * The real return value concatenates these with `\r\n` (and ends with `\r\n`).
 */
export function injectDynamicFileLength(rows: Row[], encoding: 'latin1' | 'ascii'): string {
  let lengthToken = '00000';

  const render = (): string =>
    assembleWithLength(rows, lengthToken).map(([fieldId, payload]) => buildGdtLine(fieldId, payload)).join('');

  let iteration = 0;
  while (iteration < 32) {
    const attempt = render();
    // Calculate the byte length of the attempt
    const bytes = Buffer.byteLength(attempt, encoding);
    // Normalize the length token to the target width by padding with zeros
    const nextToken = normalizeLengthToken(bytes, lengthToken.length);
    // If the next token is the same as the current token, return the attempt 
    // because we have found the correct length token
    if (nextToken === lengthToken) {
      return attempt;
    }
    lengthToken = nextToken;
    iteration += 1;
  }

  throw new GdtWriteError('Unable to converge GDT FK 8100 length token within iteration budget.');
}

/**
 * Builds the ordered pair list for rendering: **first row**, then **`8100` + `token`**, then **all other rows**.
 * Used only by {@link injectDynamicFileLength}; callers never pass `8100` inside `rows`.
 *
 * @throws {@link GdtWriteError} If `rows` is empty.
 *
 * @example
 * ```ts
 * assembleWithLength(
 *   [
 *     { fieldId: '8000', payload: '6310' },
 *     { fieldId: '3000', payload: '4711' },
 *   ],
 *   '00123',
 * );
 * // [['8000', '6310'], ['8100', '00123'], ['3000', '4711']]
 * ```
 */
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

/**
 * Decimal `byteLength` as zero-padded digits for FK **`8100`**. Width is at least **5**, at least **`width`**
 * (previous token length so the field does not shrink between iterations), and at least **`byteLength`’s digit count**.
 *
 * @param byteLength — Measured file size from `Buffer.byteLength(..., encoding)`.
 * @param width — Prior token length; keeps padding from oscillating when the digit count of `8100` changes.
 *
 * @example
 * ```ts
 * normalizeLengthToken(10, 5);      // "00010" — min width 5
 * normalizeLengthToken(10, 8);     // "00000010" — respects prior width 8
 * normalizeLengthToken(100000, 5); // "100000" — grows when the number needs 6 digits
 * ```
 */
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


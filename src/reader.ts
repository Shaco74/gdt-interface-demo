import { readFileSync } from 'node:fs';

import type { ReadOptions, GdtReadData } from './types/api.js';
import {
  hydratePatientBuckets,
  ingestGdtText,
  type ParsedGdtFile,
} from './parser/file.js';
import { GdtParseError } from './types/errors.js';

/**
 * Parses a compliant `.gdt` file containing patient demographics and optional findings metadata.
 *
 * Unknown FK values are aggregated inside `rawFields` so callers can extend the parser gradually
 * without losing device-specific payloads during round-trip operations.
 *
 * @param pathToGdt Absolute or workspace-relative filesystem path pointing to `.gdt` data.
 * @param options   Configure encoding or enable strict validations.
 *
 * @returns Structured representation with convenience accessors mapped from mandatory FK identifiers.
 *
 * @throws {@link GdtParseError} when `strict === true` and mandatory FK values are unavailable.
 *
 * @example
 * ```ts
 * import { readGdt } from 'gdt-interface-demo';
 *
 * const patientRecord = readGdt('./incoming/EDV1MT1.GDT');
 * console.log(patientRecord.patientId, patientRecord.lastName);
 * ```
 */
export function readGdt(pathToGdt: string, options?: ReadOptions): GdtReadData {
  const encoding = resolveEncoding(options);
  try {
    const raw = readFileSync(pathToGdt, encoding);
    return mapFromBlob(raw, options ?? {});
  } catch (error) {
    if (error instanceof GdtParseError) {
      throw error;
    }
    throw new GdtParseError(`Unable to read artifact at ${pathToGdt}`, { cause: error });
  }
}

/**
 * Mirrors {@link readGdt} but consumes an already-loaded buffer for tests or streamed transports.
 */
export function readGdtFromString(payload: string, options?: ReadOptions): GdtReadData {
  try {
    return mapFromBlob(payload, options ?? {});
  } catch (error) {
    if (error instanceof GdtParseError) {
      throw error;
    }
    throw new GdtParseError('Unable to parse provided buffer string.', { cause: error });
  }
}

function resolveEncoding(options: ReadOptions | undefined): BufferEncoding {
  switch (options?.encoding) {
    case 'ascii':
      return 'ascii';
    default:
      return 'latin1';
  }
}

function mapFromBlob(raw: string, options: ReadOptions): GdtReadData {
  const strict = Boolean(options.strict);
  const parsed: ParsedGdtFile = ingestGdtText(raw, strict);
  const patientSlice = hydratePatientBuckets(parsed.fieldBuckets, strict);

  return {
    patientId: patientSlice.patientId,
    firstName: patientSlice.firstName,
    lastName: patientSlice.lastName,
    birthDate: patientSlice.birthDate,
    gender: patientSlice.gender,
    rawFields: freezeBuckets(parsed.fieldBuckets),
  };
}

/**
 * Freezes a map of string arrays into a read-only map of readonly string arrays.
 *
 * @param source - The map to freeze.
 * @returns The frozen map.
 */
function freezeBuckets(source: Map<string, string[]>): ReadonlyMap<string, readonly string[]> {
  const clone = new Map<string, readonly string[]>();
  for (const [key, values] of source.entries()) {
    clone.set(key, [...values]);
  }
  return clone;
}

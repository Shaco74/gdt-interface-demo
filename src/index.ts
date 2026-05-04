/**
 * Barrel entry for published capabilities.
 */

export type { ReadOptions, WriteOptions, GdtWriteData, GdtReadData } from './types/api.js';

export type { GdtGender } from './types/gender.js';

export type { GdtParsedLine } from './types/records.js';

export type { ParsedGdtFile } from './parser/file.js';

export { ingestGdtText, peekFirst } from './parser/file.js';

export { readGdt, readGdtFromString } from './reader.js';

export {
  flattenFindings,
  injectDynamicFileLength,
  stringifyGdt,
  writeGdt,
} from './writer.js';

export { buildGdtLine, splitLogicalRows, parseLogicalRow } from './parser/line.js';

export { GDT_FIELD_IDS, GDT_FIELD_LABELS, lookupFieldLabel } from './types/fields.js';

export { GdtParseError, GdtWriteError } from './types/errors.js';

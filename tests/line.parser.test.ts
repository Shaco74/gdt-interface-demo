import { buildGdtLine, parseLogicalRow, splitLogicalRows } from '../src/parser/line.js';
import { GdtParseError } from '../src/types/errors.js';
import { describe, expect, it } from 'vitest';

describe('buildGdtLine', () => {
  it('prepends LENGTH that includes CRLF bytes', () => {
    const physical = buildGdtLine('3102', 'Hans');
    expect(physical.endsWith('\r\n')).toBe(true);
    expect(physical.startsWith('013')).toBe(true);
    expect(Buffer.byteLength(physical, 'latin1')).toBe(Number.parseInt(physical.slice(0, 3), 10));
  });
});

describe('parseLogicalRow', () => {
  it('parses a TTMMJJJJ birth date tuple', () => {
    const row = parseLogicalRow('017310301011977', true);
    expect(row.fieldId).toBe('3103');
    expect(row.content).toBe('01011977');
    expect(row.declaredTotalLength).toBe(17);
  });

  it('rejects impossible LENGTH prefixes when validating strictly', () => {
    expect(() => parseLogicalRow('0093103010011977', true)).toThrow(GdtParseError);
  });
});

describe('splitLogicalRows', () => {
  it('handles mixed newline styles', () => {
    expect(splitLogicalRows('a\nb\nc')).toEqual(['a', 'b', 'c']);
    expect(splitLogicalRows('x\r\ny')).toEqual(['x', 'y']);
  });
});

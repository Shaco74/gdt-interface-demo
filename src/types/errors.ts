/**
 * Raised when `.gdt` content cannot be parsed according to expectations.
 *
 * Typical causes are invalid length headers, malformed field identifiers or missing
 * mandatory FK values while `{@link ../types/api.ReadOptions.strict}` parsing is enabled.
 */
export class GdtParseError extends Error {
  constructor(message: string, options?: ErrorOptions & { readonly cause?: unknown }) {
    super(message, options);
    this.name = 'GdtParseError';
  }
}

/**
 * Raised when a `.gdt` artefact cannot be written to disk.
 */
export class GdtWriteError extends Error {
  constructor(message: string, options?: ErrorOptions & { readonly cause?: unknown }) {
    super(message, options);
    this.name = 'GdtWriteError';
  }
}

import type { GdtGender } from './gender.js';

/** Options controlling how tolerant `readGdt` behaves when inspecting files. */
export interface ReadOptions {
  /**
   * Character set used while reading binary data from disk.
   * latin1 retains single-byte payloads which matches classic GDT exports.
   *
   * @defaultValue `'latin1'`
   */
  readonly encoding?: 'ascii' | 'latin1';

  /**
   * When enabled, inconsistencies (length mismatch, mandatory fields absent)
   * throw `{@link ../types/errors.GdtParseError}` instead of yielding soft defaults.
   *
   * @defaultValue `false`
   */
  readonly strict?: boolean;
}

/** Writable payload required by Aufgabenstellung minimal interface. */
export interface GdtWriteData {
  /**
   * Identifier as persisted in FK `3000`.
   *
   * @example `'2'` for `"Mustermann"` in reference fixtures.
   */
  readonly patientId: string;

  /**
   * Free text finding that is emitted via one FK `6228` line per array entry /
   * physical line break.
   */
  readonly befundText: string | readonly string[];

  /** Optional echoes of patient demographics for richer exports. */
  readonly demographics?: Readonly<{
    firstName: string;
    lastName: string;
    /** FK `3103`: eight digits formatted as DDMMJJJJ when provided. */
    dateOfBirthDdMmYyyy?: string;
    /** FK `3110` expects `1` (m) or `2` (w). */
    genderCode?: '1' | '2';
  }>;
}

/** Configuration knobs for deterministic serialisation. */
export interface WriteOptions {
  readonly encoding?: 'ascii' | 'latin1';
  readonly recordType?: '6310' | '6311';
  readonly gdtVersion?: string;
  readonly receiverDeviceId?: string;
  readonly senderSystemId?: string;
  readonly procedureDesignation?: string;
  readonly examinationDateDdMmYyyy?: string;
}

/**
 * Canonical read model returned by `readGdt`.
 *
 * Mapped fields originate from FK `3000`, `3101`, `3102`, `3103`, `3110`,
 * whereas `rawFields` keeps **every** FK as an append-only bucket for parity
 * with custom devices while still emitting convenience accessors.
 */
export interface GdtReadData {
  /** FK `3000`. */
  readonly patientId: string;
  /** FK `3102`. */
  readonly firstName: string;
  /** FK `3101`. */
  readonly lastName: string;
  /** Parsed FK `3103`; `null` if absent or malformed while running lenient mode. */
  readonly birthDate: Date | null;
  /** FK `3110` mapped onto `{@link GdtGender}`. */
  readonly gender: GdtGender;
  /** Multi-map of every FK as read from disk (deterministic chronological order preserved). */
  readonly rawFields: ReadonlyMap<string, readonly string[]>;
}

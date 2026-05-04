import type { GdtGender } from './gender.js';

/**
 * Canonical representation of a single physical GDT row (without trailing CR/LF in `rawBody`).
 */
export interface GdtParsedLine {
  readonly declaredTotalLength: number;
  readonly fieldId: string;
  readonly content: string;
  readonly rawBody: string;
}

/**
 * Lightweight patient snapshot reused by tooling / demos without importing `GdtReadData`.
 */
export interface GdtPatientSnapshot {
  readonly patientId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly birthDate: Date | null;
  readonly gender: GdtGender;
}

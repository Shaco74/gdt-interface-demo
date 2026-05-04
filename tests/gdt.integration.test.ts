import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { GDT_FIELD_IDS } from '../src/types/fields.js';
import { readGdt, readGdtFromString } from '../src/reader.js';
import { injectDynamicFileLength, stringifyGdt, writeGdt } from '../src/writer.js';
import { describe, expect, it } from 'vitest';

function buildTrainingStammPayload(): string {
  return injectDynamicFileLength(
    [
      { fieldId: GDT_FIELD_IDS.RECORD_TYPE, payload: '6301' },
      { fieldId: GDT_FIELD_IDS.RECEIVER_DEVICE_ID, payload: 'MTDEVICE' },
      { fieldId: GDT_FIELD_IDS.SENDER_SYSTEM_ID, payload: 'PVSYSTEM' },
      { fieldId: GDT_FIELD_IDS.GDT_VERSION, payload: '0100' },
      { fieldId: GDT_FIELD_IDS.PATIENT_ID, payload: '2' },
      { fieldId: GDT_FIELD_IDS.SURNAME, payload: 'Mustermann' },
      { fieldId: GDT_FIELD_IDS.FIRST_NAME, payload: 'Hans' },
      { fieldId: GDT_FIELD_IDS.DATE_OF_BIRTH, payload: '01011977' },
      { fieldId: GDT_FIELD_IDS.GENDER, payload: '1' },
      { fieldId: '6230', payload: '90' },
    ],
    'latin1',
  );
}

describe('Training Stammdatum document', () => {
  it('hydrates mandated patient accessors', () => {
    const read = readGdtFromString(buildTrainingStammPayload(), { strict: true });
    expect(read.patientId).toBe('2');
    expect(read.firstName).toBe('Hans');
    expect(read.lastName).toBe('Mustermann');
    expect(read.gender).toBe('male');
    expect(read.birthDate?.toISOString().startsWith('1977-01-01')).toBe(true);
  });
});

describe('writeGdt round-trip', () => {
  it('survives read → disk → parse cycle', () => {
    const target = path.join(tmpdir(), `gdt-roundtrip-${randomUUID()}.gdt`);
    try {
      writeGdt(
        target,
        {
          patientId: '481516',
          befundText: ['Normalbefund', 'PQ-Zeit im Normbereich'],
          demographics: {
          firstName: 'Julia',
          lastName: 'Musterfrau',
          dateOfBirthDdMmYyyy: '04122005',
          genderCode: '2',
        },
        },
        {
          examinationDateDdMmYyyy: '04122005',
          procedureDesignation: 'EKG01',
          receiverDeviceId: 'MT1',
          senderSystemId: 'EDV1',
          recordType: '6310',
          gdtVersion: '02.10',
        },
      );

      const reparsed = readGdt(target, { strict: true });
      expect(reparsed.patientId).toBe('481516');
      expect([...(reparsed.rawFields.get('6228') ?? [])].join('|')).toBe(
        ['Normalbefund', 'PQ-Zeit im Normbereich'].join('|'),
      );
    } finally {
      rmSync(target, { force: true });
      expect(() => readFileSync(target, 'latin1')).toThrow();
    }
  });

  it('supports deterministic stringify snapshots', () => {
    const generated = stringifyGdt(
      { patientId: '2', befundText: 'Alles prima' },
      { examinationDateDdMmYyyy: '04122006' },
      'latin1',
    );

    expect(readGdtFromString(generated).patientId).toBe('2');
  });
});

/** Four-digit identifiers as defined by the Gerätedatenträger standard. */
export const GDT_FIELD_IDS = {
  RECORD_TYPE: '8000',
  FILE_LENGTH: '8100',
  RECEIVER_DEVICE_ID: '8315',
  SENDER_SYSTEM_ID: '8316',
  GDT_VERSION: '9218',
  PATIENT_ID: '3000',
  SURNAME: '3101',
  FIRST_NAME: '3102',
  DATE_OF_BIRTH: '3103',
  GENDER: '3110',
  EXAM_DATE: '6200',
  FINDING_TEXT_LONG: '6228',
  PROCEDURE_ID: '8402',
} as const;

export type GdtFieldId = (typeof GDT_FIELD_IDS)[keyof typeof GDT_FIELD_IDS];

/** Friendly labels for demos and debugging displays. */
export const GDT_FIELD_LABELS: Readonly<Record<string, string>> = {
  [GDT_FIELD_IDS.RECORD_TYPE]: 'Satz-ID / Satzart',
  [GDT_FIELD_IDS.FILE_LENGTH]: 'Dateilänge (Bytes)',
  [GDT_FIELD_IDS.RECEIVER_DEVICE_ID]: 'GDT-ID Empfänger',
  [GDT_FIELD_IDS.SENDER_SYSTEM_ID]: 'GDT-ID Sender',
  [GDT_FIELD_IDS.GDT_VERSION]: 'Versions-Nr. GDT',
  [GDT_FIELD_IDS.PATIENT_ID]: 'Patient-Nr.',
  [GDT_FIELD_IDS.SURNAME]: 'Nachname',
  [GDT_FIELD_IDS.FIRST_NAME]: 'Vorname',
  [GDT_FIELD_IDS.DATE_OF_BIRTH]: 'Geburtstag (TTMMJJJJ)',
  [GDT_FIELD_IDS.GENDER]: 'Geschlecht (1=m, 2=w)',
  [GDT_FIELD_IDS.EXAM_DATE]: 'Datum Untersuchung',
  [GDT_FIELD_IDS.FINDING_TEXT_LONG]: 'Befund (Langtext)',
  [GDT_FIELD_IDS.PROCEDURE_ID]: 'Verfahren Kennfeld',
};

export function lookupFieldLabel(fieldId: string): string {
  return GDT_FIELD_LABELS[fieldId] ?? `FK ${fieldId}`;
}

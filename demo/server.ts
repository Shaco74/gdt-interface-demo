import cors from 'cors';
import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import type { GdtReadData, GdtWriteData, WriteOptions } from '../src/types/api.js';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

const api = async () =>
  await import(path.join(repoRoot, '../dist/index.js')) as typeof import('../dist/index.js');

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: true }));
app.use(express.json({ limit: '12mb' }));

function serializeReadPayload(data: GdtReadData): Record<string, unknown> {
  return {
    patientId: data.patientId,
    firstName: data.firstName,
    lastName: data.lastName,
    birthDate: data.birthDate?.toISOString() ?? null,
    gender: data.gender,
    rawFields: Object.fromEntries([...data.rawFields.entries()].map(([id, vals]) => [id, [...vals]])),
  };
}

app.get('/api/health', (_, res) => {
  res.json({ ok: true });
});

/** Accepts `{ gdtText?: string }` (UTF‑8 escaped in JSON for demo) or `{ latin1Base64?: string }` for fidelity. */
app.post('/api/read', async (req, res) => {
  const { readGdtFromString, GdtParseError } = await api();
  const strictRaw = req.query.strict ?? req.body?.strict;
  const strict = strictRaw === '1' || strictRaw === 1 || strictRaw === true;
  let latin1Payload: string;
  try {
    if (typeof req.body?.latin1Base64 === 'string') {
      latin1Payload = Buffer.from(req.body.latin1Base64, 'base64').toString('latin1');
    } else if (typeof req.body?.gdtText === 'string') {
      latin1Payload = req.body.gdtText;
    } else {
      res.status(400).json({ error: 'Provide `latin1Base64` or `gdtText` in JSON body.' });
      return;
    }
  } catch {
    res.status(400).json({ error: 'Could not decode `latin1Base64` payload.' });
    return;
  }
  try {
    const data = readGdtFromString(latin1Payload, { strict });
    res.json({ ok: true, data: serializeReadPayload(data), strict });
  } catch (error) {
    if (error instanceof GdtParseError) {
      res.status(400).json({
        ok: false,
        error: error.message,
        strict,
      });
      return;
    }
    throw error;
  }
});

/** Serialises `{ ...GdtWriteData, options?: WriteOptions }` to GDT bytes (latin1). */
app.post('/api/write', async (req, res) => {
  const { stringifyGdt, GdtWriteError } = await api();
  const body = req.body as (GdtWriteData & { options?: WriteOptions }) | undefined;
  if (!body?.patientId || body.befundText === undefined) {
    res.status(400).json({ error: 'Body must include `patientId` and `befundText`.' });
    return;
  }
  const { options, ...data } = body;
  try {
    const latin1 = stringifyGdt(data as GdtWriteData, options);
    res.json({
      ok: true,
      latin1Base64: Buffer.from(latin1, 'latin1').toString('base64'),
      byteLength: Buffer.byteLength(latin1, 'latin1'),
    });
  } catch (error) {
    if (error instanceof GdtWriteError) {
      res.status(400).json({ ok: false, error: error.message });
      return;
    }
    throw error;
  }
});

const PORT = Number.parseInt(process.env.GDT_API_PORT ?? '8787', 10);
app.listen(PORT, () => {
  console.log(`GDT demo API listening on http://localhost:${PORT}`);
});

// Ingest biometric template records (FP / FACE / PALM / BIOPHOTO) parsed
// from OPERLOG. Each record links to an employee by PIN, gets stored in
// `biometric_templates`, and toggles the matching flag on `employees.
// biometric_flags`.

import { getTenantSql } from '@zkc/db/client';
import { parseBioRecords } from '@zkc/shared/parser';
import { logger } from '../utils/logger';

const FLAG_KEY: Record<string, string> = {
  fp: 'fp',
  face: 'face',
  palm: 'palm',
  photo: 'photo',
};

export async function ingestBioRecords(opts: {
  schemaName: string;
  deviceSn: string;
  body: string;
}) {
  const rows = parseBioRecords(opts.body);
  if (rows.length === 0) return { count: 0 };

  const sql = getTenantSql(opts.schemaName);
  let stored = 0;

  for (const r of rows) {
    try {
      const emp = await sql<{ id: string }[]>`
        SELECT id FROM employees WHERE pin = ${r.pin} LIMIT 1
      `;
      const employeeId = emp[0]?.id;
      if (!employeeId) {
        logger.debug({ pin: r.pin, kind: r.kind }, 'Bio record for unknown PIN — skipping');
        continue;
      }

      await sql`
        INSERT INTO biometric_templates (
          employee_id, bio_type, fid, size, valid, template, source_device_sn
        ) VALUES (
          ${employeeId}, ${r.kind}, ${r.fid}, ${r.size}, ${r.valid},
          ${r.template ?? null}, ${opts.deviceSn}
        )
        ON CONFLICT (employee_id, bio_type, fid) DO UPDATE SET
          size = EXCLUDED.size,
          valid = EXCLUDED.valid,
          template = EXCLUDED.template,
          source_device_sn = EXCLUDED.source_device_sn,
          created_at = now()
      `;

      const flagKey = FLAG_KEY[r.kind];
      if (flagKey) {
        await sql`
          UPDATE employees
          SET biometric_flags = COALESCE(biometric_flags, '{}'::jsonb) || jsonb_build_object(${flagKey}, true),
              updated_at = now()
          WHERE id = ${employeeId}
        `;
      }
      stored++;
    } catch (err) {
      logger.error({ err, kind: r.kind, pin: r.pin }, 'Failed to store biometric record');
    }
  }
  if (stored > 0) {
    logger.info({ deviceSn: opts.deviceSn, stored }, 'Stored biometric templates');
  }
  return { count: stored };
}

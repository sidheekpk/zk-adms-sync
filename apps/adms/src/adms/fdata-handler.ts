// /iclock/fdata payload handler. Devices POST biometric template uploads
// here (separate from ATTLOG/OPERLOG). Body is tab-separated text, the
// same format as OPERLOG bio records.

import { resolveTenantBySn } from '../tenant/router';
import { ingestBioRecords } from '../services/biometric.service';
import { ingestOperlog } from '../services/attendance.service';
import { logger } from '../utils/logger';

export async function handleFData(sn: string, body: string, ip: string | null) {
  const tenant = await resolveTenantBySn(sn, { ip });
  if (!tenant) return;

  // /fdata can carry USER rows AND/OR FP/FACE/PALM/BIOPHOTO. Best-effort
  // both parsers; whichever finds rows handles them.
  await ingestOperlog({
    schemaName: tenant.schemaName,
    deviceSn: sn,
    body,
  });
  await ingestBioRecords({
    schemaName: tenant.schemaName,
    deviceSn: sn,
    body,
  });
  logger.debug({ sn, bytes: body.length }, 'fdata processed');
}

import { z } from 'zod';
import { randomBytes, createHash } from 'node:crypto';
import { TRPCError } from '@trpc/server';

import { router, tenantProcedure } from '../trpc';
import { logTenantAction } from '../audit';
import { getTenantSql } from '@zkc/db/client';

const PREFIX_LEN = 8; // first 8 chars of the secret — used for lookup, not auth
const SECRET_LEN = 32; // 32 bytes = 256-bit

/** Returns a freshly-minted key string the caller will use (only shown once). */
function mintKey(): { secret: string; prefix: string; hash: string } {
  const random = randomBytes(SECRET_LEN).toString('base64url');
  const secret = `zkci_${random}`; // "zkc inbound" prefix for easy identification
  const prefix = secret.slice(0, PREFIX_LEN);
  // SHA-256 is fine here — keys are long high-entropy randoms, no need for
  // a slow KDF (we're not protecting against offline cracking).
  const hash = createHash('sha256').update(secret).digest('hex');
  return { secret, prefix, hash };
}

export const inboundKeysRouter = router({
  list: tenantProcedure
    .input(z.object({ tenantSlug: z.string() }))
    .query(async ({ ctx }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      return sql<
        Array<{
          id: string;
          name: string;
          description: string | null;
          key_prefix: string;
          scopes: string[];
          revoked_at: string | null;
          last_used_at: string | null;
          last_used_ip: string | null;
          created_by_email: string | null;
          created_at: string;
        }>
      >`
        SELECT id, name, description, key_prefix, scopes, revoked_at,
               last_used_at, last_used_ip, created_by_email, created_at
        FROM inbound_api_keys
        ORDER BY revoked_at NULLS FIRST, created_at DESC
      `;
    }),

  /** Mint a new key. The full secret is returned ONCE — operator must copy it. */
  create: tenantProcedure
    .input(
      z.object({
        tenantSlug: z.string(),
        name: z.string().min(1).max(120),
        description: z.string().max(280).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { secret, prefix, hash } = mintKey();
      const sql = getTenantSql(ctx.tenant.schemaName);
      const rows = await sql<Array<{ id: string }>>`
        INSERT INTO inbound_api_keys (name, description, key_hash, key_prefix, created_by_email)
        VALUES (${input.name}, ${input.description ?? null}, ${hash}, ${prefix}, ${ctx.session.user.email})
        RETURNING id
      `;
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'inbound_key.create',
        targetType: 'inbound_api_key',
        targetId: rows[0]!.id,
        metadata: { name: input.name },
      });
      return { id: rows[0]!.id, secret, prefix };
    }),

  revoke: tenantProcedure
    .input(z.object({ tenantSlug: z.string(), id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const sql = getTenantSql(ctx.tenant.schemaName);
      const r = await sql`
        UPDATE inbound_api_keys SET revoked_at = NOW()
        WHERE id = ${input.id}::uuid AND revoked_at IS NULL
      `;
      if (r.count === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Key already revoked or missing' });
      }
      await logTenantAction(ctx, {
        tenantSchema: ctx.tenant.schemaName,
        action: 'inbound_key.revoke',
        targetType: 'inbound_api_key',
        targetId: input.id,
      });
      return { ok: true as const };
    }),
});

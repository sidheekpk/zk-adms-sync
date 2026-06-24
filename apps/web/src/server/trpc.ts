import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import type { Session } from '@/lib/auth';
import { platformDb } from '@zkc/db/client';
import { user as userTable, userTenantRoles, tenants } from '@zkc/db/platform';
import { and, eq } from 'drizzle-orm';

export interface Context {
  session: Session | null;
  ip: string | null;
  userAgent: string | null;
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.code === 'BAD_REQUEST' && error.cause instanceof ZodError
            ? error.cause.flatten()
            : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

// ---- Auth middlewares -----------------------------------------------------
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, session: ctx.session } });
});

export const superAdminProcedure = authedProcedure.use(({ ctx, next }) => {
  if (!ctx.session.user.isSuperAdmin) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Super-admin only' });
  }
  return next();
});

/**
 * Procedure scoped to a particular tenant. Caller passes `tenantSlug` in
 * the input; we resolve the tenant and verify the user has a role on it
 * (super-admins implicitly have access to every tenant).
 */
export const tenantProcedure = authedProcedure
  .input((raw): { tenantSlug: string } & Record<string, unknown> => {
    if (
      typeof raw === 'object' &&
      raw !== null &&
      'tenantSlug' in raw &&
      typeof (raw as { tenantSlug: unknown }).tenantSlug === 'string'
    ) {
      return raw as { tenantSlug: string } & Record<string, unknown>;
    }
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'tenantSlug is required' });
  })
  .use(async ({ ctx, input, next }) => {
    const slug = input.tenantSlug;
    const [tenant] = await platformDb
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);
    if (!tenant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tenant not found' });

    if (!ctx.session.user.isSuperAdmin) {
      const [role] = await platformDb
        .select()
        .from(userTenantRoles)
        .where(
          and(
            eq(userTenantRoles.userId, ctx.session.user.id),
            eq(userTenantRoles.tenantId, tenant.id),
          ),
        )
        .limit(1);
      if (!role) throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this tenant' });
    }

    return next({ ctx: { ...ctx, tenant } });
  });

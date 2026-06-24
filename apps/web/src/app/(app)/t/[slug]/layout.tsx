import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { platformDb } from '@zkc/db/client';
import { tenants, userTenantRoles } from '@zkc/db/platform';

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const [tenant] = await platformDb
    .select()
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  // Stale URL (e.g. tenant renamed) — send the user home rather than 404.
  if (!tenant) redirect('/dashboard');

  if (!session.user.isSuperAdmin) {
    const [role] = await platformDb
      .select()
      .from(userTenantRoles)
      .where(
        and(
          eq(userTenantRoles.userId, session.user.id),
          eq(userTenantRoles.tenantId, tenant.id),
        ),
      )
      .limit(1);
    if (!role) redirect('/dashboard');
  }

  return <>{children}</>;
}

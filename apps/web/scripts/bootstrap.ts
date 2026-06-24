/**
 * Bootstrap the first super-admin user.
 *
 *   pnpm --filter @zkc/web bootstrap
 *
 * Env is loaded by Node's --env-file flag in the npm script. Reads
 * BOOTSTRAP_SUPER_ADMIN_EMAIL + BOOTSTRAP_SUPER_ADMIN_PASSWORD.
 * Idempotent: skips if a super-admin already exists.
 */
import { eq } from 'drizzle-orm';
import { platformDb } from '@zkc/db/client';
import { user } from '@zkc/db/platform';
import { auth } from '../src/lib/auth';

async function main() {
  const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'BOOTSTRAP_SUPER_ADMIN_EMAIL and BOOTSTRAP_SUPER_ADMIN_PASSWORD must be set',
    );
  }

  const existing = await platformDb
    .select({ id: user.id, email: user.email, isSuperAdmin: user.isSuperAdmin })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existing[0]?.isSuperAdmin) {
    console.log(`✓ super-admin already exists: ${email}`);
    return;
  }

  if (existing[0]) {
    await platformDb
      .update(user)
      .set({ isSuperAdmin: true })
      .where(eq(user.id, existing[0].id));
    console.log(`✓ promoted existing user to super-admin: ${email}`);
    return;
  }

  console.log(`→ creating super-admin: ${email}`);
  const res = await auth.api.signUpEmail({
    body: {
      email,
      password,
      name: 'Super Admin',
    },
  });

  if (!res?.user?.id) {
    throw new Error('Sign-up failed: ' + JSON.stringify(res));
  }

  await platformDb
    .update(user)
    .set({ isSuperAdmin: true, emailVerified: true })
    .where(eq(user.id, res.user.id));

  console.log(`✓ super-admin created and promoted: ${email}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Bootstrap failed:', err);
    process.exit(1);
  });

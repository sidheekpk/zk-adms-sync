import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { AppShell } from './shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  return (
    <AppShell
      user={{
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? null,
        isSuperAdmin: !!session.user.isSuperAdmin,
      }}
    >
      {children}
    </AppShell>
  );
}

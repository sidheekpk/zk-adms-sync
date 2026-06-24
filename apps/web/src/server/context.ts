import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import type { Context } from './trpc';

export async function createTRPCContext(): Promise<Context> {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  return {
    session,
    ip: hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: hdrs.get('user-agent'),
  };
}

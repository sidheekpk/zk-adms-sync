import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in · ZK Connect' };

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect('/dashboard');

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* Animated radial background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 -left-40 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle_at_center,_oklch(0.7_0.18_264)_0%,_transparent_60%)] opacity-30 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-[40rem] w-[40rem] rounded-full bg-[radial-gradient(circle_at_center,_oklch(0.7_0.18_180)_0%,_transparent_60%)] opacity-25 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,_oklch(0.5_0_0_/_0.04)_1px,_transparent_1px),linear-gradient(to_bottom,_oklch(0.5_0_0_/_0.04)_1px,_transparent_1px)] bg-[size:48px_48px]" />
      </div>

      <div className="grid min-h-screen lg:grid-cols-2">
        {/* Left — brand */}
        <div className="hidden flex-col justify-between p-12 lg:flex">
          <div className="flex items-center gap-2 text-sm font-medium tracking-tight">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-foreground text-background">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2.5">
                <path d="M4 7h16M4 12h10M4 17h6" strokeLinecap="round" />
              </svg>
            </div>
            ZK Connect
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              The control plane for<br /> your biometric estate.
            </h1>
            <p className="max-w-md text-sm text-muted-foreground">
              Manage every ZKTeco device across every client from one console — punches, members, templates, transfers, and audit, all in real time.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} RadixHR · ZK Connect</p>
        </div>

        {/* Right — form */}
        <div className="flex items-center justify-center p-6 sm:p-12">
          <LoginForm />
        </div>
      </div>
    </div>
  );
}

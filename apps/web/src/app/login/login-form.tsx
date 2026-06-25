'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Loader2, Mail, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { signIn, twoFactor } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Step = 'credentials' | 'totp';

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pending, startTransition] = useTransition();

  async function onCredentials(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await signIn.email({ email, password });
      if (res.error) {
        toast.error(res.error.message ?? 'Sign-in failed');
        return;
      }
      if ('twoFactorRedirect' in (res.data ?? {}) && res.data?.twoFactorRedirect) {
        setStep('totp');
        return;
      }
      toast.success('Signed in');
      router.push('/dashboard');
      router.refresh();
    });
  }

  async function onTotp(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await twoFactor.verifyTotp({ code });
      if (res.error) {
        toast.error(res.error.message ?? 'Invalid code');
        return;
      }
      toast.success('Verified');
      router.push('/dashboard');
      router.refresh();
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-sm"
    >
      <div className="mb-8 flex items-center gap-2 lg:hidden">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-foreground text-background">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2.5">
            <path d="M4 7h16M4 12h10M4 17h6" strokeLinecap="round" />
          </svg>
        </div>
        <span className="font-medium tracking-tight">ZK Connect</span>
      </div>

      {step === 'credentials' ? (
        <>
          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your work email to continue.
            </p>
          </div>
          <form onSubmit={onCredentials} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  placeholder="you@example.com"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            All sessions require 2FA. By signing in you agree to our{' '}
            <a className="underline underline-offset-2 hover:text-foreground" href="#">
              terms
            </a>
            .
          </p>
        </>
      ) : (
        <>
          <div className="mb-6 flex items-start gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Verify it&apos;s you</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the 6-digit code from your authenticator app.
              </p>
            </div>
          </div>
          <form onSubmit={onTotp} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Authentication code</Label>
              <Input
                id="code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                autoFocus
                placeholder="123 456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="text-center text-lg tracking-[0.4em]"
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending || code.length !== 6}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify and sign in'}
            </Button>
            <button
              type="button"
              onClick={() => setStep('credentials')}
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
            >
              ← Use a different account
            </button>
          </form>
        </>
      )}
    </motion.div>
  );
}

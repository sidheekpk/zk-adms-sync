import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins';
import { db, platform } from './db';

const isProd = process.env.NODE_ENV === 'production';

export const auth = betterAuth({
  appName: 'ZK Connect',
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-only-replace-with-32b-randomness-before-prod',

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: platform.user,
      session: platform.session,
      account: platform.account,
      verification: platform.verification,
      twoFactor: platform.twoFactor,
    },
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },

  session: {
    expiresIn: 60 * 60 * 8, // 8 hours
    updateAge: 60 * 30, // refresh if older than 30 min
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  advanced: {
    cookiePrefix: 'zkc',
    useSecureCookies: isProd,
    defaultCookieAttributes: {
      sameSite: 'lax',
    },
  },

  user: {
    additionalFields: {
      isSuperAdmin: {
        type: 'boolean',
        defaultValue: false,
        input: false,
      },
      isActive: {
        type: 'boolean',
        defaultValue: true,
        input: false,
      },
      twoFactorEnabled: {
        type: 'boolean',
        defaultValue: false,
        input: false,
      },
    },
  },

  plugins: [
    twoFactor({
      issuer: 'ZK Connect',
    }),
  ],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;

import { z } from 'zod';

const configSchema = z.object({
  ADMS_PORT: z.coerce.number().default(8080),
  ADMS_HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1),
  LOG_LEVEL: z.string().default('info'),

  DEVICE_OFFLINE_TIMEOUT_MS: z.coerce.number().default(90_000),
  COMMAND_EXPIRY_MS: z.coerce.number().default(600_000),
  TIME_SYNC_INTERVAL_MS: z.coerce.number().default(10 * 60_000),
  TIME_SYNC_MAX_AGE_MS: z.coerce.number().default(12 * 3600 * 1000),

  // Raw-dump middleware (Phase 0 debug aid). Disable in production.
  RAW_DUMP_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  RAW_DUMP_FILE: z.string().default('./logs/device-raw.txt'),
});

const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;

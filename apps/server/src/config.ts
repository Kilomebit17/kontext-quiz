import { z } from 'zod'

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v)

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  API_ORIGIN: z.string().url().default('http://localhost:4000'),

  DATABASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /** Force the in-memory store even when DATABASE_URL is set. */
  STORE: z.enum(['memory', 'pg']).optional(),
  REDIS_URL: z.preprocess(emptyToUndefined, z.string().optional()),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET must be at least 16 characters'),

  SMTP_HOST: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PASS: z.preprocess(emptyToUndefined, z.string().optional()),
  MAIL_FROM: z.string().default('Kontext Quiz <no-reply@kontextquiz.app>'),

  GOOGLE_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  GOOGLE_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),

  SENTRY_DSN: z.preprocess(emptyToUndefined, z.string().optional()),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Stable identifier of this instance (defaults to a random id). */
  INSTANCE_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  /** `player:join` attempts allowed per IP per minute (raise for load tests / NAT-heavy venues). */
  /** Flood protection: total `player:join` attempts per IP per minute (a whole classroom may share one IP). */
  JOIN_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(300),
  /** Brute-force protection: failed PIN guesses per IP per minute. */
  PIN_GUESS_LIMIT_PER_MIN: z.coerce.number().int().min(1).default(10),
})

export type Env = z.infer<typeof envSchema>

export interface Config extends Env {
  /** Resolved store kind. */
  storeKind: 'memory' | 'pg'
  isProd: boolean
  isTest: boolean
  isDev: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  const e = parsed.data
  const storeKind: Config['storeKind'] =
    e.STORE === 'memory' ? 'memory' : e.STORE === 'pg' || e.DATABASE_URL ? 'pg' : 'memory'
  if (storeKind === 'pg' && !e.DATABASE_URL) {
    throw new Error('STORE=pg requires DATABASE_URL')
  }
  return {
    ...e,
    storeKind,
    isProd: e.NODE_ENV === 'production',
    isTest: e.NODE_ENV === 'test',
    isDev: e.NODE_ENV === 'development',
  }
}

/** Config for tests: memory store, no redis, fixed secrets. */
export function testConfig(over: Partial<NodeJS.ProcessEnv> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    PORT: '0',
    HOST: '127.0.0.1',
    STORE: 'memory',
    JWT_SECRET: 'test-jwt-secret-test-jwt-secret',
    COOKIE_SECRET: 'test-cookie-secret-test-cookie-secret',
    LOG_LEVEL: 'silent',
    ...over,
  })
}

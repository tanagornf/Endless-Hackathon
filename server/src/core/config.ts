import { hkdfSync } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { z } from 'zod';
import type { ModelPriceTable } from './types';

export const rootDir = fileURLToPath(new URL('../../../', import.meta.url));
const envPath = (name: string): string => fileURLToPath(new URL('../../../' + name, import.meta.url));
const readEnv = (name: string): Record<string, string> => existsSync(envPath(name)) ? parse(readFileSync(envPath(name))) : {};
const defaults = readEnv('.env.example');
const local = readEnv('.env.local');

const excluded = /^(?:E2E_|VITE_|SITES_|BOARD_)/;
const env = Object.fromEntries(Object.entries({ ...defaults, ...local, ...process.env }).filter(([name]) => !excluded.test(name))
  .map(([name, value]) => [name, value?.startsWith('REPLACE') || value?.includes('REPLACE_NEON_DIRECT_HOST') ? '' : value]));
const optional = (value: unknown) => value === '' || value === undefined ? undefined : value;
const integer = (fallback: number) => z.preprocess(optional, z.coerce.number().int().positive().default(fallback));
const toggle = (fallback: boolean) => z.preprocess(optional, z.stringbool().default(fallback));
const settingUrl = z.preprocess(optional, z.url().optional());
const fields = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LANE: z.string().default(''),
  API_PORT: integer(3000),
  PORT: z.preprocess(optional, z.coerce.number().int().positive().optional()),
  WEB_PORT: integer(5170),
  WEB_ORIGIN: settingUrl,
  APP_BASE_URL: settingUrl,
  PUBLIC_BASE_URL: settingUrl,
  BUILD_SHA: z.string().default(''),
  RENDER_GIT_COMMIT: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  PG_SERVER_URL: settingUrl,
  DATABASE_URL: settingUrl,
  TEST_DATABASE_URL: settingUrl,
  DB_POOL_MAX: integer(5),
  DB_STATEMENT_TIMEOUT_MS: integer(10000),
  SESSION_SECRET: z.string().default(''),
  SESSION_TTL_HOURS: integer(12),
  COOKIE_SECURE: toggle(false),
  DEV_LOGIN: toggle(true),
  DEV_LOGIN_ENABLED: toggle(true),
  DEV_LOGIN_TOKEN: z.string().default(''),
  TOKEN_ENCRYPTION_KEY: z.string().default(''),
  HIDDEN_FEATURES: z.string().default(''),
  SEED_USER_PASSWORD: z.string().default(''),
  EMAIL_MODE: z.enum(['sandbox', 'real']).default('sandbox'),
  AUTH_TOKEN_TTL_MINUTES: integer(30),
  INVITATION_TTL_HOURS: integer(72),
  UPLOAD_DIR: z.preprocess(optional, z.string().optional()),
  UPLOAD_MAX_MB: integer(20),
  RUN_WORKER: toggle(true),
  RUN_SCHEDULER: toggle(true),
  JOBS_POLL_MS: integer(250),
  JOBS_MAX_ATTEMPTS: integer(5),
  JOBS_LEASE_SECONDS: integer(60),
  MODEL_MODE: z.preprocess(optional, z.enum(['fake', 'openai']).default('openai')),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_BASE_URL: settingUrl,
  OPENAI_CHAT_MODEL: z.string().default(''),
  OPENAI_CHAT_MODEL_FAST: z.string().default(''),
  OPENAI_CHAT_MODEL_STRONG: z.string().default(''),
  OPENAI_EMBED_MODEL: z.string().default(''),
  EMBED_DIM: integer(1536),
  OPENAI_MODERATION_MODEL: z.string().default(''),
  OPENAI_SHOP_CORRECTION_MODEL: z.string().default(''),
  OPENAI_SHOP_CORRECTION_ULTRAFAST_RATE_MULTIPLIER: z.preprocess(optional, z.coerce.number().finite().positive().optional()),
  OPENAI_REALTIME_MODEL: z.string().default(''),
  OPENAI_REALTIME_VOICE: z.string().default(''),
  OPENAI_REALTIME_TRANSCRIBE_MODEL: z.string().default(''),
  OPENAI_LIVE_MODEL: z.string().default(''),
  OPENAI_LIVE_VOICE: z.string().default(''),
  OPENAI_LIVE_ACTIVE_USD_PER_MINUTE: z.preprocess(optional, z.coerce.number().nonnegative().optional()),
  OPENAI_LIVE_STANDBY_USD_PER_MINUTE: z.preprocess(optional, z.coerce.number().nonnegative().optional()),
  OPENAI_TRANSCRIBE_MODEL: z.string().default(''),
  OPENAI_TTS_MODEL: z.string().default(''),
  MODEL_TIMEOUT_MS: integer(20000),
  MODEL_MAX_OUTPUT_TOKENS: integer(2000),
  MODEL_PRICE_TABLE: z.string().default('{}'),
  ESCALATION_ENABLED: toggle(true),
  LINE_MODE: z.enum(['sandbox', 'real']).default('sandbox'),
  LINE_CHANNEL_ID: z.string().default(''),
  LINE_CHANNEL_SECRET: z.string().default(''),
  LINE_CHANNEL_ACCESS_TOKEN: z.string().default(''),
  META_MODE: z.enum(['sandbox', 'real']).default('sandbox'),
  META_APP_ID: z.string().default(''),
  META_APP_SECRET: z.string().default(''),
  META_VERIFY_TOKEN: z.string().default(''),
  META_GRAPH_VERSION: z.string().default(''),
  META_TEST_PAGE_ID: z.string().default(''),
  META_TEST_IG_ACCOUNT_ID: z.string().default(''),
  GOOGLE_MODE: z.enum(['sandbox', 'real']).default('sandbox'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_TEST_CALENDAR_ID: z.string().default(''),
  PAYMENT_MODE: z.enum(['sandbox', 'real']).default('sandbox'),
  SLIP_VERIFY_MODE: z.enum(['sandbox', 'vision']).default('vision'),
  PROMPTPAY_TEST_ID: z.string().default(''),
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:dev@example.test'),
  VOICE_MAX_SECONDS: integer(120),
  VOICE_DAILY_SECONDS: integer(900),
  DEMO_RESET_ENABLED: toggle(false),
  DEMO_CHAT_DAILY_TURN_CAP: integer(300),
  EVAL_MAX_COST_USD: z.preprocess(optional, z.coerce.number().nonnegative().default(2.5)),
  MCP_ENABLED: toggle(true),
});

export function loadConfig(input: Record<string, string | undefined> = env) {
  const loaded = fields.safeParse({ ...input, RUN_WORKER: input.RUN_WORKER || input.JOBS_WORKER });
  if (!loaded.success) throw new Error('Invalid configuration: ' + loaded.error.issues.map(({ path }) => path.join('.')).join(', '));
  const cfg = loaded.data;
  const production = cfg.NODE_ENV === 'production';
  const encryptionKey = Buffer.from(cfg.TOKEN_ENCRYPTION_KEY, 'base64');
  if (production) {
    const invalid = [
      ...(cfg.SESSION_SECRET.length < 32 ? ['SESSION_SECRET'] : []),
      ...(encryptionKey.byteLength !== 32 ? ['TOKEN_ENCRYPTION_KEY'] : []),
      ...(!cfg.DATABASE_URL ? ['DATABASE_URL'] : []),
      ...(!cfg.APP_BASE_URL ? ['APP_BASE_URL'] : []),
    ];
    if (invalid.length) throw new Error('Missing or invalid production configuration: ' + invalid.join(', '));
  }
  const sessionSecret = cfg.SESSION_SECRET || 'endless-local-development-session-secret';
  let prices: ModelPriceTable;
  try {
    const raw: unknown = JSON.parse(cfg.MODEL_PRICE_TABLE);
    const amount = z.number().finite().nonnegative();
    prices = z.record(z.string(), z.object({
      input: amount, cachedInput: amount.optional(), output: amount,
      cacheWrite: amount.optional(), audioInput: amount.optional(), audioCachedInput: amount.optional(),
      audioOutput: amount.optional(), audioSecond: amount.optional(),
    }).passthrough()).parse(raw) as ModelPriceTable;
  } catch {
    throw new Error('Invalid configuration: MODEL_PRICE_TABLE');
  }
  return {
    ...cfg,
    SESSION_SECRET: sessionSecret,
    APP_BASE_URL: cfg.APP_BASE_URL ?? 'http://localhost:' + cfg.WEB_PORT,
    WEB_ORIGIN: cfg.WEB_ORIGIN ?? 'http://localhost:' + cfg.WEB_PORT,
    COOKIE_SECURE: production || cfg.COOKIE_SECURE,
    UPLOAD_DIR: cfg.UPLOAD_DIR || (production ? '/var/data/uploads' : 'var/uploads'),
    TOKEN_ENCRYPTION_KEY: encryptionKey.byteLength === 32 ? encryptionKey
      : Buffer.from(hkdfSync('sha256', sessionSecret, '', 'nless.token-encryption.v1', 32)),
    MODEL_MODE: !cfg.OPENAI_API_KEY || cfg.NODE_ENV === 'test' || input.CI === 'true' ? 'fake' as const : cfg.MODEL_MODE,
    MODEL_PRICE_TABLE: prices,
  };
}
export const config = loadConfig();

export function providerMode(provider: 'line' | 'meta' | 'google' | 'payment'): 'sandbox' | 'real' {
  switch (provider) {
    case 'line': return config.LINE_MODE === 'real' && config.LINE_CHANNEL_SECRET && (config.LINE_CHANNEL_ID || config.LINE_CHANNEL_ACCESS_TOKEN) ? 'real' : 'sandbox';
    case 'meta': return config.META_MODE === 'real' && config.META_APP_ID && config.META_APP_SECRET && config.META_VERIFY_TOKEN ? 'real' : 'sandbox';
    case 'google': return config.GOOGLE_MODE === 'real' && config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET ? 'real' : 'sandbox';
    case 'payment': return config.PAYMENT_MODE === 'real' && config.PROMPTPAY_TEST_ID ? 'real' : 'sandbox';
  }
}

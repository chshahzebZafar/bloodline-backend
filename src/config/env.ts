import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  SUPABASE_ANON_KEY: z.string().min(10),
  JWT_SECRET: z.string().min(10).optional(),

  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  // Sender used for transactional emails. Must be on a domain you've
  // verified in Resend, otherwise delivery fails.
  EMAIL_FROM: z.string().default('BloodLink <onboarding@resend.dev>'),
  // App-side URL scheme for deep-link redirects in email content.
  APP_DEEP_LINK_SCHEME: z.string().default('bloodlink'),
  MAPBOX_SECRET_TOKEN: z.string().optional(),
  SENTRY_DSN: z.string().optional(),

  DEFAULT_SEARCH_RADIUS_KM: z.coerce.number().positive().default(25),
  MAX_SEARCH_RADIUS_KM: z.coerce.number().positive().default(500),
  DONATION_COOLDOWN_DAYS: z.coerce.number().int().positive().default(56),
  POINTS_PER_DONATION: z.coerce.number().int().nonnegative().default(100),
  POINTS_PER_REFERRAL: z.coerce.number().int().nonnegative().default(50),

  EDGE_NOTIFY_DONORS_URL: z.string().url().optional().or(z.literal('')),
  EDGE_AWARD_POINTS_URL: z.string().url().optional().or(z.literal('')),

  // Shared secret used by Supabase Database Webhooks to call our internal
  // endpoints. Treat this like a password — it's the only thing standing
  // between the public internet and our push fan-out.
  WEBHOOK_SECRET: z.string().min(20).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Environment validation failed');
}

export const env = parsed.data;
export type Env = typeof env;

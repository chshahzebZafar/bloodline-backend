import rateLimit from 'express-rate-limit';

/**
 * Rate limiters keyed by IP. Behind a load balancer / proxy you must trust
 * the X-Forwarded-For header (set `app.set('trust proxy', 1)` in index.ts)
 * or every request will appear to come from the proxy and the limiter
 * becomes a global counter.
 */

/**
 * Tight limiter for credential endpoints (login, register, OTP, reset).
 * Keeps brute-force attacks expensive without locking out legit users.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Too many attempts, try again later', code: 429 },
});

/**
 * Default limiter for the rest of the API. Generous so normal use never
 * hits it — exists to mitigate runaway clients and basic DDoS.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests, slow down', code: 429 },
});

/**
 * Stricter limiter for write-heavy endpoints (creating requests, sending
 * messages) to keep one user from flooding the platform.
 */
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { ok: false, error: 'You are doing that too often', code: 429 },
});

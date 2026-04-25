import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { fail } from '../utils/response';
import { logger } from '../config/logger';

/**
 * Shared-secret auth for internal webhook endpoints.
 *
 * Supabase Database Webhooks support adding custom HTTP headers — we configure
 * `x-webhook-secret: <env.WEBHOOK_SECRET>` in the dashboard and verify it here.
 * Constant-time compare to avoid timing oracles.
 *
 * If WEBHOOK_SECRET isn't configured, every internal request is rejected.
 * Fail-closed by design — a misconfigured backend should not silently accept
 * unauthenticated traffic.
 */
export function requireWebhookSecret(req: Request, res: Response, next: NextFunction): void {
  if (!env.WEBHOOK_SECRET) {
    logger.error('WEBHOOK_SECRET not set — refusing internal request');
    res.status(503).json(fail('Webhook auth not configured', 503));
    return;
  }

  const provided = req.header('x-webhook-secret') ?? '';
  if (!safeEqual(provided, env.WEBHOOK_SECRET)) {
    logger.warn({ ip: req.ip, path: req.path }, 'webhook secret mismatch');
    res.status(401).json(fail('Invalid webhook secret', 401));
    return;
  }

  next();
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

import pino from 'pino';
import { env } from './env';

/**
 * Structured logger. JSON in production for log aggregators (Datadog,
 * Logtail, CloudWatch), pretty-printed locally for human eyes.
 *
 * Replace ad-hoc `console.error/warn/log` with `logger.error/warn/info`.
 */
export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: { service: 'bloodlink-api', env: env.NODE_ENV },
  redact: {
    // Never log credentials or tokens, even by accident.
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'access_token',
      'refresh_token',
      'fcm_token',
    ],
    censor: '[REDACTED]',
  },
  transport:
    env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
        },
});

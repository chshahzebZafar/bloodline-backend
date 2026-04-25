import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env } from './config/env';
import { logger } from './config/logger';
import { initSentry, Sentry } from './config/sentry';
import { initFirebase } from './config/firebase';
import { supabaseAdmin } from './config/supabase';
import { apiLimiter } from './middleware/rateLimit';

import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import requestsRoutes from './routes/requests.routes';
import donorsRoutes from './routes/donors.routes';
import donationsRoutes from './routes/donations.routes';
import chatRoutes from './routes/chat.routes';
import hospitalsRoutes from './routes/hospitals.routes';
import notificationsRoutes from './routes/notifications.routes';
import eventsRoutes from './routes/events.routes';

import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { ok, fail } from './utils/response';

initSentry();
initFirebase();

const app = express();

// Trust the first proxy (Render, Heroku, etc.) so req.ip is the real client IP
// — required for rate limiting to key off the actual user, not the load balancer.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
// Global API limiter. Per-route stricter limiters layer on top (e.g. authLimiter).
app.use(apiLimiter);

app.get('/health', async (_req, res) => {
  try {
    const { error } = await supabaseAdmin.from('users').select('id').limit(1);
    return res.json(
      ok({
        status: 'ok',
        version: '1.0.0',
        db: error ? 'error' : 'connected',
        env: env.NODE_ENV,
      })
    );
  } catch {
    return res.status(500).json(fail('Health check failed', 500));
  }
});

const V1 = '/v1';
app.use(`${V1}/auth`, authRoutes);
app.use(`${V1}/users`, usersRoutes);
app.use(`${V1}/requests`, requestsRoutes);
app.use(`${V1}/donors`, donorsRoutes);
app.use(`${V1}/donations`, donationsRoutes);
app.use(`${V1}/chats`, chatRoutes);
app.use(`${V1}/hospitals`, hospitalsRoutes);
app.use(`${V1}/notifications`, notificationsRoutes);
app.use(`${V1}/events`, eventsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

if (env.SENTRY_DSN) Sentry.setupExpressErrorHandler(app);

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, '🩸 BloodLink API listening');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  server.close(() => process.exit(0));
});

export default app;

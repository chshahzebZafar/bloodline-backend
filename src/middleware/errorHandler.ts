import { Request, Response, NextFunction } from 'express';
import { Sentry } from '../config/sentry';
import { fail } from '../utils/response';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json(fail('Route not found', 404));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction): void {
  Sentry.captureException(err);
  console.error('[error]', err);

  if (err?.code === 'PGRST116') { res.status(404).json(fail('Resource not found', 404)); return; }
  if (err?.code === '23505') { res.status(409).json(fail('Resource already exists', 409)); return; }
  if (err?.code === '23503') { res.status(400).json(fail('Foreign key violation', 400)); return; }
  if (err?.code === '22P02') { res.status(400).json(fail('Invalid input format', 400)); return; }

  if (err?.status && typeof err.status === 'number') {
    res.status(err.status).json(fail(err.message ?? 'Error', err.status));
    return;
  }

  res.status(500).json(fail('Internal server error', 500));
}

import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { fail } from '../utils/response';

export const validateBody = <T>(schema: ZodSchema<T>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const first = result.error.errors[0];
      res.status(400).json(
        fail(`${first.path.join('.') || 'body'}: ${first.message}`, 400, result.error.flatten())
      );
      return;
    }
    req.body = result.data;
    next();
  };

export const validateQuery = <T>(schema: ZodSchema<T>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const first = result.error.errors[0];
      res.status(400).json(
        fail(`${first.path.join('.') || 'query'}: ${first.message}`, 400, result.error.flatten())
      );
      return;
    }
    (req as Request & { validatedQuery: T }).validatedQuery = result.data;
    next();
  };

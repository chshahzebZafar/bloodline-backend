export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiFail {
  success: false;
  error: { message: string; code: number; details?: unknown };
}

export const ok = <T>(data: T, meta?: Record<string, unknown>): ApiSuccess<T> => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
});

export const fail = (message: string, code = 400, details?: unknown): ApiFail => ({
  success: false,
  error: { message, code, ...(details ? { details } : {}) },
});

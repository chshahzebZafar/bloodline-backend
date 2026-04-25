import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { fail } from '../utils/response';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

  if (!token) {
    res.status(401).json(fail('Missing bearer token', 401));
    return;
  }

  const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userData.user) {
    res.status(401).json(fail('Invalid or expired token', 401));
    return;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('auth_id', userData.user.id)
    .single();

  if (profileError || !profile) {
    res.status(403).json(fail('User profile not found', 403));
    return;
  }

  req.user = profile;
  req.accessToken = token;
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return next();

  supabaseAdmin.auth
    .getUser(token)
    .then(async ({ data }) => {
      if (!data.user) return next();
      const { data: profile } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('auth_id', data.user.id)
        .single();
      if (profile) {
        req.user = profile;
        req.accessToken = token;
      }
      next();
    })
    .catch(() => next());
}

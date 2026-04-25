import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ok, fail } from '../utils/response';

export async function listNotifications(req: Request, res: Response) {
  const { unread_only, limit } = (req as any).validatedQuery ?? req.query;
  let q = supabaseAdmin
    .from('notifications')
    .select('*')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false })
    .limit(Number(limit));

  if (unread_only === true || unread_only === 'true') q = q.is('read_at', null);

  const { data, error } = await q;
  if (error) return res.status(400).json(fail(error.message, 400));
  return res.json(ok(data ?? []));
}

export async function markAllRead(req: Request, res: Response) {
  const { error } = await supabaseAdmin
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', req.user!.id)
    .is('read_at', null);
  if (error) return res.status(400).json(fail(error.message, 400));
  return res.json(ok({ marked: true }));
}

export async function getPrefs(req: Request, res: Response) {
  const { data } = await supabaseAdmin
    .from('notification_prefs')
    .select('*')
    .eq('user_id', req.user!.id)
    .maybeSingle();

  if (data) return res.json(ok(data));

  const defaults = {
    user_id: req.user!.id,
    radius_km: 25,
    blood_types: [],
    quiet_from: null,
    quiet_to: null,
    enabled: true,
  };
  return res.json(ok(defaults));
}

export async function updatePrefs(req: Request, res: Response) {
  const payload = { ...req.body, user_id: req.user!.id, updated_at: new Date().toISOString() };
  const { data, error } = await supabaseAdmin
    .from('notification_prefs')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) return res.status(400).json(fail(error.message, 400));
  return res.json(ok(data));
}

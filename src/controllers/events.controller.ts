import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ok, fail } from '../utils/response';

export async function listEvents(req: Request, res: Response) {
  const { country_code, city, from_date, limit } =
    (req as any).validatedQuery ?? req.query;

  let q = supabaseAdmin
    .from('donation_events')
    .select('*')
    .gte('event_date', from_date ?? new Date().toISOString())
    .order('event_date', { ascending: true })
    .limit(Number(limit));

  if (country_code) q = q.eq('country_code', country_code);
  if (city) q = q.eq('city', city);

  const { data, error } = await q;
  if (error) return res.status(400).json(fail(error.message, 400));
  return res.json(ok(data ?? []));
}

export async function getEvent(req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from('donation_events')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error || !data) return res.status(404).json(fail('Event not found', 404));
  return res.json(ok(data));
}

export async function rsvp(req: Request, res: Response) {
  const { error } = await supabaseAdmin
    .from('event_rsvps')
    .upsert(
      { event_id: req.params.id, user_id: req.user!.id },
      { onConflict: 'event_id,user_id', ignoreDuplicates: true }
    );
  if (error) return res.status(400).json(fail(error.message, 400));
  return res.json(ok({ rsvped: true }));
}

export async function cancelRsvp(req: Request, res: Response) {
  const { error } = await supabaseAdmin
    .from('event_rsvps')
    .delete()
    .eq('event_id', req.params.id)
    .eq('user_id', req.user!.id);
  if (error) return res.status(400).json(fail(error.message, 400));
  return res.json(ok({ cancelled: true }));
}

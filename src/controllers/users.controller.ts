import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ok, fail } from '../utils/response';
import { pointToGeog } from '../services/geo.service';
import { checkDonorEligibility } from '../services/ai.service';
import { generateHealthPassport } from '../services/passport.service';

export async function getMe(req: Request, res: Response) {
  return res.json(ok(req.user));
}

export async function updateMe(req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .update(req.body)
    .eq('id', req.user!.id)
    .select('*')
    .single();
  if (error) return res.status(400).json(fail(error.message, 400));
  return res.json(ok(data));
}

export async function updateLocation(req: Request, res: Response) {
  const { lat, lng, country_code, city } = req.body;
  const { data, error } = await supabaseAdmin
    .from('users')
    .update({
      location: pointToGeog(lng, lat),
      country_code: country_code ?? req.user!.country_code,
      city: city ?? req.user!.city,
    })
    .eq('id', req.user!.id)
    .select('*')
    .single();
  if (error) return res.status(400).json(fail(error.message, 400));
  return res.json(ok(data));
}

export async function updateAvailability(req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .update({ availability: req.body.availability })
    .eq('id', req.user!.id)
    .select('availability')
    .single();
  if (error) return res.status(400).json(fail(error.message, 400));
  return res.json(ok(data));
}

export async function updateFcmToken(req: Request, res: Response) {
  const { error } = await supabaseAdmin
    .from('users')
    .update({ fcm_token: req.body.fcm_token })
    .eq('id', req.user!.id);
  if (error) return res.status(400).json(fail(error.message, 400));
  return res.json(ok({ updated: true }));
}

export async function checkEligibility(req: Request, res: Response) {
  const result = await checkDonorEligibility(req.body.answers);
  return res.json(ok(result));
}

export async function getPublicProfile(req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, blood_type, is_verified, total_donations, points, city, country_code, created_at')
    .eq('id', req.params.id)
    .single();
  if (error || !data) return res.status(404).json(fail('User not found', 404));
  return res.json(ok(data));
}

export async function downloadPassport(req: Request, res: Response) {
  const pdf = await generateHealthPassport(req.user!.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="bloodlink-passport.pdf"`);
  return res.send(pdf);
}

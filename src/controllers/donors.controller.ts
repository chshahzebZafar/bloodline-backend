import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ok, fail } from '../utils/response';
import { findNearbyDonors } from '../services/geo.service';
import { getCompatibleDonorTypes, ALL_BLOOD_TYPES, BloodType } from '../utils/bloodCompat';

export async function getNearbyDonors(req: Request, res: Response) {
  const { lat, lng, radius_km, blood_type, limit } =
    (req as any).validatedQuery ?? req.query;

  const compat: BloodType[] = blood_type
    ? getCompatibleDonorTypes(blood_type)
    : ALL_BLOOD_TYPES;

  const donors = await findNearbyDonors(
    Number(lat),
    Number(lng),
    Number(radius_km),
    compat,
    Number(limit)
  );

  // Strip sensitive fields
  const sanitized = donors.map((d) => ({
    id: d.id,
    name: d.name,
    blood_type: d.blood_type,
    is_verified: d.is_verified,
    total_donations: d.total_donations,
    distance_km: d.distance_km,
  }));

  return res.json(ok(sanitized, { count: sanitized.length }));
}

export async function getDonorProfile(req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, name, blood_type, is_verified, total_donations, points, city, country_code, created_at')
    .eq('id', req.params.id)
    .single();
  if (error || !data) return res.status(404).json(fail('Donor not found', 404));
  return res.json(ok(data));
}

export async function getLeaderboard(req: Request, res: Response) {
  const { scope, country_code, city, limit } =
    (req as any).validatedQuery ?? req.query;

  let query = supabaseAdmin
    .from('users')
    .select('id, name, blood_type, is_verified, total_donations, points, city, country_code')
    .eq('active_role', 'donor')
    .order('total_donations', { ascending: false })
    .limit(Number(limit));

  if (scope === 'country' && country_code) query = query.eq('country_code', country_code);
  if (scope === 'city' && city) query = query.eq('city', city);

  const { data, error } = await query;
  if (error) return res.status(400).json(fail(error.message, 400));

  const ranked = (data ?? []).map((u, i) => ({ rank: i + 1, ...u }));
  return res.json(ok(ranked));
}

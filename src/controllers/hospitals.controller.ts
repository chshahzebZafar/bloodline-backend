import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ok, fail } from '../utils/response';
import { findNearbyHospitals } from '../services/geo.service';

export async function listHospitals(req: Request, res: Response) {
  const { lat, lng, country_code, name, radius_km } =
    (req as any).validatedQuery ?? req.query;
  const data = await findNearbyHospitals(Number(lat), Number(lng), {
    countryCode: country_code,
    nameSearch: name,
    radiusKm: Number(radius_km),
  });
  return res.json(ok(data));
}

export async function getHospital(req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from('hospitals')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error || !data) return res.status(404).json(fail('Hospital not found', 404));
  return res.json(ok(data));
}

export async function updateStock(req: Request, res: Response) {
  // Partner auth — must be verified user; in v1 we just require auth
  const { error } = await supabaseAdmin
    .from('hospitals')
    .update({
      stock: req.body.stock,
      stock_updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id);

  if (error) return res.status(400).json(fail(error.message, 400));

  const { data, error: selErr } = await supabaseAdmin
    .from('hospitals')
    .select('id, name, stock, stock_updated_at')
    .eq('id', req.params.id)
    .single();

  if (selErr || !data) return res.status(404).json(fail('Hospital not found', 404));
  return res.json(ok(data));
}

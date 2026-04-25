import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ok, fail } from '../utils/response';
import { env } from '../config/env';
import { awardDonationPoints, markDonorDonated } from '../services/points.service';

export async function logDonation(req: Request, res: Response) {
  const body = req.body;

  // Cooldown enforcement: a donor must wait DONATION_COOLDOWN_DAYS (typically 56)
  // between whole-blood donations. `next_eligible_at` is a generated column on
  // users (last_donation_at + 56 days), so we trust it as the source of truth.
  const eligibleAt = req.user!.next_eligible_at;
  if (eligibleAt && new Date(eligibleAt) > new Date(body.donation_date)) {
    return res.status(409).json(
      fail(
        `Donor not eligible until ${new Date(eligibleAt).toISOString().slice(0, 10)}`,
        409
      )
    );
  }

  const { data, error } = await supabaseAdmin
    .from('donations')
    .insert({
      donor_id: req.user!.id,
      request_id: body.request_id ?? null,
      hospital_name: body.hospital_name,
      donation_date: body.donation_date,
      blood_type: body.blood_type,
      component: body.component,
      units: body.units,
      notes: body.notes ?? null,
      points_earned: env.POINTS_PER_DONATION,
    })
    .select('*')
    .single();

  if (error) return res.status(400).json(fail(error.message, 400));

  await Promise.all([
    awardDonationPoints(req.user!.id),
    markDonorDonated(req.user!.id, new Date(body.donation_date)),
  ]);

  return res.status(201).json(ok(data));
}

export async function getMyDonations(req: Request, res: Response) {
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  const offset = Number(req.query.offset ?? 0);
  const { data, error, count } = await supabaseAdmin
    .from('donations')
    .select('*', { count: 'exact' })
    .eq('donor_id', req.user!.id)
    .order('donation_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return res.status(400).json(fail(error.message, 400));
  return res.json(ok(data ?? [], { total: count ?? 0, limit, offset }));
}

export async function getDonationStats(req: Request, res: Response) {
  const { data: donations, error } = await supabaseAdmin
    .from('donations')
    .select('donation_date, units')
    .eq('donor_id', req.user!.id)
    .order('donation_date', { ascending: false });

  if (error) return res.status(400).json(fail(error.message, 400));

  const list = donations ?? [];
  const total_donations = list.length;
  const lives_saved = list.reduce((sum, d) => sum + (d.units ?? 1) * 3, 0);

  // Streak: consecutive donations at most ~120 days apart
  let current_streak = 0;
  let prev: Date | null = null;
  for (const d of list) {
    const date = new Date(d.donation_date);
    if (!prev) {
      current_streak = 1;
    } else {
      const diffDays = (prev.getTime() - date.getTime()) / 86400000;
      if (diffDays <= 120) current_streak += 1;
      else break;
    }
    prev = date;
  }

  const user = req.user!;
  const next_eligible_date = user.next_eligible_at ?? null;

  return res.json(
    ok({
      total_donations,
      lives_saved,
      current_streak,
      next_eligible_date,
      points: user.points,
    })
  );
}

export async function deleteDonation(req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from('donations')
    .delete()
    .eq('id', req.params.id)
    .eq('donor_id', req.user!.id)
    .gt('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .select('id')
    .single();

  if (error || !data) return res.status(400).json(fail('Can only delete within 24h', 400));
  return res.json(ok({ deleted: true }));
}

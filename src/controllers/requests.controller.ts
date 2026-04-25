import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ok, fail } from '../utils/response';
import { env } from '../config/env';
import { findNearbyDonors, findNearbyRequests, pointToGeog } from '../services/geo.service';
import { getCompatibleDonorTypes } from '../utils/bloodCompat';
import {
  buildRequestNotification,
  recordNotificationsBatch,
  sendPushToTokens,
  sendPushToUser,
} from '../services/notification.service';
import { awardDonationPoints, awardBonusPoints, markDonorDonated } from '../services/points.service';

export async function createRequest(req: Request, res: Response) {
  const body = req.body;
  const expiresAt = new Date(Date.now() + body.expires_in_hours * 3600 * 1000).toISOString();

  const { data: request, error } = await supabaseAdmin
    .from('blood_requests')
    .insert({
      recipient_id: req.user!.id,
      blood_type: body.blood_type,
      component: body.component,
      units_needed: body.units_needed,
      hospital_name: body.hospital_name,
      hospital_location: pointToGeog(body.hospital_lng, body.hospital_lat),
      ward: body.ward ?? null,
      urgency: body.urgency,
      search_radius_km: body.search_radius_km ?? env.DEFAULT_SEARCH_RADIUS_KM,
      expires_at: expiresAt,
      country_code: body.country_code ?? req.user!.country_code,
      city: body.city ?? req.user!.city,
      notes: body.notes ?? null,
    })
    .select('*')
    .single();

  if (error || !request) return res.status(400).json(fail(error?.message ?? 'Create failed', 400));

  // Fire-and-forget notifications
  notifyMatchingDonors(request, body.hospital_lat, body.hospital_lng).catch((err) =>
    console.error('[createRequest] notify failed:', err)
  );

  return res.status(201).json(ok(request));
}

async function notifyMatchingDonors(request: any, lat: number, lng: number) {
  const compat = getCompatibleDonorTypes(request.blood_type);
  const donors = await findNearbyDonors(lat, lng, request.search_radius_km, compat, 500);
  const tokens = donors.map((d) => d.fcm_token).filter((t): t is string => !!t);
  const userIds = donors.map((d) => d.id);

  const payload = buildRequestNotification(request, donors[0]?.distance_km ?? 0);
  await Promise.all([
    sendPushToTokens(tokens, payload),
    recordNotificationsBatch(userIds, payload),
  ]);
}

export async function getNearbyRequests(req: Request, res: Response) {
  const { lat, lng, radius_km, blood_type, urgency, limit } =
    (req as any).validatedQuery ?? req.query;

  const compat = blood_type ? getCompatibleDonorTypes(blood_type) : [];
  const requests = await findNearbyRequests(
    Number(lat),
    Number(lng),
    Number(radius_km),
    compat
  );

  let filtered = requests;
  if (urgency) filtered = filtered.filter((r) => r.urgency === urgency);

  return res.json(ok(filtered.slice(0, Number(limit)), { count: filtered.length }));
}

export async function getMyRequests(req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from('blood_requests')
    .select('*')
    .eq('recipient_id', req.user!.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json(fail(error.message, 400));
  return res.json(ok(data ?? []));
}

export async function getRequestById(req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from('blood_requests')
    .select('*, recipient:recipient_id(id,name,blood_type,is_verified), donor:accepted_by(id,name,blood_type,is_verified)')
    .eq('id', req.params.id)
    .single();
  if (error || !data) return res.status(404).json(fail('Request not found', 404));
  return res.json(ok(data));
}

export async function updateRequest(req: Request, res: Response) {
  const patch: Record<string, any> = { ...req.body };
  if (patch.expires_in_hours) {
    patch.expires_at = new Date(Date.now() + patch.expires_in_hours * 3600 * 1000).toISOString();
    delete patch.expires_in_hours;
  }

  const { data, error } = await supabaseAdmin
    .from('blood_requests')
    .update(patch)
    .eq('id', req.params.id)
    .eq('recipient_id', req.user!.id)
    .select('*')
    .single();

  if (error) return res.status(400).json(fail(error.message, 400));
  if (!data) return res.status(403).json(fail('Not allowed to update this request', 403));
  return res.json(ok(data));
}

export async function cancelRequest(req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from('blood_requests')
    .update({ status: 'cancelled' })
    .eq('id', req.params.id)
    .eq('recipient_id', req.user!.id)
    .eq('status', 'open')
    .select('id')
    .single();
  if (error || !data) return res.status(400).json(fail('Cancel failed', 400));
  return res.json(ok({ cancelled: true }));
}

export async function acceptRequest(req: Request, res: Response) {
  const { data: current } = await supabaseAdmin
    .from('blood_requests')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (!current) return res.status(404).json(fail('Request not found', 404));
  if (current.status !== 'open') return res.status(409).json(fail('Request is no longer open', 409));
  if (current.recipient_id === req.user!.id)
    return res.status(400).json(fail('Cannot accept your own request', 400));

  const { data, error } = await supabaseAdmin
    .from('blood_requests')
    .update({
      status: 'accepted',
      accepted_by: req.user!.id,
      accepted_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .eq('status', 'open')
    .select('*')
    .single();

  if (error || !data) return res.status(409).json(fail('Failed to accept — may be taken', 409));

  await sendPushToUser(current.recipient_id, {
    title: '✅ Donor accepted your request',
    body: `${req.user!.name} (${req.user!.blood_type}) is on the way to ${current.hospital_name}.`,
    data: { request_id: current.id, screen: 'RequestDetail' },
  }).catch(() => null);

  return res.json(ok(data));
}

export async function fulfillRequest(req: Request, res: Response) {
  const { data: current } = await supabaseAdmin
    .from('blood_requests')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (!current) return res.status(404).json(fail('Request not found', 404));
  if (current.recipient_id !== req.user!.id && current.accepted_by !== req.user!.id) {
    return res.status(403).json(fail('Not a participant in this request', 403));
  }
  if (current.status !== 'accepted') {
    return res.status(409).json(fail('Request not in accepted state', 409));
  }

  const { data, error } = await supabaseAdmin
    .from('blood_requests')
    .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select('*')
    .single();

  if (error || !data) return res.status(400).json(fail('Fulfill failed', 400));

  if (current.accepted_by) {
    await Promise.all([
      awardDonationPoints(current.accepted_by),
      markDonorDonated(current.accepted_by),
      supabaseAdmin.from('donations').insert({
        donor_id: current.accepted_by,
        request_id: current.id,
        hospital_name: current.hospital_name,
        donation_date: new Date().toISOString().slice(0, 10),
        blood_type: current.blood_type,
        component: current.component,
        units: current.units_needed,
        points_earned: env.POINTS_PER_DONATION,
      }),
    ]);
    await awardBonusPoints(current.recipient_id, 10).catch(() => null);
  }

  return res.json(ok(data));
}

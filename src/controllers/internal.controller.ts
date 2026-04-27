import { Request, Response } from 'express';
import { ok, fail } from '../utils/response';
import { logger } from '../config/logger';
import { supabaseAdmin } from '../config/supabase';
import { notifyMatchingDonors } from '../services/matching.service';
import { sendPushToUser } from '../services/notification.service';

/**
 * Internal webhook endpoints — invoked by Supabase Database Webhooks, not by
 * mobile clients. Auth is via shared-secret header (see middleware/webhookAuth).
 *
 * Supabase webhook payload shape (postgres trigger):
 *   {
 *     type: 'INSERT' | 'UPDATE' | 'DELETE',
 *     table: 'blood_requests',
 *     schema: 'public',
 *     record: { ...new row... },
 *     old_record: { ...old row, only on UPDATE/DELETE... } | null
 *   }
 */

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: any;
  old_record: any | null;
}

/**
 * Fan out pushes when a new blood request lands in the DB. Mobile inserts
 * directly via the Supabase JS client, so this is the only place the
 * server-side notification logic gets to run.
 *
 * Hospital lat/lng need extracting from the GEOGRAPHY column. We re-fetch
 * via the find_nearby_requests RPC… simpler: query ST_X / ST_Y once.
 */
export async function onRequestCreated(req: Request, res: Response) {
  const payload = req.body as WebhookPayload;

  if (payload?.type !== 'INSERT' || payload?.table !== 'blood_requests') {
    // Webhook misconfigured to fire on the wrong event — log loudly so the
    // operator notices, but ack with 200 so Supabase doesn't retry forever.
    logger.warn({ payload }, 'request-created webhook fired with unexpected payload');
    return res.json(ok({ skipped: true, reason: 'unexpected payload' }));
  }

  const row = payload.record;
  if (!row?.id) {
    return res.status(400).json(fail('Missing record.id in webhook payload', 400));
  }

  // hospital_location is GEOGRAPHY in Postgres → arrives as hex EWKB string
  // through the webhook. Easiest: re-query via our RPC that already extracts
  // lat/lng cleanly, scoped to this single row.
  const { data: latLng, error: latLngErr } = await supabaseAdmin
    .rpc('find_nearby_requests', {
      p_lng: 0,
      p_lat: 0,
      p_radius_m: 40_075_000, // half earth's circumference — matches anywhere
      p_blood_types: [row.blood_type],
    });

  if (latLngErr) {
    logger.error({ err: latLngErr, requestId: row.id }, 'failed to resolve hospital coords');
    return res.status(500).json(fail('Could not resolve hospital coords', 500));
  }

  const match = (latLng ?? []).find((r: any) => r.id === row.id);
  if (!match) {
    // Possible if request expired between insert and webhook delivery, or
    // if status is no longer 'open'. Not a bug worth retrying.
    logger.info({ requestId: row.id }, 'request not eligible for fan-out (expired or non-open)');
    return res.json(ok({ skipped: true, reason: 'not eligible' }));
  }

  try {
    const result = await notifyMatchingDonors(
      {
        id: row.id,
        blood_type: row.blood_type,
        hospital_name: row.hospital_name,
        urgency: row.urgency,
        search_radius_km: row.search_radius_km ?? 25,
        units_needed: row.units_needed ?? 1,
      },
      match.lat,
      match.lng
    );
    logger.info({ requestId: row.id, ...result }, 'request fan-out complete');
    return res.json(ok(result));
  } catch (err: any) {
    logger.error({ err, requestId: row.id }, 'request fan-out failed');
    return res.status(500).json(fail('Fan-out failed', 500));
  }
}

/**
 * Push notifications for blood_requests UPDATE events. One handler covers
 * multiple status transitions because they all flow through the same webhook.
 *
 * Currently handles:
 *   open      → accepted   : push to recipient ("a donor is on the way")
 *   accepted  → fulfilled  : push to donor    ("thanks, points awarded")
 *
 * Other transitions (cancelled, expired) are intentionally silent — those
 * states don't benefit from a push and could be surprising.
 */
export async function onRequestAccepted(req: Request, res: Response) {
  const payload = req.body as WebhookPayload;

  if (payload?.type !== 'UPDATE' || payload?.table !== 'blood_requests') {
    return res.json(ok({ skipped: true, reason: 'unexpected payload' }));
  }

  const { record: row, old_record: prev } = payload;

  // ---- Transition 1: open → accepted (notify recipient) ----
  const justAccepted =
    prev?.status === 'open' && row?.status === 'accepted' && row?.accepted_by;

  if (justAccepted) {
    const { data: donor } = await supabaseAdmin
      .from('users')
      .select('name, blood_type')
      .eq('id', row.accepted_by)
      .maybeSingle();

    await sendPushToUser(row.recipient_id, {
      title: '✅ Donor accepted your request',
      body: `${donor?.name ?? 'A donor'} (${donor?.blood_type ?? row.blood_type}) is on the way to ${row.hospital_name}.`,
      data: { request_id: row.id, screen: 'RequestDetail' },
    }).catch((err) => logger.warn({ err }, 'accept push failed'));

    return res.json(ok({ notified: row.recipient_id, transition: 'accepted' }));
  }

  // ---- Transition 2: accepted → fulfilled (thank the donor) ----
  const justFulfilled =
    prev?.status === 'accepted' && row?.status === 'fulfilled' && row?.accepted_by;

  if (justFulfilled) {
    await sendPushToUser(row.accepted_by, {
      title: '🩸 Thank you for donating!',
      body: `Your donation at ${row.hospital_name} has been confirmed. Points credited to your account.`,
      data: { request_id: row.id, screen: 'RequestDetail' },
    }).catch((err) => logger.warn({ err }, 'fulfill push failed'));

    return res.json(ok({ notified: row.accepted_by, transition: 'fulfilled' }));
  }

  return res.json(ok({ skipped: true, reason: 'no notifiable transition' }));
}

/**
 * Notify the other party when a chat message lands.
 * Fired by an INSERT webhook on messages.
 */
export async function onMessageCreated(req: Request, res: Response) {
  const payload = req.body as WebhookPayload;

  if (payload?.type !== 'INSERT' || payload?.table !== 'messages') {
    return res.json(ok({ skipped: true, reason: 'unexpected payload' }));
  }

  const msg = payload.record;
  if (!msg?.request_id || !msg?.sender_id) {
    return res.status(400).json(fail('Missing request_id or sender_id', 400));
  }

  // System messages don't generate pushes
  if (msg.msg_type === 'system') {
    return res.json(ok({ skipped: true, reason: 'system message' }));
  }

  // Find the recipient = whichever participant isn't the sender
  const { data: thread } = await supabaseAdmin
    .from('blood_requests')
    .select('id, recipient_id, accepted_by, hospital_name')
    .eq('id', msg.request_id)
    .maybeSingle();

  if (!thread) {
    return res.json(ok({ skipped: true, reason: 'thread not found' }));
  }

  const recipientId =
    msg.sender_id === thread.recipient_id ? thread.accepted_by : thread.recipient_id;

  if (!recipientId) {
    // Conversation has only one participant so far (donor not yet accepted)
    return res.json(ok({ skipped: true, reason: 'no second participant yet' }));
  }

  const { data: sender } = await supabaseAdmin
    .from('users')
    .select('name')
    .eq('id', msg.sender_id)
    .maybeSingle();

  const preview =
    msg.msg_type === 'location' ? '📍 Shared a location' : (msg.content ?? '').slice(0, 120);

  await sendPushToUser(recipientId, {
    title: sender?.name ?? 'New message',
    body: preview,
    data: { request_id: thread.id, screen: 'Chat' },
  }).catch((err) => logger.warn({ err }, 'message push failed'));

  return res.json(ok({ notified: recipientId }));
}

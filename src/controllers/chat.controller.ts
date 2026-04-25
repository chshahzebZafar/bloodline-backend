import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ok, fail } from '../utils/response';
import { pointToGeog } from '../services/geo.service';
import { sendPushToUser } from '../services/notification.service';

export async function listChats(req: Request, res: Response) {
  const { data, error } = await supabaseAdmin
    .from('blood_requests')
    .select('id, blood_type, hospital_name, status, urgency, recipient_id, accepted_by, created_at')
    .or(`recipient_id.eq.${req.user!.id},accepted_by.eq.${req.user!.id}`)
    .in('status', ['accepted', 'fulfilled'])
    .order('created_at', { ascending: false });

  if (error) return res.status(400).json(fail(error.message, 400));
  return res.json(ok(data ?? []));
}

async function assertParticipant(requestId: string, userId: string) {
  const { data } = await supabaseAdmin
    .from('blood_requests')
    .select('id, recipient_id, accepted_by')
    .eq('id', requestId)
    .single();
  if (!data) return null;
  if (data.recipient_id !== userId && data.accepted_by !== userId) return null;
  return data;
}

export async function getChat(req: Request, res: Response) {
  const requestId = String(req.params.requestId);
  const chat = await assertParticipant(requestId, req.user!.id);
  if (!chat) return res.status(403).json(fail('Not a participant', 403));

  const { data: last } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return res.json(ok({ chat, last_message: last ?? null }));
}

export async function listMessages(req: Request, res: Response) {
  const requestId = String(req.params.requestId);
  const chat = await assertParticipant(requestId, req.user!.id);
  if (!chat) return res.status(403).json(fail('Not a participant', 403));

  const limit = Math.min(Number(req.query.limit ?? 30), 100);
  const cursor = req.query.cursor as string | undefined;

  let q = supabaseAdmin
    .from('messages')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (cursor) q = q.lt('created_at', cursor);

  const { data, error } = await q;
  if (error) return res.status(400).json(fail(error.message, 400));

  const messages = (data ?? []).reverse();
  const next_cursor = data && data.length === limit ? data[data.length - 1].created_at : null;
  return res.json(ok(messages, { next_cursor }));
}

export async function sendMessage(req: Request, res: Response) {
  const requestId = String(req.params.requestId);
  const chat = await assertParticipant(requestId, req.user!.id);
  if (!chat) return res.status(403).json(fail('Not a participant', 403));

  const body = req.body;
  if (body.msg_type === 'location' && (body.lat == null || body.lng == null)) {
    return res.status(400).json(fail('lat/lng required for location messages', 400));
  }
  if (body.msg_type === 'text' && !body.content) {
    return res.status(400).json(fail('content required for text messages', 400));
  }

  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      request_id: requestId,
      sender_id: req.user!.id,
      msg_type: body.msg_type,
      content: body.content ?? null,
      location: body.msg_type === 'location' ? pointToGeog(body.lng, body.lat) : null,
    })
    .select('*')
    .single();

  if (error) return res.status(400).json(fail(error.message, 400));

  const recipient = chat.recipient_id === req.user!.id ? chat.accepted_by : chat.recipient_id;
  if (recipient) {
    sendPushToUser(recipient, {
      title: `💬 ${req.user!.name}`,
      body: body.msg_type === 'location' ? '📍 Shared location' : body.content ?? '',
      data: { request_id: requestId, screen: 'Chat' },
    }).catch(() => null);
  }

  return res.status(201).json(ok(data));
}

export async function markRead(req: Request, res: Response) {
  const requestId = String(req.params.requestId);
  const chat = await assertParticipant(requestId, req.user!.id);
  if (!chat) return res.status(403).json(fail('Not a participant', 403));

  const { error } = await supabaseAdmin
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('request_id', requestId)
    .neq('sender_id', req.user!.id)
    .is('read_at', null);

  if (error) return res.status(400).json(fail(error.message, 400));
  return res.json(ok({ marked: true }));
}

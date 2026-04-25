import { supabaseAdmin } from '../config/supabase';
import { initFirebase } from '../config/firebase';

type PushData = Record<string, string>;

export interface PushPayload {
  title: string;
  body: string;
  data?: PushData;
}

function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );
}

export async function sendPushToTokens(tokens: string[], payload: PushPayload): Promise<number> {
  const admin = initFirebase();
  if (!admin || !tokens.length) return 0;

  const unique = Array.from(new Set(tokens.filter(Boolean)));
  let delivered = 0;
  const invalidTokens: string[] = [];

  for (const batch of chunk(unique, 500)) {
    const res = await admin.messaging().sendEachForMulticast({
      tokens: batch,
      notification: { title: payload.title, body: payload.body },
      data: payload.data ?? {},
      android: { priority: 'high', notification: { sound: 'default' } },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });
    delivered += res.successCount;

    res.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code ?? '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          invalidTokens.push(batch[i]);
        }
      }
    });
  }

  if (invalidTokens.length) {
    await supabaseAdmin.from('users').update({ fcm_token: null }).in('fcm_token', invalidTokens);
  }

  return delivered;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('fcm_token')
    .eq('id', userId)
    .single();

  await supabaseAdmin.from('notifications').insert({
    user_id: userId,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  });

  if (!data?.fcm_token) return 0;
  return sendPushToTokens([data.fcm_token], payload);
}

export function buildRequestNotification(
  request: { blood_type: string; urgency: string; hospital_name: string; units_needed: number; id: string },
  distanceKm: number
): PushPayload {
  const urgencyIcon = { normal: '🩸', urgent: '⚠️', critical: '🚨' }[request.urgency] ?? '🩸';
  return {
    title: `${urgencyIcon} ${request.blood_type} needed — ${distanceKm.toFixed(1)}km away`,
    body: `${request.hospital_name} · ${request.units_needed} unit(s) · ${request.urgency.toUpperCase()}`,
    data: { request_id: request.id, screen: 'RequestDetail' },
  };
}

export async function recordNotificationsBatch(
  userIds: string[],
  payload: PushPayload
): Promise<void> {
  if (!userIds.length) return;
  const rows = userIds.map((user_id) => ({
    user_id,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }));
  await supabaseAdmin.from('notifications').insert(rows);
}

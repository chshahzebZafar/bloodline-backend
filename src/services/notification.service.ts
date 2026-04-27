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

/**
 * Push target — pairs an FCM token with the user it currently belongs to.
 *
 * We track userId alongside the token because invalid-token cleanup needs
 * to clear by user (not by token value). A token can briefly exist on two
 * user rows when the same physical device switches accounts: clearing by
 * token value would wipe the freshly-valid token from the new user too.
 */
export interface PushTarget {
  userId: string;
  token: string;
}

export async function sendPushToTokens(
  targets: PushTarget[],
  payload: PushPayload
): Promise<number> {
  const admin = initFirebase();
  if (!admin || !targets.length) return 0;

  // Dedupe by token but preserve the userId mapping so we can clear precisely.
  // If a token genuinely appears on two userIds, we'll only have the first
  // mapping — that's fine for delivery (FCM handles dedupe) and acceptable
  // for cleanup (worst case a stale row sticks around one extra cycle).
  const tokenToUser = new Map<string, string>();
  for (const t of targets) {
    if (t.token && !tokenToUser.has(t.token)) tokenToUser.set(t.token, t.userId);
  }
  const uniqueTokens = Array.from(tokenToUser.keys());
  let delivered = 0;
  const invalidUserIds: string[] = [];

  for (const batch of chunk(uniqueTokens, 500)) {
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
          const owner = tokenToUser.get(batch[i]);
          if (owner) invalidUserIds.push(owner);
        }
      }
    });
  }

  if (invalidUserIds.length) {
    // Clear the token on the *user row that owned this stale token at fan-out
    // time*, not on every row whose fcm_token equals the value. The latter
    // would also wipe a freshly-registered token on a different user who
    // happens to be on the same device after a logout/login swap.
    await supabaseAdmin.from('users').update({ fcm_token: null }).in('id', invalidUserIds);
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
  return sendPushToTokens([{ userId, token: data.fcm_token }], payload);
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

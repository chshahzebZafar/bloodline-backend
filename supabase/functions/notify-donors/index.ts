// Triggered via HTTP POST after new blood_requests INSERT
// (configure as a DB webhook or call from Express post-insert).
// Payload: { type: "INSERT", record: <blood_requests row> }

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCompatibleDonorTypes } from '../_shared/bloodCompat.ts';
import { sendFCMBatch } from '../_shared/fcm.ts';

serve(async (req: Request) => {
  try {
    const payload = await req.json();
    const record = payload.record ?? payload;

    if (!record?.hospital_location || !record?.blood_type) {
      return new Response(JSON.stringify({ error: 'invalid payload' }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // hospital_location is PostGIS geography — Supabase returns GeoJSON
    const coords = record.hospital_location?.coordinates ?? null;
    if (!coords) {
      return new Response(JSON.stringify({ error: 'no coordinates' }), { status: 400 });
    }

    const compat = getCompatibleDonorTypes(record.blood_type);
    const radiusM = (record.search_radius_km ?? 25) * 1000;

    const { data: donors, error } = await supabase.rpc('find_nearby_donors', {
      p_lng: coords[0],
      p_lat: coords[1],
      p_radius_m: radiusM,
      p_blood_types: compat,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    const tokens = (donors ?? [])
      .map((d: { fcm_token: string | null }) => d.fcm_token)
      .filter((t: string | null): t is string => !!t);

    const userIds = (donors ?? []).map((d: { id: string }) => d.id);

    const urgencyIcon: Record<string, string> =
      { normal: '🩸', urgent: '⚠️', critical: '🚨' };

    const notification = {
      title: `${urgencyIcon[record.urgency] ?? '🩸'} ${record.blood_type} needed`,
      body: `${record.hospital_name} · ${record.units_needed} unit(s) · ${record.urgency?.toUpperCase() ?? 'NORMAL'}`,
      data: { request_id: String(record.id), screen: 'RequestDetail' },
    };

    const fcm = tokens.length ? await sendFCMBatch(tokens, notification) : { sent: 0, failed: 0 };

    if (userIds.length) {
      await supabase.from('notifications').insert(
        userIds.map((user_id: string) => ({
          user_id,
          title: notification.title,
          body: notification.body,
          data: notification.data,
        }))
      );
    }

    return new Response(
      JSON.stringify({ matched: donors?.length ?? 0, sent: fcm.sent, failed: fcm.failed }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  } catch (err) {
    console.error('notify-donors error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

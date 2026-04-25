// Triggered via HTTP POST when blood_requests.status changes to 'fulfilled'.
// Payload: { type: "UPDATE", record: <new row>, old_record: <prev row> }

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req: Request) => {
  try {
    const payload = await req.json();
    const record = payload.record ?? payload;
    const oldRecord = payload.old_record ?? null;

    if (record?.status !== 'fulfilled' || !record?.accepted_by) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }
    if (oldRecord?.status === 'fulfilled') {
      return new Response(JSON.stringify({ skipped: 'already fulfilled' }), { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    await supabase.rpc('increment_points', {
      p_user_id: record.accepted_by,
      p_points: 100,
      p_increment_donations: 1,
    });

    await supabase
      .from('users')
      .update({
        last_donation_at: new Date().toISOString(),
        availability: 'cooldown',
      })
      .eq('id', record.accepted_by);

    await supabase.rpc('increment_points', {
      p_user_id: record.recipient_id,
      p_points: 10,
      p_increment_donations: 0,
    });

    return new Response(JSON.stringify({ awarded: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('award-points error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});

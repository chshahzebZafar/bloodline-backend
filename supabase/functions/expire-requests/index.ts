// Cron: */30 * * * *
// Marks open requests past expires_at as expired.

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data, error } = await supabase
    .from('blood_requests')
    .update({ status: 'expired' })
    .eq('status', 'open')
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) {
    console.error('expire-requests error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const count = data?.length ?? 0;
  console.log(`expire-requests: expired ${count} request(s)`);

  // Reset donors who have completed their cooldown
  await supabase
    .from('users')
    .update({ availability: 'available' })
    .eq('availability', 'cooldown')
    .lte('next_eligible_at', new Date().toISOString());

  return new Response(JSON.stringify({ expired: count }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});

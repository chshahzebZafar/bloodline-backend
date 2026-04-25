import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

export const supabaseAdmin: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);

export function supabaseFromToken(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * Fresh anon client for auth calls (signIn / signUp / OTP).
 *
 * Using the admin singleton for sign-in mutates its in-memory session and
 * leaks the logged-in user's JWT into subsequent service-role queries, which
 * then fail RLS. Always use a throwaway client for operations that set a session.
 */
export function supabaseAuthClient(): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

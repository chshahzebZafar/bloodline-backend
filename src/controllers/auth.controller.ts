import { Request, Response } from 'express';
import { supabaseAdmin, supabaseAuthClient } from '../config/supabase';
import { ok, fail } from '../utils/response';
import { pointToGeog } from '../services/geo.service';
import { sendPasswordResetEmail } from '../services/email.service';
import { logger } from '../config/logger';
import { env } from '../config/env';

export async function register(req: Request, res: Response) {
  const { email, phone, password, name, blood_type, lat, lng, country_code, city, referred_by } =
    req.body;

  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    phone,
    password,
    email_confirm: !!email,
    phone_confirm: !!phone,
    user_metadata: { name, blood_type },
  });

  if (authErr || !authData.user) {
    return res.status(400).json(fail(authErr?.message ?? 'Registration failed', 400));
  }

  // PostGIS accepts WKT directly on insert; SRID prefix is honored.
  const locationValue = (lat != null && lng != null) ? `SRID=4326;POINT(${lng} ${lat})` : null;
  
  const { data: profile, error: profErr } = await supabaseAdmin
    .from('users')
    .insert({
      auth_id: authData.user.id,
      email: email ?? null,
      phone: phone ?? null,
      name,
      blood_type,
      location: locationValue,
      country_code: country_code ?? null,
      city: city ?? null,
      referred_by: referred_by ?? null,
    })
    .select('*')
    .single();

  if (profErr) {
    console.error('Database insert error:', profErr);
    console.error('Error details:', JSON.stringify(profErr, null, 2));
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return res.status(400).json(fail(profErr.message, 400));
  }

  const authClient = supabaseAuthClient();
  const signInRes = email
    ? await authClient.auth.signInWithPassword({ email, password })
    : await authClient.auth.signInWithPassword({ phone: phone!, password });

  return res.status(201).json(
    ok({
      user: profile,
      session: signInRes.data.session,
    })
  );
}

export async function login(req: Request, res: Response) {
  const { email, phone, password } = req.body;
  const authClient = supabaseAuthClient();
  const { data, error } = email
    ? await authClient.auth.signInWithPassword({ email, password })
    : await authClient.auth.signInWithPassword({ phone, password });

  if (error || !data.session) {
    return res.status(401).json(fail(error?.message ?? 'Invalid credentials', 401));
  }

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('auth_id', data.user!.id)
    .single();

  return res.json(
    ok({
      user: profile,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    })
  );
}

export async function refresh(req: Request, res: Response) {
  const { refresh_token } = req.body;
  const authClient = supabaseAuthClient();
  const { data, error } = await authClient.auth.refreshSession({ refresh_token });
  if (error || !data.session) return res.status(401).json(fail('Invalid refresh token', 401));
  return res.json(
    ok({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    })
  );
}

export async function sendOtp(req: Request, res: Response) {
  const { phone } = req.body;
  const authClient = supabaseAuthClient();
  const { error } = await authClient.auth.signInWithOtp({ phone });
  if (error) return res.status(400).json(fail(error.message, 400));
  return res.json(ok({ sent: true }));
}

export async function verifyOtp(req: Request, res: Response) {
  const { phone, token } = req.body;
  const authClient = supabaseAuthClient();
  const { data, error } = await authClient.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error || !data.session || !data.user) {
    return res.status(401).json(fail(error?.message ?? 'OTP verification failed', 401));
  }

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('auth_id', data.user.id)
    .single();

  return res.json(
    ok({
      user: profile,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })
  );
}

export async function logout(req: Request, res: Response) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    // Revoke the access token server-side so a stolen token can't be reused.
    // signOut() with a token argument revokes that specific session.
    await supabaseAdmin.auth.admin.signOut(token).catch((err) => {
      console.warn('[auth] signOut failed (non-fatal):', err?.message);
    });
  }
  return res.json(ok({ logged_out: true }));
}

/**
 * Send a password recovery email — hybrid flow.
 *
 *   1. Use Supabase Admin API to MINT a real recovery token (no email sent).
 *   2. Send our own branded email via Resend with that token's action_link.
 *
 * Why this beats `auth.resetPasswordForEmail`:
 *   - Reliable delivery (Supabase's built-in SMTP throttles to ~2/hr).
 *   - Branded HTML — matches the rest of the BloodLink visual identity.
 *   - All transactional email goes through one service we control.
 *
 * Always returns 200 with `{sent:true}` to avoid leaking which emails exist
 * (email enumeration defense). Internally we still log the real outcome so
 * operators can see failures.
 */
export async function resetPassword(req: Request, res: Response) {
  const { email, redirect_to } = req.body;
  const targetRedirect = redirect_to ?? `${env.APP_DEEP_LINK_SCHEME}://reset-password`;

  // Step 1 — generate the recovery action_link via Admin API.
  // This produces the same secure, time-limited token Supabase would have
  // emailed itself. No email is sent yet because we haven't called
  // resetPasswordForEmail; generateLink is the "give me the link, I'll
  // deliver it myself" escape hatch.
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: targetRedirect },
  });

  // Email enumeration guard: if the user doesn't exist, Supabase returns an
  // error. We swallow it and respond 200 so attackers can't probe valid emails
  // by timing or status codes. Real errors get logged.
  if (error || !data?.properties?.action_link) {
    logger.info(
      { err: error?.message, email: redact(email) },
      'reset-password: generateLink returned no link (likely unknown email)'
    );
    return res.json(ok({ sent: true }));
  }

  // Step 2 — try to look up a name for personalization (optional).
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('name')
    .eq('email', email)
    .maybeSingle();

  // Step 3 — deliver via Resend.
  const sendResult = await sendPasswordResetEmail({
    to: email,
    recoveryLink: data.properties.action_link,
    name: profile?.name ?? null,
  });

  if (!sendResult.ok) {
    // Logged inside sendPasswordResetEmail. Still return success to client
    // (don't leak that email succeeded vs. delivery failed; just retry-safe).
    logger.warn({ email: redact(email), err: sendResult.error }, 'reset-password: email delivery failed');
  }

  return res.json(ok({ sent: true }));
}

/**
 * Mask all but the first character + domain of an email for logging.
 * Avoids dumping plaintext addresses into logs while keeping enough
 * signal to debug.
 */
function redact(email: string | undefined | null): string {
  if (!email) return '<missing>';
  const [local, domain] = email.split('@');
  if (!domain) return '<malformed>';
  return `${local[0] ?? ''}***@${domain}`;
}

/**
 * Permanently delete the authenticated user's account.
 *
 * Requires authentication. Cascades:
 *   1. Delete the public.users row → ON DELETE CASCADE clears donations,
 *      blood_requests, messages, notifications, stock_updates, etc.
 *   2. Delete the auth.users row via the admin API so the email/phone
 *      becomes available for re-registration.
 *
 * Required for App Store / Play Store compliance.
 */
export async function deleteAccount(req: Request, res: Response) {
  const profile = req.user;
  if (!profile) return res.status(401).json(fail('Not authenticated', 401));

  const profileId = profile.id;
  const authId = profile.auth_id;

  // 1. Profile row first — RLS-protected tables cascade off this.
  const { error: profileErr } = await supabaseAdmin
    .from('users')
    .delete()
    .eq('id', profileId);

  if (profileErr) {
    console.error('[auth] delete profile failed:', profileErr);
    return res.status(500).json(fail('Failed to delete profile data', 500));
  }

  // 2. Auth row — must use admin API.
  const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(authId);
  if (authErr) {
    // Profile is already gone, so log loudly but don't fail the request —
    // the user-facing data is cleared. Operator can sweep orphan auth rows.
    console.error('[auth] delete auth user failed (orphan auth row):', {
      auth_id: authId,
      error: authErr.message,
    });
  }

  return res.json(ok({ deleted: true }));
}

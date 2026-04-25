import { Request, Response } from 'express';
import { supabaseAdmin, supabaseAuthClient } from '../config/supabase';
import { ok, fail } from '../utils/response';
import { pointToGeog } from '../services/geo.service';

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
 * Send a password recovery email. Open endpoint (no auth required) — Supabase
 * does not reveal whether the email exists, so this is safe to expose.
 */
export async function resetPassword(req: Request, res: Response) {
  const { email, redirect_to } = req.body;
  const authClient = supabaseAuthClient();
  const { error } = await authClient.auth.resetPasswordForEmail(email, {
    redirectTo: redirect_to ?? 'bloodlink://reset-password',
  });
  if (error) return res.status(400).json(fail(error.message, 400));
  return res.json(ok({ sent: true }));
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

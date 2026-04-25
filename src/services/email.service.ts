import { Resend } from 'resend';
import { env } from '../config/env';
import { logger } from '../config/logger';

/**
 * Transactional email service.
 *
 * One Resend client; multiple template helpers below. Designed so screens
 * that need to send a one-off transactional email do NOT touch Resend
 * directly — they call a typed helper here. That keeps:
 *   - Sender / from-name consistent
 *   - Failure modes logged uniformly via pino
 *   - Templates / branding in one place
 *   - Future provider migration (Resend → SES → Postmark) a single-file change
 *
 * Returns `{ ok: true }` on success and `{ ok: false, error }` on failure.
 * Callers decide whether failure is fatal (signup confirmation = yes) or
 * silent (best-effort marketing email = no).
 */

let client: Resend | null = null;

function getClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(env.RESEND_API_KEY);
  return client;
}

interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

async function sendRaw(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<SendResult> {
  const resend = getClient();
  if (!resend) {
    logger.warn({ to: opts.to }, 'email.send skipped: RESEND_API_KEY missing');
    return { ok: false, error: 'Email service not configured' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: env.EMAIL_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    if (error) {
      logger.error({ err: error, to: opts.to }, 'email.send failed');
      return { ok: false, error: error.message ?? 'Resend rejected the request' };
    }
    logger.info({ id: data?.id, to: opts.to }, 'email.send ok');
    return { ok: true, id: data?.id };
  } catch (err: any) {
    logger.error({ err, to: opts.to }, 'email.send threw');
    return { ok: false, error: err?.message ?? 'Email delivery failed' };
  }
}

// ------------------------------------------------------------------
// Templates
// ------------------------------------------------------------------

const BRAND = {
  name: 'BloodLink',
  primary: '#C0392B',
  bg: '#F8F8F8',
  text: '#1F1F1F',
  subtext: '#666666',
  // Inline-styled HTML — most email clients strip <style> tags or lack support
  // for modern CSS. Keep everything inline.
};

/**
 * Wraps content in a branded shell. Pass the inner HTML; this adds header,
 * footer, and consistent spacing.
 */
function wrapShell(innerHtml: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.text};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;max-width:560px;width:100%;overflow:hidden;">
        <tr><td style="padding:32px 32px 16px 32px;border-bottom:1px solid #EFEFEF;">
          <div style="font-size:22px;font-weight:700;letter-spacing:-0.3px;color:${BRAND.primary};">🩸 ${BRAND.name}</div>
        </td></tr>
        <tr><td style="padding:24px 32px 32px 32px;font-size:15px;line-height:1.55;color:${BRAND.text};">
          ${innerHtml}
        </td></tr>
        <tr><td style="padding:16px 32px 24px 32px;border-top:1px solid #EFEFEF;font-size:12px;color:${BRAND.subtext};">
          You're receiving this because someone (hopefully you) requested it on BloodLink.<br>
          If this wasn't you, you can safely ignore this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();
}

function ctaButton(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background:${BRAND.primary};color:#FFFFFF;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:10px;font-size:15px;">${label}</a>`;
}

// ------------------------------------------------------------------
// Public template senders
// ------------------------------------------------------------------

/**
 * Password recovery. The link comes from supabase.auth.admin.generateLink
 * — a real, short-lived recovery token that lands the user on a
 * recovery session via the bloodlink:// deep link.
 */
export async function sendPasswordResetEmail(opts: {
  to: string;
  recoveryLink: string;
  /** Optional name personalization */
  name?: string | null;
}): Promise<SendResult> {
  const greeting = opts.name ? `Hi ${escapeHtml(opts.name)},` : 'Hi,';
  const inner = `
    <p style="margin:0 0 16px 0;">${greeting}</p>
    <p style="margin:0 0 16px 0;">We got a request to reset the password on your BloodLink account. Tap the button below to set a new one.</p>
    <p style="margin:24px 0;">${ctaButton('Reset my password', opts.recoveryLink)}</p>
    <p style="margin:0 0 8px 0;color:${BRAND.subtext};font-size:13px;">This link expires in 1 hour for your security.</p>
    <p style="margin:0;color:${BRAND.subtext};font-size:13px;">If the button doesn't work, copy this URL into your browser:</p>
    <p style="margin:8px 0 0 0;word-break:break-all;color:${BRAND.subtext};font-size:12px;">${escapeHtml(opts.recoveryLink)}</p>`;
  const text = [
    greeting,
    '',
    'We got a request to reset your BloodLink password.',
    'Open this link to set a new one (expires in 1 hour):',
    opts.recoveryLink,
    '',
    "If this wasn't you, you can ignore this email.",
  ].join('\n');

  return sendRaw({
    to: opts.to,
    subject: 'Reset your BloodLink password',
    html: wrapShell(inner),
    text,
  });
}

// ------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

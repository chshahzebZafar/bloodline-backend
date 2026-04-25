/**
 * One-shot push notification tester.
 *
 * Usage:
 *   npx ts-node scripts/test-push.ts <fcm_token>
 *
 * Or pull a token straight from the DB and push to it:
 *   npx ts-node scripts/test-push.ts --first
 *
 * Requires the same env vars as the API (FIREBASE_*, SUPABASE_*).
 */
import 'dotenv/config';
import { initFirebase, admin } from '../src/config/firebase';
import { supabaseAdmin } from '../src/config/supabase';

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: ts-node scripts/test-push.ts <fcm_token | --first>');
    process.exit(1);
  }

  initFirebase();

  let token: string;
  let recipientName = '';

  if (arg === '--first') {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('name, email, fcm_token')
      .not('fcm_token', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.fcm_token) {
      console.error('No user with an fcm_token found. Open the app, grant permission, then retry.');
      process.exit(1);
    }
    token = data.fcm_token;
    recipientName = `${data.name} <${data.email}>`;
    console.log(`Targeting most recently active user: ${recipientName}`);
  } else {
    token = arg;
  }

  console.log(`Sending test push to ${token.slice(0, 24)}…`);

  try {
    const messageId = await admin.messaging().send({
      token,
      notification: {
        title: '🩸 BloodLink test',
        body: 'If you see this, push notifications are working end-to-end.',
      },
      data: {
        // Tapping the notification routes to /chat/test in app/_layout.tsx —
        // expect it to fail to load that chat (test ID), but the navigation proves
        // the deep-link handler fires.
        requestId: 'test',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'bloodlink-requests',
          sound: 'default',
        },
      },
    });

    console.log(`✅ Sent. FCM message id: ${messageId}`);
    console.log('Check the device — should appear within a few seconds.');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Send failed:', err?.errorInfo ?? err?.message ?? err);
    if (err?.errorInfo?.code === 'messaging/registration-token-not-registered') {
      console.error('   → Token is stale. Re-open the app on the device to refresh it.');
    }
    process.exit(1);
  }
}

main();

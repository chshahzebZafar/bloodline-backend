// Minimal FCM v1 sender for Deno Edge Functions.
// Obtains an OAuth2 access token via service account JWT, then sends individually.

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const clean = pem.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`OAuth failed: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getCachedToken(sa: ServiceAccount): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.token;
  const token = await getAccessToken(sa);
  cachedToken = { token, expiresAt: now + 3500 * 1000 };
  return token;
}

export async function sendFCMBatch(
  tokens: string[],
  notification: { title: string; body: string; data?: Record<string, string> }
): Promise<{ sent: number; failed: number }> {
  const sa: ServiceAccount = {
    project_id: Deno.env.get('FIREBASE_PROJECT_ID') ?? '',
    client_email: Deno.env.get('FIREBASE_CLIENT_EMAIL') ?? '',
    private_key: Deno.env.get('FIREBASE_PRIVATE_KEY') ?? '',
  };

  if (!sa.project_id || !sa.client_email || !sa.private_key || !tokens.length) {
    return { sent: 0, failed: tokens.length };
  }

  const accessToken = await getCachedToken(sa);
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  let sent = 0;
  let failed = 0;

  // FCM v1 has no batch endpoint; we fan-out in small waves
  const waves: string[][] = [];
  for (let i = 0; i < tokens.length; i += 20) waves.push(tokens.slice(i, i + 20));

  for (const wave of waves) {
    const results = await Promise.allSettled(
      wave.map((token) =>
        fetch(url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: notification.title, body: notification.body },
              data: notification.data ?? {},
              android: { priority: 'HIGH' },
              apns: { payload: { aps: { sound: 'default', badge: 1 } } },
            },
          }),
        })
      )
    );
    results.forEach((r) => {
      if (r.status === 'fulfilled' && r.value.ok) sent += 1;
      else failed += 1;
    });
  }

  return { sent, failed };
}

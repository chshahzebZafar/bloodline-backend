# BloodLink Backend — Setup & Implementation Guide

End-to-end instructions to go from a fresh clone → local dev server → deployed production.
Follow every section in order. Skip nothing.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone & Install](#2-clone--install)
3. [Create a Supabase Project](#3-create-a-supabase-project)
4. [Run Database Migrations](#4-run-database-migrations)
5. [Verify the Database](#5-verify-the-database)
6. [Configure Environment Variables](#6-configure-environment-variables)
7. [Firebase (Push Notifications)](#7-firebase-push-notifications)
8. [Anthropic Claude (AI Eligibility)](#8-anthropic-claude-ai-eligibility)
9. [Start the Local Dev Server](#9-start-the-local-dev-server)
10. [Deploy Supabase Edge Functions](#10-deploy-supabase-edge-functions)
11. [Wire Database Webhooks](#11-wire-database-webhooks)
12. [Enable Supabase Auth Providers](#12-enable-supabase-auth-providers)
13. [Test the API](#13-test-the-api)
14. [Deploy to Railway](#14-deploy-to-railway)
15. [Connect the Mobile App](#15-connect-the-mobile-app)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Prerequisites

Install these on your machine:

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20 | https://nodejs.org |
| npm | ≥ 10 | bundled with Node |
| Git | any | https://git-scm.com |
| Supabase CLI | latest | `npm install -g supabase` |
| Railway CLI *(for deploy)* | latest | `npm install -g @railway/cli` |
| Docker Desktop *(optional, for local Supabase)* | latest | https://www.docker.com/products/docker-desktop |

Create accounts on:

- **Supabase** — https://supabase.com (free tier is enough to start)
- **Firebase** — https://console.firebase.google.com (for push notifications)
- **Anthropic** — https://console.anthropic.com (for AI eligibility check)
- **Railway** — https://railway.app (for hosting the Express API)
- **Sentry** *(optional)* — https://sentry.io (error tracking)

---

## 2. Clone & Install

```bash
cd D:\Projects\bloodlink-backend
npm install
```

Expected: ~731 packages, 1–4 min on first install.

---

## 3. Create a Supabase Project

1. Go to https://supabase.com/dashboard
2. Click **New project**.
3. Fill in:
   - **Name:** `bloodlink`
   - **Database password:** generate a strong password (save it)
   - **Region:** pick the one closest to your users
   - **Plan:** Free
4. Wait ~2 minutes for provisioning.
5. Once ready, go to **Project Settings → API** and copy these three values:

   | Supabase value | Goes into `.env` as |
   |---|---|
   | Project URL | `SUPABASE_URL` |
   | `anon` `public` key | `SUPABASE_ANON_KEY` |
   | `service_role` `secret` key | `SUPABASE_SERVICE_ROLE_KEY` |

> ⚠️ **Never commit the service role key.** It bypasses RLS.

---

## 4. Run Database Migrations

You have two options — pick one.

### Option A: Paste SQL directly (simplest, no CLI needed)

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Open [`supabase/schema.sql`](supabase/schema.sql) in your code editor.
3. Copy the **entire file** (510 lines) and paste into the SQL editor.
4. Click **Run**. It should finish in 2–5 seconds with no errors.
5. (Optional) Repeat with [`supabase/seed.sql`](supabase/seed.sql) to add sample hospitals + events.

### Option B: Supabase CLI

```bash
# 1. Link your local project to the remote one
supabase link --project-ref <your-project-ref>
# (project ref is the 20-char string in your Supabase URL)

# 2. Push migrations
supabase db push

# 3. (Optional) seed
supabase db execute --file supabase/seed.sql
```

### What the migrations create

| Object | Count |
|---|---|
| PostgreSQL extensions | 3 (uuid-ossp, postgis, pg_trgm) |
| Enum types | 7 |
| Tables | 9 (users, blood_requests, donations, messages, hospitals, donation_events, event_rsvps, notifications, notification_prefs) |
| Triggers | 2 (updated_at, rsvp_count) |
| RPC functions | 4 (`increment_points`, `find_nearby_donors`, `find_nearby_requests`, `find_nearby_hospitals`) |
| RLS policies | ~18 |
| Indexes | ~20 (GiST + btree + trigram) |

---

## 5. Verify the Database

Open [`supabase/verify.sql`](supabase/verify.sql), paste into the SQL editor, run.
You should see:

| Check | Expected result |
|---|---|
| Extensions | `pg_trgm, postgis, uuid-ossp` |
| Enums | 7 rows |
| Tables | 9 rows |
| RLS enabled | `true` on every row |
| Policies per table | ≥ 1 on each |
| Geo indexes | 4 rows |
| RPC functions | 6 rows |
| `users.next_eligible_at` `is_generated` | `ALWAYS` |
| `find_nearby_donors` smoke test | `0` (empty DB is fine) |
| `find_nearby_hospitals` smoke test | `5` if you ran `seed.sql`, else `0` |

If **any** check fails, re-run `schema.sql` — the `IF NOT EXISTS` / `DROP POLICY IF EXISTS` guards make it idempotent.

---

## 6. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in **every** section below.

### Required (minimum to boot)

```env
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...    # from step 3
SUPABASE_ANON_KEY=eyJhbG...            # from step 3
PORT=3000
NODE_ENV=development
```

### Recommended (to avoid degraded features)

```env
JWT_SECRET=<any-long-random-string>
```

Get it from **Supabase → Project Settings → API → JWT Settings → JWT Secret**.

### Feature-specific (add when you're ready to use each feature)

- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` → push notifications (see §7)
- `ANTHROPIC_API_KEY` → AI eligibility (see §8)
- `RESEND_API_KEY` → transactional email
- `MAPBOX_SECRET_TOKEN` → server-side geocoding
- `SENTRY_DSN` → error tracking

### App tunables (defaults are fine)

```env
DEFAULT_SEARCH_RADIUS_KM=25
MAX_SEARCH_RADIUS_KM=500
DONATION_COOLDOWN_DAYS=56
POINTS_PER_DONATION=100
POINTS_PER_REFERRAL=50
```

---

## 7. Firebase (Push Notifications)

1. Go to https://console.firebase.google.com → **Add project** → name it `bloodlink-app`.
2. Enable **Cloud Messaging** (should be on by default).
3. Go to **Project Settings → Service accounts → Generate new private key**.
4. Download the JSON file. Extract these three values:

   ```json
   {
     "project_id":   "bloodlink-app",
     "client_email": "firebase-adminsdk-xxxxx@bloodlink-app.iam.gserviceaccount.com",
     "private_key":  "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   }
   ```

5. Paste into `.env`:

   ```env
   FIREBASE_PROJECT_ID=bloodlink-app
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@bloodlink-app.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

   > **Important:** keep the quotes and the literal `\n` sequences. The code replaces them with real newlines at runtime.

6. *(Mobile side)* Register the same Firebase project in the React Native app to obtain FCM tokens.

---

## 8. Anthropic Claude (AI Eligibility)

1. Go to https://console.anthropic.com → **API keys** → **Create key**.
2. Copy the key (starts with `sk-ant-...`) into `.env`:

   ```env
   ANTHROPIC_API_KEY=sk-ant-...
   ```

3. Cost: ~$0.003 per eligibility check (sonnet-4.5, 256 max_tokens).
4. If this key is missing the `/users/me/eligibility` endpoint **fails open** — returns `eligible: true` with "consult staff" advice. No crashes.

---

## 9. Start the Local Dev Server

```bash
npm run dev
```

Expected output:

```
🩸 BloodLink API listening on :3000 (development)
```

Smoke test:

```bash
curl http://localhost:3000/health
```

Should return:

```json
{"success":true,"data":{"status":"ok","version":"1.0.0","db":"connected","env":"development"}}
```

If `db: "error"` — double-check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

---

## 10. Deploy Supabase Edge Functions

The three Edge Functions handle **async** work: matching donors, expiring requests, awarding points.

```bash
# 1. Log into Supabase CLI (once per machine)
supabase login

# 2. Link to your project
supabase link --project-ref <your-project-ref>

# 3. Deploy all three
supabase functions deploy notify-donors
supabase functions deploy expire-requests
supabase functions deploy award-points

# 4. Set the secrets each function needs
supabase secrets set FIREBASE_PROJECT_ID=bloodlink-app
supabase secrets set FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@...
supabase secrets set FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Each function will be exposed at:

```
https://<project-ref>.supabase.co/functions/v1/notify-donors
https://<project-ref>.supabase.co/functions/v1/expire-requests
https://<project-ref>.supabase.co/functions/v1/award-points
```

The cron schedule for `expire-requests` (`*/30 * * * *`) is set in [`supabase/config.toml`](supabase/config.toml).

---

## 11. Wire Database Webhooks

Two Edge Functions need to fire on DB events. Set up webhooks in the Supabase dashboard.

### Webhook 1 — `notify-donors` (on new blood request)

1. Supabase → **Database → Webhooks → Create a new hook**.
2. Name: `notify-donors-on-insert`
3. Table: `blood_requests`
4. Events: **Insert**
5. Type: **Supabase Edge Function**
6. Function: `notify-donors`
7. Method: `POST`
8. Save.

### Webhook 2 — `award-points` (on request fulfilled)

1. **Create a new hook**.
2. Name: `award-points-on-fulfilled`
3. Table: `blood_requests`
4. Events: **Update**
5. Type: **Supabase Edge Function**
6. Function: `award-points`
7. Method: `POST`
8. *(Optional)* Condition: `status = 'fulfilled'` — Supabase filters in the function itself anyway.
9. Save.

### Cron: `expire-requests`

Already scheduled via `supabase/config.toml`. To verify:

```bash
supabase functions list
```

Should show the cron schedule for `expire-requests`.

---

## 12. Enable Supabase Auth Providers

In the Supabase dashboard → **Authentication → Providers**:

### Email (always enabled)

- **Disable "Confirm email"** for dev convenience (otherwise `/auth/register` returns a session without the user being usable until they click an email link).
- Re-enable it in production with proper email templates.

### Phone (OTP)

1. Enable **Phone** provider.
2. Configure a SMS provider: Twilio, MessageBird, Vonage, or Textlocal.
   - For development, you can use the **Supabase test phone** feature (no real SMS).
3. SMS template is pre-configured in `supabase/config.toml`:
   ```
   Your BloodLink code is {{ .Code }}
   ```

Both `/auth/otp/send` and `/auth/otp/verify` will only work after this is configured.

---

## 13. Test the API

### Quick smoke test with `curl`

```bash
# 1. Register a donor
curl -X POST http://localhost:3000/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test Donor",
    "blood_type": "O+",
    "lat": 24.8607,
    "lng": 67.0011,
    "country_code": "PK",
    "city": "Karachi"
  }'
```

Save the `access_token` from the response, then:

```bash
TOKEN="eyJhbG..."

# 2. Get your profile
curl http://localhost:3000/v1/users/me \
  -H "Authorization: Bearer $TOKEN"

# 3. Find nearby hospitals (needs seed.sql run)
curl "http://localhost:3000/v1/hospitals?lat=24.8607&lng=67.0011" \
  -H "Authorization: Bearer $TOKEN"

# 4. Create a blood request
curl -X POST http://localhost:3000/v1/requests \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "blood_type": "O+",
    "units_needed": 2,
    "hospital_name": "Aga Khan",
    "hospital_lat": 24.8946,
    "hospital_lng": 67.0626,
    "urgency": "urgent",
    "expires_in_hours": 12
  }'
```

### Full endpoint list

See [README.md](README.md) for all 45 endpoints across 9 route groups.

---

## 14. Deploy to Railway

### First-time setup

```bash
railway login
railway init         # or `railway link` if project already exists
```

### Set env vars in Railway

Either via dashboard (**Variables** tab) or CLI:

```bash
railway variables --set SUPABASE_URL=https://xxx.supabase.co \
                  --set SUPABASE_SERVICE_ROLE_KEY=eyJ... \
                  --set SUPABASE_ANON_KEY=eyJ... \
                  --set FIREBASE_PROJECT_ID=bloodlink-app \
                  --set FIREBASE_CLIENT_EMAIL=... \
                  --set FIREBASE_PRIVATE_KEY='...' \
                  --set ANTHROPIC_API_KEY=sk-ant-... \
                  --set NODE_ENV=production
```

### Deploy

```bash
railway up
```

Railway auto-detects the `Dockerfile` / `railway.toml`. First build ~2–4 min.
Get the public URL:

```bash
railway domain
```

Smoke test production:

```bash
curl https://bloodlink-backend.up.railway.app/health
```

### Auto-deploy from GitHub *(recommended)*

1. Push this folder to a GitHub repo.
2. In Railway: **New Project → Deploy from GitHub repo**.
3. Select the repo → Railway auto-builds on every push to `main`.

---

## 15. Connect the Mobile App

In your React Native app at `D:\Projects\bloodlink`, point to the new backend.

### Update `.env` in the mobile app

```env
EXPO_PUBLIC_API_URL=https://bloodlink-backend.up.railway.app/v1
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...   # anon key only — NEVER service role
```

### API calls

Use the access token from `/v1/auth/login` in every request:

```ts
fetch(`${API}/requests/nearby?lat=${lat}&lng=${lng}&radius_km=25`, {
  headers: { Authorization: `Bearer ${session.access_token}` },
});
```

### Realtime (chat, request status)

Subscribe directly via the Supabase client SDK — no HTTP call needed:

```ts
import { supabase } from './lib/supabase';

supabase
  .channel(`chat:${requestId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `request_id=eq.${requestId}`,
  }, (payload) => console.log('new message', payload.new))
  .subscribe();
```

### FCM token registration

After sign-in, send the device's FCM token to the backend:

```ts
fetch(`${API}/users/me/fcm-token`, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ fcm_token: await getFcmToken() }),
});
```

---

## 16. Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| `Environment validation failed` on startup | Missing required env var | Check `.env` — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` are mandatory |
| `/health` returns `db: "error"` | Wrong Supabase credentials OR migrations not run | Re-check `.env`, re-run `schema.sql` |
| `/auth/register` returns 400 "User already registered" | Email reused | Use a different email or delete the user in Supabase dashboard |
| `/auth/register` succeeds but `session` is null | Email confirmations enabled | Auth → Providers → Email → turn OFF "Confirm email" for dev |
| `/auth/otp/send` returns error | SMS provider not configured | Auth → Providers → Phone — add Twilio or similar |
| `/requests/nearby` returns empty always | No donors with `location` set | Call `/users/me/location` after registering |
| Push notifications don't arrive | Firebase creds wrong OR FCM token not sent to `/users/me/fcm-token` | Check server logs for FCM errors |
| "Firebase env vars missing — push notifications disabled" log | `FIREBASE_*` vars not set | Add them to `.env` or Railway variables |
| Edge Function `notify-donors` gets `{error: "no coordinates"}` | PostGIS geography not returning GeoJSON | Enable "Include old record" in webhook settings; check Supabase version |
| AI eligibility always returns `advice: "consult staff"` | `ANTHROPIC_API_KEY` missing | Add it to `.env` (endpoint intentionally fails open) |
| Railway build fails | Node version | Railway uses Node 20 by default — our `engines` field requires it |
| TypeScript compile errors after code changes | Stale `dist/` | `rm -rf dist && npm run build` |

### Where to find logs

- **Local:** terminal where `npm run dev` is running
- **Railway:** `railway logs` or dashboard → Deployments → View Logs
- **Edge Functions:** Supabase dashboard → Edge Functions → Logs tab
- **Database:** Supabase dashboard → Database → Logs

### Resetting everything

```bash
# Local: rebuild
rm -rf node_modules dist .env
cp .env.example .env    # refill values
npm install

# Remote DB: danger — deletes ALL data
# In Supabase SQL editor:
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;
# Then re-run schema.sql + seed.sql
```

---

## Final checklist ✅

Before calling it production-ready, confirm every box:

- [ ] `npm run dev` starts the server without errors
- [ ] `GET /health` returns `db: "connected"`
- [ ] `verify.sql` passes all 10 checks
- [ ] `POST /v1/auth/register` returns a session with `access_token`
- [ ] `GET /v1/users/me` with that token returns the profile
- [ ] `POST /v1/requests` creates a row in `blood_requests`
- [ ] Edge Functions deployed (`supabase functions list` shows 3)
- [ ] Database webhooks wired (2 hooks visible in dashboard)
- [ ] Railway deployed + `/health` reachable over HTTPS
- [ ] Mobile app can call `/v1/auth/login` against the Railway URL
- [ ] Push notification arrives on the test device after creating a matching request

Once every box is checked — you're live. 🩸

# BloodLink — End-to-End Smoke Test

Walk through this top-to-bottom. Each phase has an **Action**, an **Expected SQL** (paste into Supabase SQL editor to verify), and **Expected UI state**. If any check fails, use the **Troubleshoot** notes.

Plan on ~45 minutes. Two phones are ideal (Device A = recipient, Device B = donor). A single device works — you can use two Supabase users via logout/login.

---

## Table of Contents

0. [Prerequisites](#phase-0-prerequisites)
1. [Supabase health & migrations](#phase-1-supabase-health--migrations)
2. [Express backend health *(optional)*](#phase-2-express-backend-health-optional)
3. [Auth — register + login](#phase-3-auth--register--login)
4. [Profile — update location, role, availability, fcm token](#phase-4-profile--update-location-role-availability-fcm-token)
5. [Blood request lifecycle](#phase-5-blood-request-lifecycle)
6. [Chat + realtime](#phase-6-chat--realtime)
7. [Map + PostGIS RPC functions](#phase-7-map--postgis-rpc-functions)
8. [Notifications (in-app + push)](#phase-8-notifications-in-app--push)
9. [Leaderboard](#phase-9-leaderboard)
10. [Edge Functions — cron + triggered](#phase-10-edge-functions--cron--triggered)
11. [Passport PDF + Badges](#phase-11-passport-pdf--badges)
12. [Verified donor application](#phase-12-verified-donor-application)
13. [Account — data export + delete](#phase-13-account--data-export--delete)
14. [Final checklist](#final-checklist)

---

## Phase 0 — Prerequisites

Before starting, you need:

- [ ] Supabase project created at https://supabase.com/dashboard
- [ ] Project URL + `anon` key + `service_role` key copied
- [ ] Node 20+ installed
- [ ] Expo Go on a physical phone (push notifications won't work on simulator)
- [ ] Firebase project with FCM enabled (skip if you don't care about push yet)
- [ ] Mapbox access token (skip if you don't care about the map yet)

Create the mobile `.env`:

```bash
# D:\Projects\bloodlink\.env
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
EXPO_PUBLIC_MAPBOX_TOKEN=pk.eyJ1Ij...
```

Create the backend `.env` *(only if testing Express)*:

```bash
# D:\Projects\bloodlink-backend\.env
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
PORT=3000
NODE_ENV=development
```

---

## Phase 1 — Supabase health & migrations

### Action

1. Supabase dashboard → **SQL Editor** → **New query**
2. Paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql) (510 lines)
3. Click **Run**
4. In a new query, paste [`supabase/seed.sql`](supabase/seed.sql) (optional — adds 5 sample hospitals)
5. Run [`supabase/verify.sql`](supabase/verify.sql) section by section

### Expected SQL

```sql
-- Extensions installed
SELECT string_agg(extname, ', ' ORDER BY extname) AS extensions
FROM pg_extension WHERE extname IN ('uuid-ossp','postgis','pg_trgm');
-- → "pg_trgm, postgis, uuid-ossp"

-- 7 enums present
SELECT COUNT(*) FROM pg_type WHERE typtype='e' AND typname IN (
  'blood_type_enum','role_enum','availability_enum','urgency_enum',
  'req_status_enum','component_enum','msg_type_enum'
);
-- → 7

-- 9 tables present
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'
  AND table_name IN (
    'users','blood_requests','donations','messages','hospitals',
    'donation_events','event_rsvps','notifications','notification_prefs'
  );
-- → 9

-- RPC functions available
SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND proname IN (
  'increment_points','find_nearby_donors','find_nearby_requests','find_nearby_hospitals'
);
-- → 4

-- RLS is on
SELECT relname, relrowsecurity FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r'
  AND c.relname IN ('users','blood_requests','donations','messages','hospitals')
ORDER BY relname;
-- → all rows relrowsecurity = true
```

### Troubleshoot

- **"extension postgis does not exist"** — PostGIS isn't enabled. In the Supabase dashboard → **Database → Extensions** → search `postgis` → enable.
- **"permission denied for schema public"** — Use the SQL editor in the dashboard (runs as `postgres`), not the CLI with a restricted user.
- **Duplicate type errors** — Safe to ignore; the `DO $$ ... EXCEPTION WHEN duplicate_object` guards catch them.

---

## Phase 2 — Express backend health *(optional)*

Only needed if you're exposing the REST API. The mobile app works without it.

### Action

```bash
cd D:\Projects\bloodlink-backend
npm install
npm run dev
```

Expected console:

```
🩸 BloodLink API listening on :3000 (development)
```

### Smoke test

```bash
curl http://localhost:3000/health
```

### Expected response

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "version": "1.0.0",
    "db": "connected",
    "env": "development"
  }
}
```

### Troubleshoot

- `db: "error"` → Check `.env` `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Port in use → change `PORT` in `.env`
- `Environment validation failed` → a required env var is missing

---

## Phase 3 — Auth — register + login

### Action (Device A — recipient)

```bash
cd D:\Projects\bloodlink
npm install
npx expo start
```

Scan QR with Expo Go. In the app:
1. Tap **Register**
2. Enter name, email (`alice@test.com`), phone (optional)
3. Pick a blood type (e.g. `O+`)
4. Allow location permission → should auto-fill your city
5. Complete → app navigates to `/(tabs)/home`

### Expected SQL

```sql
SELECT id, email, name, blood_type, active_role, availability,
       location IS NOT NULL AS has_location,
       country_code, city, referral_code
FROM public.users WHERE email='alice@test.com';
```

Expect: 1 row, `active_role='donor'`, `availability='available'`, `has_location=true`, `referral_code` is a random 8-char hex.

```sql
SELECT id, email FROM auth.users WHERE email='alice@test.com';
```

Expect: matching `auth_id` in `public.users.auth_id`.

### Expected UI

- Home screen shows "Welcome back, alice"
- Role toggle visible (Donor / Recipient)
- Stats strip shows 0 donations, 0 points
- Bell icon in header (no badge yet)
- Country banner at top (e.g. "Showing results in Pakistan")

### Troubleshoot

- **"Registration failed"** → check Supabase → **Authentication → Providers → Email** → disable "Confirm email" for dev
- **`users` row missing** → RLS blocked the insert. Verify `users_insert_self` policy exists in `002_rls_policies.sql`
- **Location banner missing** → `country_code` didn't save — check the register form captured location before submit

### Sign out and log back in

1. Profile → Sign Out
2. Login with same email — should succeed without re-entering profile data

---

## Phase 4 — Profile — update location, role, availability, fcm token

### Action

On Device A:
1. Profile tab → **Edit** → change blood type → **Save**
2. Toggle **Donor Mode** off then on
3. Open Map tab (triggers location update + FCM token registration)

### Expected SQL

```sql
SELECT blood_type, active_role, location IS NOT NULL AS has_loc,
       fcm_token IS NOT NULL AS has_token, updated_at
FROM users WHERE email='alice@test.com';
```

Expect: `active_role='donor'`, `has_loc=true`, `updated_at` recently bumped. `has_token=true` if on a real device with FCM project set up.

### Expected UI

- Profile → Edit rows reflect new blood type after reload
- Push Notifications row shows "Enabled"

### Troubleshoot

- **`fcm_token` stays null** — Expo Go doesn't have Firebase by default. You need a dev build OR real device with `expo-device` + EAS build
- **Toggling role saves but UI reverts** — `updated_at` trigger may not have installed. Check `SELECT * FROM pg_trigger WHERE tgname='users_updated_at';`

---

## Phase 5 — Blood request lifecycle

### Action (Device A — recipient)

1. Home → switch to **Recipient** role
2. Tap **Post Request**
3. Step 1: blood type `A+`
4. Step 2: Whole blood, 2 units
5. Step 3: Search for a hospital from seed (e.g. "Aga Khan") — pick one → location captured
6. Step 4: Urgency **Urgent**
7. Step 5: Expiry **12 hours**
8. Step 6: Confirm

### Expected SQL

```sql
SELECT id, blood_type, component, units_needed, hospital_name,
       urgency, status, expires_at > NOW() AS not_expired,
       hospital_location IS NOT NULL AS has_loc
FROM blood_requests
WHERE recipient_id=(SELECT id FROM users WHERE email='alice@test.com')
ORDER BY created_at DESC LIMIT 1;
```

Expect: `status='open'`, `component='whole'`, `urgency='urgent'`, `not_expired=true`, `has_loc=true`.

### Expected UI

- Alert: "Your donation request has been posted!"
- Back on Home (still in recipient mode) — request visible in "My Active Requests"
- History tab → Requests → the row appears

### Action (Device B — donor, different account)

Register a donor `bob@test.com`, blood type `O-` (universal donor).

On Device B Home (donor mode):
- The request Alice just posted should appear in **Nearby Requests** if within radius

### Expected SQL

```sql
-- Bob should match the request via blood type compatibility (O- can give to any)
SELECT r.id, r.blood_type AS requested, u.blood_type AS donor_bt
FROM blood_requests r, users u
WHERE u.email='bob@test.com'
  AND r.recipient_id=(SELECT id FROM users WHERE email='alice@test.com')
  AND r.status='open';
```

### Donor accepts

1. Device B → tap the request → confirm accept

### Expected SQL

```sql
SELECT status, accepted_by IS NOT NULL AS accepted, accepted_at IS NOT NULL AS has_ts
FROM blood_requests
WHERE recipient_id=(SELECT id FROM users WHERE email='alice@test.com');
```

Expect: `status='accepted'`, `accepted=true`, `has_ts=true`.

### Fulfill

1. Device A (recipient) → open request → tap "Mark Fulfilled" (or use the Express endpoint)

### Expected SQL

```sql
SELECT status, fulfilled_at IS NOT NULL AS has_ts FROM blood_requests
WHERE recipient_id=(SELECT id FROM users WHERE email='alice@test.com');
-- → status='fulfilled'

-- Bob's donor record should reflect donation + points
SELECT total_donations, points, last_donation_at, availability, next_eligible_at
FROM users WHERE email='bob@test.com';
```

Expect: `total_donations=1`, `points=100`, `availability='cooldown'`, `next_eligible_at` ≈ 56 days out.

### Troubleshoot

- **Request doesn't appear on Device B** — blood-type compatibility: Bob needs a compatible blood type OR the PostGIS `find_nearby_requests` rejected his distance. Log Bob's distance: `SELECT ST_Distance(u.location, r.hospital_location)/1000 AS km FROM users u, blood_requests r WHERE u.email='bob@test.com' AND r.blood_type='A+';`
- **Accept returns 409** — someone else already accepted, or request expired
- **Points not awarded on fulfill** — the `award-points` Edge Function isn't wired. Check Database Webhooks (see Phase 10)

---

## Phase 6 — Chat + realtime

### Action

After Bob accepted:
1. Device B → tap the chat icon on the accepted request
2. Send "On my way" via quick reply
3. Device A → chat thread should show the message arriving in < 2 seconds

### Expected SQL

```sql
SELECT sender_id, msg_type, content, created_at
FROM messages
WHERE request_id=(SELECT id FROM blood_requests
  WHERE recipient_id=(SELECT id FROM users WHERE email='alice@test.com'))
ORDER BY created_at;
```

Expect: rows with `msg_type='text'`, content matching sends.

### Location share

1. Device B → tap **Share location** → allow permissions
2. Device A → should see a map card with coords

### Expected SQL

```sql
SELECT msg_type, content, ST_AsText(location::geometry) AS point
FROM messages WHERE msg_type='location' ORDER BY created_at DESC LIMIT 1;
-- → point like "POINT(67.0626 24.8946)"
```

### Troubleshoot

- **Message doesn't appear on other device** — Realtime subscription filter wrong. In browser devtools (or via `console.log`) verify channel is `chat:<requestId>` and event `INSERT` on table `messages`
- **"Not a participant"** — RLS `messages_insert_participant` rejected. Verify request_id + sender_id match

---

## Phase 7 — Map + PostGIS RPC functions

### Action

1. Device B (donor, O-) → Map tab → allow location
2. Toggle layers: Donors / Requests / Blood Banks

### Expected SQL (test the RPCs directly)

```sql
-- Donors near Karachi center, 100km, any blood type
SELECT id, name, blood_type, distance_km
FROM find_nearby_donors(67.0011, 24.8607, 100000,
  ARRAY['A+','A-','B+','B-','AB+','AB-','O+','O-']);
-- → Alice & Bob show up (if in that radius)

-- Open requests
SELECT id, blood_type, urgency, distance_km
FROM find_nearby_requests(67.0011, 24.8607, 100000,
  ARRAY['A+','A-','B+','B-','AB+','AB-','O+','O-']);
-- → returns open/accepted requests (status='open' only)

-- Hospitals
SELECT id, name, distance_km
FROM find_nearby_hospitals(67.0011, 24.8607, 50000);
-- → 5 hospitals if seed ran
```

### Expected UI

- Map pins appear at correct coordinates
- Critical requests **pulse** (red rings animating)
- Bottom sheet opens on tap with donor info

### Troubleshoot

- **No donors returned** — Alice/Bob's `location` is null. Run: `SELECT email, location IS NOT NULL FROM users;`
- **`availability` ≠ 'available'** — Bob is in cooldown after fulfill. Set `UPDATE users SET availability='available' WHERE email='bob@test.com';`

---

## Phase 8 — Notifications (in-app + push)

### Action

1. Re-post a request from Device A (or manually insert via SQL)
2. Device B should receive a push notification (only if FCM configured)
3. Regardless of push, a row lands in `notifications` table

### Expected SQL

```sql
SELECT title, body, read_at IS NULL AS unread, created_at
FROM notifications
WHERE user_id=(SELECT id FROM users WHERE email='bob@test.com')
ORDER BY created_at DESC LIMIT 5;
```

Expect: rows created by the `notify-donors` Edge Function (only if wired — see Phase 10). If not wired, only manual records from app actions.

### UI — in-app

1. Device B → bell icon → should show unread count badge
2. Open Notifications screen → tabs Urgent / Matched / System
3. Tap a notification → navigates to request or chat

### Troubleshoot

- **Bell badge stays at 0** — Realtime not subscribed. Check: `supabase.channel('notifications:<userId>')` in home.tsx
- **Push never arrives** — Edge Function not deployed OR Firebase creds missing OR device isn't registered for push. Log: `supabase functions logs notify-donors`

---

## Phase 9 — Leaderboard

### Action

1. On any device → Profile → Leaderboard
2. Try tabs: City / Country / Global

### Expected SQL

```sql
SELECT name, blood_type, total_donations, points, city, country_code
FROM users
WHERE active_role='donor'
ORDER BY total_donations DESC, points DESC
LIMIT 10;
```

Bob should be rank #1 (1 donation, 100 points).

### Expected UI

- Top-3 podium visible if ≥ 1 donor
- "Your rank: #N" strip above the list
- Trophy icons gold/silver/bronze for top 3

---

## Phase 10 — Edge Functions — cron + triggered

### Deploy

```bash
cd D:\Projects\bloodlink-backend
supabase login
supabase link --project-ref <your-ref>
supabase functions deploy notify-donors
supabase functions deploy expire-requests
supabase functions deploy award-points
supabase secrets set FIREBASE_PROJECT_ID=<proj>
supabase secrets set FIREBASE_CLIENT_EMAIL=<email>
supabase secrets set FIREBASE_PRIVATE_KEY="-----BEGIN ...-----"
```

### Wire DB webhooks

Supabase dashboard → **Database → Webhooks → Create**

1. **notify-donors-on-insert**: table `blood_requests`, event `INSERT`, type "Supabase Edge Function", function `notify-donors`
2. **award-points-on-fulfilled**: table `blood_requests`, event `UPDATE`, function `award-points`

### Test notify-donors manually

```sql
-- Trigger a webhook by posting a request; check logs
INSERT INTO blood_requests (
  recipient_id, blood_type, units_needed, hospital_name, hospital_location,
  urgency, expires_at
) VALUES (
  (SELECT id FROM users WHERE email='alice@test.com'),
  'B+', 1, 'Test Hospital',
  ST_MakePoint(67.0011, 24.8607)::geography,
  'critical', NOW() + INTERVAL '6 hours'
);
```

### Expected Supabase logs

Dashboard → **Edge Functions → notify-donors → Logs**:

```
matched: 2, sent: 2, failed: 0
```

(Exact numbers depend on who's within range + compatible blood type.)

### Test expire-requests (cron)

Runs every 30 minutes via `supabase/config.toml` schedule. Force-run:

```bash
supabase functions invoke expire-requests
```

### Expected SQL

```sql
-- Any requests whose expires_at < now should now be 'expired'
SELECT COUNT(*) FROM blood_requests WHERE status='expired';
```

### Troubleshoot

- **Webhook never fires** — it's disabled in the UI, or the function URL is wrong
- **`award-points` runs on every UPDATE** — normal; the function short-circuits if `status != 'fulfilled'`

---

## Phase 11 — Passport PDF + Badges

### Passport

1. Device B (Bob, 1 donation) → History tab → tap **Passport** pill
2. A PDF should render, then a share sheet opens

### Expected

- PDF header: "♥ BloodLink Health Passport"
- Bob's name, blood type, "Total Donations: 1", "Lives Saved: 3"
- Donation history table with the fulfilled donation row

### Badges

On History screen, under the header, the BadgeWall should show:
- **First Drop** — earned (bronze)
- **Regular (5)** — 1/5 progress
- **Universal Donor** — earned if Bob is O-
- **Verified** — locked

### Troubleshoot

- **PDF doesn't open** — `expo-sharing.isAvailableAsync()` false on simulator. Use a real device
- **Badges all locked** — `total_donations` is 0. Ensure Phase 5 fulfill actually bumped it

---

## Phase 12 — Verified donor application

### Action

1. Profile → **Verified Donor** row
2. Fill out the form (full name, phone, city, country `PK`)
3. Submit

### Expected SQL

```sql
SELECT status, full_name, city, country_code, created_at
FROM verification_requests
WHERE user_id=(SELECT id FROM users WHERE email='bob@test.com')
ORDER BY created_at DESC LIMIT 1;
```

Expect: `status='pending'`.

### Approve (as admin)

```sql
UPDATE verification_requests
SET status='approved', reviewed_at=NOW()
WHERE id=(SELECT id FROM verification_requests
  WHERE user_id=(SELECT id FROM users WHERE email='bob@test.com')
  ORDER BY created_at DESC LIMIT 1);

-- Trigger should flip users.is_verified
SELECT is_verified FROM users WHERE email='bob@test.com';
-- → true
```

### Expected UI

- Reopen the Verify screen → banner changes to "You're verified!"
- Profile avatar now shows the verified ribbon (when Avatar atom is wired in profile)

### Troubleshoot

- **`is_verified` doesn't flip** — trigger didn't install. `SELECT * FROM pg_trigger WHERE tgname='apply_verification_decision_trg';`
- **Can't re-apply after rejection** — RLS allows INSERT only; re-submit creates a new row

---

## Phase 13 — Account — data export + delete

### Export

1. Profile → **Account & Data** → **Download my data**
2. Share sheet opens with JSON content
3. Save to Notes / email to self

### Expected content

```json
{
  "exported_at": "2026-04-24T...",
  "app": "BloodLink",
  "version": "1.0",
  "profile": { "id": "...", "email": "alice@test.com", ... },
  "donations": [],
  "blood_requests": [ {...} ],
  "notifications": [ {...} ]
}
```

### Delete

1. Profile → **Account & Data** → **Delete account**
2. Double-confirm through two alerts

### Expected SQL

```sql
-- public.users row gone (cascades to blood_requests, donations, messages)
SELECT COUNT(*) FROM users WHERE email='alice@test.com';
-- → 0

-- auth.users row still present — needs server-side admin deletion
SELECT COUNT(*) FROM auth.users WHERE email='alice@test.com';
-- → 1 (this is a known limitation)
```

### Troubleshoot

- **auth row persists** — expected; Supabase Auth row requires `service_role` / admin API. Add an Edge Function or backend endpoint `/v1/users/me/delete` that calls `supabase.auth.admin.deleteUser()` for full cleanup. Not shipped in v1.

---

## Final checklist

Tick every box before calling it production-ready:

- [ ] Phase 1 — `verify.sql` all sections pass
- [ ] Phase 3 — Register creates rows in `auth.users` AND `public.users`
- [ ] Phase 4 — Location updates as PostGIS point; fcm_token saves
- [ ] Phase 5 — Blood request flow: open → accepted → fulfilled (status & points OK)
- [ ] Phase 6 — Chat messages appear in real time on second device
- [ ] Phase 7 — Map renders at least one donor, one request, one hospital pin
- [ ] Phase 8 — Notifications row created + push received (if FCM set up)
- [ ] Phase 9 — Leaderboard ranks Bob #1 after fulfill
- [ ] Phase 10 — Edge Functions deployed + webhooks wired
- [ ] Phase 11 — Passport PDF opens; badges show correct earned state
- [ ] Phase 12 — Verification form submits; admin approval flips `is_verified`
- [ ] Phase 13 — Data export produces valid JSON; delete removes public row

Once all boxes are checked, you have a **working end-to-end system**.

---

## Quick-reference SQL snippets

```sql
-- Reset Bob's cooldown for another round of testing
UPDATE users SET availability='available', last_donation_at=NULL
WHERE email='bob@test.com';

-- Force-expire a request
UPDATE blood_requests SET expires_at=NOW() - INTERVAL '1 minute' WHERE id='<id>';

-- Nuclear: wipe all app data, keep auth.users
TRUNCATE TABLE
  notifications, messages, donations, event_rsvps, verification_requests,
  blood_requests, notification_prefs, users
CASCADE;

-- Delete an auth user fully (requires service_role via SQL editor)
-- DELETE FROM auth.users WHERE email='alice@test.com';
```

# BloodLink Backend

Express + TypeScript + Supabase (PostgreSQL + PostGIS) backend for the BloodLink blood-donation app.
Built to the **Backend & Database Blueprint v1.0**.

## Stack

| Layer           | Tech                             |
| --------------- | -------------------------------- |
| Runtime         | Node.js 20 + TypeScript          |
| Framework       | Express.js                       |
| Database        | Supabase (PostgreSQL 15)         |
| Geo             | PostGIS 3.x                      |
| Auth            | Supabase Auth (JWT + OTP)        |
| Realtime        | Supabase Realtime (client-side)  |
| Edge Functions  | Supabase Edge (Deno)             |
| Push            | Firebase Admin SDK (FCM)         |
| AI              | Anthropic Claude                 |
| Deployment      | Railway                          |

## Folder structure

```
bloodlink-backend/
├── src/
│   ├── index.ts               # Express entry
│   ├── config/                # env, supabase, firebase, sentry
│   ├── middleware/            # auth, validate, errorHandler
│   ├── routes/                # one file per route group
│   ├── controllers/           # request handlers
│   ├── services/              # geo, matching, points, notification, ai, passport
│   ├── utils/                 # response, bloodCompat, asyncHandler
│   └── types/
├── supabase/
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_rls_policies.sql
│   │   └── 003_indexes.sql
│   └── functions/
│       ├── _shared/           # shared bloodCompat + FCM helper
│       ├── notify-donors/
│       ├── expire-requests/
│       └── award-points/
├── Dockerfile
├── railway.toml
├── tsconfig.json
└── package.json
```

## Setup

```bash
# 1. Install
npm install

# 2. Env
cp .env.example .env
# Fill in SUPABASE_*, FIREBASE_*, ANTHROPIC_API_KEY, etc.

# 3. Start local Supabase (Docker required)
npm install -g supabase
supabase start

# 4. Run migrations
supabase db push
# or manually paste 001 → 002 → 003 in the SQL editor

# 5. Dev server
npm run dev
```

## Deploy Edge Functions

```bash
supabase functions deploy notify-donors
supabase functions deploy expire-requests
supabase functions deploy award-points

supabase secrets set FIREBASE_PROJECT_ID=...
supabase secrets set FIREBASE_CLIENT_EMAIL=...
supabase secrets set FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

### Wiring the Edge Functions

- **`notify-donors`** — create a [Database Webhook](https://supabase.com/docs/guides/database/webhooks)
  on `blood_requests` `INSERT` → HTTP POST to this function.
- **`expire-requests`** — cron `*/30 * * * *` (configured in `supabase/config.toml`).
- **`award-points`** — Database Webhook on `blood_requests` `UPDATE` where
  `status = 'fulfilled'` → HTTP POST to this function.

## Railway deploy

```bash
npm install -g @railway/cli
railway login && railway link
railway up
# Set env vars via `railway variables set ...` or the dashboard.
```

Health check: `GET /health` → `{ status: "ok", db: "connected" }`.

## API

Base path `/v1`. All routes require `Authorization: Bearer <access_token>` except `/v1/auth/*`.

| Group         | Routes |
| ------------- | ------ |
| Auth          | `POST /auth/register`, `/login`, `/refresh`, `/otp/send`, `/otp/verify`, `/logout` |
| Users         | `GET/PUT /users/me`, `/me/location`, `/me/availability`, `/me/fcm-token`, `/me/eligibility`, `/me/passport`, `GET /users/:id` |
| Requests      | `POST /requests`, `GET /requests/nearby`, `/mine`, `/:id`, `PUT /:id`, `DELETE /:id`, `POST /:id/accept`, `/:id/fulfill` |
| Donors        | `GET /donors/nearby`, `/leaderboard`, `/:id` |
| Donations     | `POST /donations`, `GET /donations/mine`, `/stats`, `DELETE /:id` |
| Chat          | `GET /chats`, `/:requestId`, `/:requestId/messages`, `POST /:requestId/messages`, `PUT /:requestId/read` |
| Hospitals     | `GET /hospitals`, `/:id`, `PUT /:id/stock` |
| Notifications | `GET /notifications`, `PUT /read-all`, `GET/PUT /prefs` |
| Events        | `GET /events`, `/:id`, `POST/DELETE /:id/rsvp` |

### Response shape

```json
{ "success": true, "data": { ... }, "meta": { ... } }
{ "success": false, "error": { "message": "...", "code": 400 } }
```

## Blood-type compatibility

Matrix lives in `src/utils/bloodCompat.ts` and is mirrored in
`supabase/functions/_shared/bloodCompat.ts` for Edge Functions.

- `COMPATIBLE_DONORS[recipient]` → donors that recipient can receive from.
- `CAN_DONATE_TO[donor]` → recipients that donor can give to.

## Realtime

Clients subscribe via the Supabase client SDK directly — no WebSocket server here.

```ts
supabase
  .channel(`chat:${requestId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `request_id=eq.${requestId}`,
  }, onMessage)
  .subscribe();
```

## Notes

- `next_eligible_at` is a PostgreSQL generated column (`last_donation_at + 56 days`).
- AI eligibility check **fails open** — if Claude is unreachable, returns
  `eligible: true` with advice to consult staff.
- All geo queries use `GEOGRAPHY(POINT, 4326)` (`lng, lat`).
- Atomic point increments go through `increment_points(user_id, points, inc_donations)`.

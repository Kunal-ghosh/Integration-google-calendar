# M32 Google Calendar Integration Service

Backend microservice that connects to Google Calendar via OAuth2, syncs events into a local SQLite database, exposes REST endpoints for querying/creating events, and handles webhook notifications for near-real-time updates.

## Highlights

- OAuth2 authorization code flow with offline refresh tokens stored in SQLite via Prisma.
- Idempotent `/sync/events` endpoint pulls paginated Google Calendar events, retries on 429/5xx with exponential backoff, and upserts them locally.
- Webhook receiver (`/webhook/google`) validates Google channel tokens, logs payloads, and triggers background syncs.
- REST API for listing and creating events from the local cache (`/events`), including optional filters and Google Meet link creation.
- Modular TypeScript structure (Express + Prisma) with structured logging (Pino) and strict Zod validation on all inputs.

## Architecture

```
┌────────────┐     OAuth2      ┌────────────────┐
│   Client   │ <──────────────>│ Google OAuth   │
└────┬───────┘                 └────────────────┘
     │ auth + API calls
     ▼
┌────────────────────────────┐     REST / Webhooks     ┌────────────────┐
│ Express / TypeScript app   │<────────────────────────│ Google Calendar│
│  - Auth routes             │────────────────────────>│  Events API    │
│  - Sync + Events endpoints │                         │                │
│  - Webhook receiver        │                         └────────────────┘
│  - Services (retry, etc.)  │
└────────────┬───────────────┘
             │ Prisma ORM
             ▼
        SQLite database
```

### Data Model

- `IntegrationAccount` – stores Google tokens, email, scopes, and metadata for a connected account.
- `CalendarEvent` – cached copy of Google events (idempotent upserts by `providerEventId + calendarId`).
- `CalendarWatch` – persisted webhook watches (channel id, expiry).
- `WebhookLog` – audit log of every webhook payload received.

## Prerequisites

- Node.js 18+
- npm 9+
- Google Cloud project with Calendar API enabled.

## Local Setup

1. Install dependencies
   ```bash
   npm install
   ```

2. Copy environment variables
   ```bash
   cp env.example .env
   ```

3. Configure OAuth credentials
   - Create an OAuth 2.0 Client ID in the Google Cloud Console.
   - Authorized redirect URI must match `GOOGLE_REDIRECT_URI` (default `http://localhost:4000/auth/google/callback`).
   - Enable the Google Calendar API.

4. Set environment variables in `.env`

| Variable | Description |
| --- | --- |
| `PORT` | HTTP port (default 4000) |
| `DATABASE_URL` | SQLite connection string. Use `file:./dev.db` to store `prisma/dev.db`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth credentials from Google Cloud |
| `GOOGLE_REDIRECT_URI` | Must match the authorized redirect |
| `DEFAULT_CALENDAR_ID` | Defaults to `primary` |
| `GOOGLE_WEBHOOK_CALLBACK_URL` | Public HTTPS URL for Google push notifications (ngrok, Render, etc.) |
| `GOOGLE_WEBHOOK_VERIFICATION_TOKEN` | Optional shared secret to validate webhook requests |

5. Create the SQLite database & Prisma client
   ```bash
   npm run prisma:migrate
   ```

6. Run the service
   ```bash
   npm run dev
   # or build + start
   npm run build && npm start
   ```

### Ngrok (or Tunnel) Setup for Webhook Testing

1. Install ngrok (or any HTTPS tunnel provider).
2. Start your local server first: `npm run dev`.
3. Expose port 4000:
   ```bash
   ngrok http 4000
   ```
4. Copy the HTTPS forwarding URL from ngrok output, e.g., `https://abcd1234.ngrok.app`.
5. Update `.env`:
   ```
   GOOGLE_WEBHOOK_CALLBACK_URL="https://abcd1234.ngrok.app/webhook/google"
   GOOGLE_WEBHOOK_VERIFICATION_TOKEN="optional-shared-secret"
   ```
6. Restart the dev server so env vars reload.
7. Register the watch using the ngrok domain:
   ```bash
   curl -X POST https://abcd1234.ngrok.app/webhook/google/watch \
     -H "Content-Type: application/json" \
     -d '{"calendarId":"primary","ttlSeconds":3600}'
   ```
8. Trigger a Google Calendar event (create/update/delete). You should see ngrok logging inbound POSTs and the service logging `google_webhook_received`.

## OAuth & Sync Flow

1. `GET /auth/google` – returns the Google consent URL including calendar scopes. Redirect the user here.
2. `GET /auth/google/callback` – Google calls this with `?code=...`. The service exchanges the code, stores tokens in `IntegrationAccount`, and returns the connected email.
3. `POST /sync/events` – Fetches events from Google (handles pagination + retries) and stores them locally without duplicates. Payload example:
   ```bash
   curl -X POST http://localhost:4000/sync/events \
     -H "Content-Type: application/json" \
     -d '{"calendarId":"primary","timeMin":"2025-01-01T00:00:00.000Z"}'
   ```

Tokens are refreshed automatically whenever they are near expiry using Google’s refresh token flow.

## Local REST API

| Method & Path | Description |
| --- | --- |
| `GET /health` | Basic health check |
| `GET /auth/google` | Retrieve OAuth consent URL |
| `GET /auth/google/callback` | Exchange Google code & store tokens |
| `POST /sync/events` | Pull remote events into SQLite |
| `GET /events` | Query cached events (`status`, `calendarId`, `from`, `to`, `limit`, `order`) |
| `POST /events` | Create a Google event (optionally generate Meet link) |
| `POST /webhook/google` | Receive Google push notifications |
| `POST /webhook/google/watch` | Register a webhook watch for a calendar (requires public HTTPS endpoint) |

### Simple Frontend Helper

Visit `http://localhost:4000/` to load a lightweight form bundled in `public/index.html`. It calls `POST /events` under the hood so you can create calendar events without crafting JSON manually.

### Example: List events

```bash
curl "http://localhost:4000/events?limit=20&order=asc&from=2025-01-01T00:00:00.000Z"
```

### Example: Create a calendar event

```bash
curl -X POST http://localhost:4000/events \
  -H "Content-Type: application/json" \
  -d '{
    "summary": "Technical screen",
    "description": "Interview for M32 role",
    "start": { "dateTime": "2025-01-10T17:00:00.000Z" },
    "end": { "dateTime": "2025-01-10T18:00:00.000Z" },
    "attendees": [{ "email": "candidate@example.com" }],
    "meetLink": true
  }'
```

### Example: Register a webhook watch

```bash
curl -X POST http://localhost:4000/webhook/google/watch \
  -H "Content-Type: application/json" \
  -d '{"calendarId":"primary","ttlSeconds":3600}'
```


## Reliability Notes

- Retries & rate limits: Calendar API calls are wrapped with `p-retry` (exponential backoff) for 429/5xx responses.
- Idempotent persistence: Events are upserted on `(providerEventId, calendarId)` ensuring repeated syncs/webhooks don't create duplicates.
- Structured logging: Pino logs (JSON in prod, pretty in dev) for easier observability.
- Webhook validation: Optional shared secret via `GOOGLE_WEBHOOK_VERIFICATION_TOKEN` plus persistent logs in `WebhookLog`.
- Graceful shutdown: Ensures HTTP server and Prisma disconnect cleanly on SIGINT/SIGTERM.

## Testing & Next Steps

- `npm run lint` – TypeScript type-checking.
- `npm run dev` – Nodemon-style reload via `ts-node-dev`.

Potential improvements if this were productionized:

- Background queue (BullMQ) for syncing large calendars asynchronously.
- Multi-tenant auth by associating IntegrationAccounts with your platform’s users/orgs.
- Automated re-registration of webhook channels before expiry.
- More granular filters (e.g., `status=confirmed`, `search=foo`) on `/events`.

## Deployment

Any Node-friendly platform works (Render, Railway, Fly.io). Ensure environment variables match your deployed URL (especially webhook callback). Run `npm run build` during deployment and start with `npm start`.

---

## Detailed Architecture

### Components & Responsibilities

| Module / Directory | Responsibilities | Key Files |
| --- | --- | --- |
| `src/app.ts`, `src/index.ts` | Express bootstrap, middleware wiring, graceful shutdown, health check | `src/app.ts`, `src/index.ts` |
| `src/config/env.ts` | Zod-backed environment validation and typed export | `src/config/env.ts` |
| `src/lib/*` | Cross-cutting helpers: Prisma client, Pino logger, Google OAuth helpers | `src/lib/prisma.ts`, `src/lib/logger.ts`, `src/lib/googleClient.ts` |
| `src/routes/*`, `src/controllers/*` | HTTP surface area (auth, sync, events, webhook) with Zod validation | `src/controllers/*.ts`, `src/routes/*.ts` |
| `src/services/googleCalendar.service.ts` | Core integration logic (OAuth completion, token refresh, retry logic, sync, create events, webhook registration) | `src/services/googleCalendar.service.ts` |
| Prisma schema | Data modeling for integration state, event cache, webhook logs | `prisma/schema.prisma` |

### Request Lifecycle

1. Express receives a request and parses JSON/body.
2. Route → controller pair validates inputs with Zod.
3. Controller delegates to the service layer which:
   - Pulls secrets/config from `env`.
   - Uses Prisma for persistence.
   - Calls Google APIs via official `googleapis` client.
   - Wraps outbound calls with `withRetry` for exponential backoff (500–4000 ms) on retryable status codes.
4. Controller serializes service results; errors bubble through the centralized `errorHandler`.

## OAuth2 Authorization Code Flow

1. Client requests `GET /auth/google`.
2. Controller returns `generateAuthUrl(...)` from `google.auth.OAuth2`, including scopes (`userinfo.email`, `calendar.events`, etc.), `access_type=offline`, and `prompt=consent`.
3. User approves in Google’s consent screen and Google redirects to `/auth/google/callback?code=...`.
4. `completeGoogleOAuth` exchanges the code for tokens, fetches profile info (`google.oauth2("v2").userinfo.get`), and upserts an `IntegrationAccount`.
5. Stored fields per integration:
   - `accessToken`, `refreshToken`, `scope`, `tokenExpiresAt`
   - `email`, `metadata` (full Google profile)
6. Before every Google API call, `ensureFreshAccessToken` checks token expiry and refreshes via OAuth2 `refreshAccessToken()` when within 60 seconds of expiration.

## Data Synchronization Pipeline

1. `POST /sync/events` accepts optional `calendarId`, `integrationId`, `timeMin`, `timeMax`.
2. Service chooses the integration (default: first/only account) and ensures fresh tokens.
3. Executes paginated `calendar.events.list`:
   - `maxResults=2500`, `singleEvents=true`, `orderBy=updated`.
   - Retries with exponential backoff on 408/425/429/5xx codes.
4. All events accumulate in-memory, then persist via `upsertEvents`, which:
   - Maps Google schema → local shape.
   - Uses Prisma `upsert` keyed on `(providerEventId, calendarId)` to ensure idempotency.
5. Response contains remote item count, inserted/updated rows, and the calendar ID used.

### Idempotency Guarantees

- Unique constraint `@@unique([providerEventId, calendarId])`.
- `upsert` avoids race duplicates.
- Webhook-triggered sync uses same pipeline, so multiple deliveries remain safe.

## Webhook Lifecycle

1. Registration (`POST /webhook/google/watch`):
   - Validates body (calendar + optional TTL).
   - Calls `calendar.events.watch` with a server-generated UUID channel id, target callback URL, verification token, and TTL.
   - Persists `CalendarWatch` row with expiry timestamp.
2. Delivery (`POST /webhook/google`):
   - Optionally checks `X-Goog-Channel-Token` against `GOOGLE_WEBHOOK_VERIFICATION_TOKEN`.
   - Logs headers + body to `WebhookLog`.
   - Kicks off a best-effort sync (past hour window) in the background.
3. Maintenance:
   - Monitor `expiry` column to renew channels proactively (not automated yet; recommended as future work).
   - If Google cancels a channel, webhook endpoint still logs the event and manual re-registration can be triggered.

## Database Schema Reference

### `IntegrationAccount`
| Field | Type | Notes |
| --- | --- | --- |
| `id` | `String @id @default(cuid())` | Primary key |
| `provider` | `String` | e.g., `google_calendar` |
| `email` | `String` | Uniquely identifies connected Google account |
| `accessToken` / `refreshToken` | `String` | Latest credentials |
| `tokenExpiresAt` | `DateTime?` | Used to refresh proactively |
| `metadata` | `Json?` | Stores Google profile payload |
| Relations | `events`, `watches`, `webhookLogs` | Cascade deletes for cleanliness |

### `CalendarEvent`
- Composite unique index `(providerEventId, calendarId)` ensures idempotency.
- Stores both human-facing fields (summary, description, etc.) and raw JSON.
- Linked to `IntegrationAccount` via `integrationId`.

### `CalendarWatch`
- Tracks Google channel id, resource id, expiry, and the integration.
- `googleChannelId` is marked `@unique` so duplicates can’t exist.

### `WebhookLog`
- Audits every webhook POST with minimal schema: headers, resource info, JSON payload, `receivedAt`.

## Operations Runbook

### Provisioning
1. `npm install`
2. Populate `.env` (see quick-start section).
3. `npm run prisma:migrate` (creates `dev.db` with schema).
4. `npm run dev`

### Common Tasks
| Task | Command |
| --- | --- |
| Type-check | `npm run lint` |
| Build for prod | `npm run build && npm start` |
| Inspect DB | `npx prisma studio` |
| Reset DB | `rm dev.db && npm run prisma:migrate` |

### Troubleshooting
- Missing `IntegrationAccount` → run OAuth flow again (`/auth/google`).
- Webhook 404 → likely no integration; see above.
- Google 401s → refresh token revoked; instruct user to remove the app from https://myaccount.google.com/permissions and reconnect.
- Prisma config env error → ensure `DATABASE_URL` is set before running Prisma commands (PowerShell: `$env:DATABASE_URL="file:./dev.db"`).

## Extensibility Notes

- Multi-account support: `integrationId` parameter already exists on sync endpoints; extend controllers/clients to surface multiple accounts.
- Additional providers: follow same IntegrationAccount model by differentiating `provider`. Service layer can be abstracted into per-provider directories.
- Background queues: substitute the inline `syncGoogleEvents` call inside webhook controller with a job enqueued to BullMQ/Cloud Tasks for better resilience.
- Event diffing: currently we overwrite entire events; add `updatedAtRemote` comparisons for incremental updates or soft-deletes.
- Security: plug in authentication/authorization middleware in front of the REST API once integrating with a larger platform.

## Complete cURL Reference

Set `BASE_URL=http://localhost:4000` for local testing or your HTTPS tunnel (ngrok) when exercising webhook endpoints.

1. **Health**
   ```bash
   curl BASE_URL/health
   ```

2. **OAuth flow**
   ```bash
   curl BASE_URL/auth/google
   curl "BASE_URL/auth/google/callback?code=GOOGLE_OAUTH_CODE"
   ```

3. **Sync events**
   ```bash
   curl -X POST BASE_URL/sync/events \
     -H "Content-Type: application/json" \
     -d '{
           "calendarId": "primary",
           "integrationId": "YOUR_INTEGRATION_ID",
           "timeMin": "2025-01-01T00:00:00.000Z",
           "timeMax": "2025-12-31T23:59:59.000Z"
         }'
   ```

4. **List cached events**
   ```bash
   curl "BASE_URL/events?calendarId=primary&status=confirmed&from=2025-01-01T00:00:00.000Z&limit=25&order=desc"
   ```

5. **Create event**
   ```bash
   curl -X POST BASE_URL/events \
     -H "Content-Type: application/json" \
     -d '{
           "calendarId": "primary",
           "summary": "M32 integration demo",
           "description": "Created via API",
           "start": { "dateTime": "2025-01-20T15:00:00.000Z" },
           "end":   { "dateTime": "2025-01-20T15:30:00.000Z" },
           "attendees": [{ "email": "person@example.com" }],
           "meetLink": true
         }'
   ```

6. **Register webhook watch**
   ```bash
   curl -X POST BASE_URL/webhook/google/watch \
     -H "Content-Type: application/json" \
     -d '{"calendarId":"primary","ttlSeconds":3600}'
   ```

7. **Simulate webhook delivery**
   ```bash
   curl -X POST BASE_URL/webhook/google \
     -H "Content-Type: application/json" \
     -H "X-Goog-Channel-Id: fake-channel-id" \
     -H "X-Goog-Channel-Token: YOUR_WEBHOOK_TOKEN_IF_SET" \
     -H "X-Goog-Resource-Id: fake-resource-id" \
     -H "X-Goog-Resource-State: exists" \
     -d '{"test":"payload"}'
   ```

This documentation, combined with the earlier quick-start instructions, should equip another engineer to onboard, operate, and extend the service without additional context.


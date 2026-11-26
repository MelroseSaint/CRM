# Anvil Ops integration API — v1

The platform exposes a versioned JSON API that lets each website you build identify itself,
synchronise metadata, and report deployment, health and error events. It is designed so a
website can never read or write another client's records.

- Base URL: `https://<your-platform-host>/api/v1`
- Content type: `application/json` (UTF-8)
- Auth: `Authorization: Bearer <credential>` or `X-API-Key: <credential>`
- Versioning: the path carries the version; responses include `api_version: "v1"`
- Every response includes `request_id` for correlation with the request log

## Authentication

Credentials are issued **per website**:

```
wxi_<keyId>.<secret>
```

The key ID identifies the credential; only a SHA-256 hash of the secret is stored. The full
token is displayed once, at issue or rotation time. Rotating revokes the previous key immediately.

### Registration flow

1. In the platform: client → website → **Integration** tab → *Issue registration token*.
2. Token format `wreg_…`, single use, valid for one hour, tied to one website.
3. The website exchanges it for its own credential:

```http
POST /api/v1/register
Authorization: Bearer wreg_...
Content-Type: application/json

{ "sdk_version": "1.0.0", "deployment_environment": "production" }
```

```json
201 Created
{
  "website": { "id": 12, "name": "Acme Studio", "integration_id": "wsi_..." },
  "credential": {
    "key_id": "wxi_ab12cd34",
    "secret": "…",
    "token": "wxi_ab12cd34.…",
    "scopes": ["website:read","website:sync","events:write","deployments:write","health:write"]
  },
  "note": "Store the secret in the website environment. It is shown once.",
  "request_id": "…",
  "api_version": "v1"
}
```

Reusing a token returns `409 token_already_used`; an expired token returns `410 token_expired`.

## Permissions (scopes)

| Scope | Allows |
| --- | --- |
| `website:read` | Read the calling website's own record, identity and maintenance requests |
| `website:sync` | Submit metadata, stack and build synchronisation |
| `events:write` | Report diagnostic events |
| `deployments:write` | Report deployment lifecycle |
| `health:write` | Report integration health and dependency checks |
| `maintenance:write` | Open maintenance requests for the website's own client |

A request lacking the required scope returns `403 insufficient_scope`. Credentials are created
with an explicit subset of scopes — a read-only status endpoint should get `website:read` only.

## Endpoints

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | none | Liveness. Returns `{ ok: true, service, api_version }`. |
| POST | `/register` | registration token | Exchange a one-time token for a website credential. |
| GET | `/me` | `website:read` | Website identity, owning client, granted scopes. |
| GET | `/website` | `website:read` | The calling website's record and latest reported health. |
| POST | `/sync` | `website:sync` | Idempotent metadata/stack/build synchronisation. |
| PATCH | `/website` | `website:sync` | Alias of `/sync` for partial updates. |
| POST | `/events` | `events:write` | Up to 50 events, idempotent by `id`. |
| POST | `/deployments` | `deployments:write` | Deployment lifecycle and history. |
| POST | `/health-report` | `health:write` | Self-reported health (`source = reported`). |
| POST | `/maintenance-requests` | `maintenance:write` | Open a request for the website's own client. |
| GET | `/maintenance-requests` | `website:read` | Recent requests for the calling website. |

### `POST /sync`

Only supplied fields change; omitted fields are untouched. The canonical payload is hashed and
compared with the last successful sync — a repeat returns `unchanged: true` without touching rows.

```json
{
  "metadata": {
    "name": "Acme Studio",
    "production_url": "https://acme.example.com",
    "staging_url": "https://staging.acme.example.com",
    "category": "Portfolio",
    "notes": "Managed by Anvil"
  },
  "technology": {
    "framework": "Next.js 15",
    "hosting": "Cloudflare",
    "deploy_platform": "Vercel",
    "repository_url": "https://github.com/acme/site",
    "backend": "Cloudflare Workers",
    "database": "D1",
    "media_storage": "R2"
  },
  "deployment": {
    "status": "succeeded",
    "environment": "production",
    "url": "https://acme.example.com",
    "version": "2.4.0",
    "build_id": "bld_8831",
    "commit": "9f2c1ab"
  }
}
```

```json
200 OK
{ "website_id": 12, "synced_at": "2026-11-25T10:22:31.004Z", "unchanged": false, "applied": { … } }
```

Values reported by the website are stored as reported data. They never overwrite results the
platform measured itself (for example an automated availability check).

### `POST /events`

```json
{
  "events": [
    {
      "id": "err_2026_11_25_0412",
      "type": "error",
      "message": "Checkout webhook returned 500",
      "severity": "error",
      "occurred_at": "2026-11-25T10:14:00Z",
      "detail": "Trace id 8f2…",
      "metadata": { "route": "/api/checkout" }
    },
    { "id": "dep_771", "type": "deployment", "message": "Deployed build bld_8831" }
  ]
}
```

```json
200 OK { "accepted": 2, "duplicates": 0, "rejected": [] }
```

`id` is the idempotency key: a unique index on `(website_id, event_key)` makes replays harmless.
A batch where every item is invalid returns `422` with per-item reasons.

### `POST /deployments`

```json
{
  "id": "dpl_8831",
  "status": "succeeded",
  "environment": "production",
  "url": "https://acme.example.com",
  "commit": "9f2c1ab",
  "build_id": "bld_8831",
  "version": "2.4.0",
  "error": null
}
```

`succeeded` updates the website's deployment date, production URL and version. Repeats with the
same `id` return `{ "duplicate": true, "recorded": false }` and emit no webhook.

### `POST /health-report`

```json
{
  "status": "degraded",
  "message": "Queue backlog",
  "checks": [
    { "name": "database", "status": "ok" },
    { "name": "queue", "status": "warn", "detail": "412 pending jobs" }
  ]
}
```

Stored with source `reported`. The platform's own availability checks are stored separately with
source `automated`, and the UI shows the two side by side.

## Webhooks (outbound)

The platform sends signed POSTs to endpoints registered per website.

| Header | Value |
| --- | --- |
| `X-Anvil-Event` | e.g. `deployment.succeeded` |
| `X-Anvil-Delivery` | delivery id |
| `X-Anvil-Timestamp` | unix seconds |
| `X-Anvil-Signature` | `t=<unix>,v1=<hex>` |

Signature = `HMAC_SHA256(secret, t + "." + raw_body)`.

Verification requirements:

1. Parse `t` and `v1`; reject if either is missing.
2. Reject timestamps outside a five-minute window (replay protection).
3. Recompute the HMAC over the **raw** request body and compare in constant time.
4. Only then parse and act on the JSON.

Events: `website.connected`, `website.updated`, `website.disconnected`, `deployment.started`,
`deployment.succeeded`, `deployment.failed`, `website.error`, `website.health_changed`,
`maintenance.requested`, `integration.sync_failed`.

Delivery: 8-second timeout, up to five attempts with exponential backoff (2, 4, 8, 16 minutes,
capped at 60), delivery history retained, manual replay available in the dashboard. A non-2xx
response or a network failure is recorded with the HTTP status and error text.

## Rate limiting

Per credential, fixed one-minute window. Default 120 requests/minute, configurable in Settings.

```
429 Too Many Requests
Retry-After: 23
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 23
```

## Errors

```json
{
  "error": { "code": "insufficient_scope", "message": "events:write is required." },
  "request_id": "…",
  "api_version": "v1"
}
```

| Status | Codes |
| --- | --- |
| 400 | `invalid_body`, `invalid_status`, `empty_events`, `invalid_health_status` |
| 401 | `missing_credentials`, `invalid_credentials`, `credential_revoked`, `registration_token_required`, `invalid_registration_token` |
| 403 | `insufficient_scope` |
| 404 | `not_found` |
| 409 | `token_already_used` |
| 410 | `token_expired` |
| 413 | `too_many_events` |
| 422 | `validation_failed` |
| 429 | `rate_limited` |
| 500 | `internal_error` |

## Versioning policy

`/api/v1` is frozen for breaking changes. Additive changes (new optional request fields, new
response fields, new event types) can appear within v1 and must be tolerated by clients. A
breaking change ships as `/api/v2` alongside v1, so existing website integrations keep working.

## SDK

`@anvil/integration` (see `sdk/`) wraps registration, authentication, sync, deployments, events,
health and webhook verification. It is fetch-based and framework-agnostic.

```ts
import { AnvilClient, verifyWebhook } from '@anvil/integration';

const anvil = new AnvilClient({ baseUrl: process.env.ANVIL_API_URL, token: process.env.ANVIL_TOKEN });

await anvil.syncMetadata({
  metadata: { productionUrl: 'https://acme.example.com' },
  technology: { framework: 'Next.js 15', hosting: 'Cloudflare' },
});

await anvil.reportDeployment({ status: 'succeeded', environment: 'production', version: '2.4.0' });
await anvil.reportError({ message: 'Checkout 500', detail: stack });

// inbound webhook
const payload = await verifyWebhook({
  rawBody,
  signatureHeader: req.headers.get('x-anvil-signature'),
  secret: process.env.ANVIL_WEBHOOK_SECRET,
});
```

## Testing an integration

1. `GET /me` returns the expected website and client.
2. `POST /sync` changes the website record; repeating it returns `unchanged: true`.
3. A duplicated event is reported as a duplicate rather than creating two entries.
4. A deployment appears in the website's history and arrives as a signed webhook.
5. Revoking the credential makes the next request `401` immediately.
6. `scripts/test-api.mts` exercises all of the above plus rate limiting, isolation and webhooks
   against a local deployment: `npm run test:api`.

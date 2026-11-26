// In-app API documentation. Rendered at /admin/api/docs.

import { API_SCOPES, SCOPE_LABELS } from '../lib/api-auth';
import { WEBHOOK_EVENTS } from '../lib/webhooks';
import { esc } from '../lib/util';

const ENDPOINTS: {
  method: string;
  path: string;
  auth: string;
  scope: string;
  description: string;
}[] = [
  { method: 'GET', path: '/api/v1/health', auth: 'None', scope: '—', description: 'Service health. No data returned.' },
  { method: 'POST', path: '/api/v1/register', auth: 'Registration token', scope: '—', description: 'Exchange a one-time registration token for a website credential.' },
  { method: 'GET', path: '/api/v1/me', auth: 'Website credential', scope: 'website:read', description: 'Identity of the calling website, its client and granted scopes.' },
  { method: 'GET', path: '/api/v1/website', auth: 'Website credential', scope: 'website:read', description: 'The calling website’s own record. No other website or client data.' },
  { method: 'POST', path: '/api/v1/sync', auth: 'Website credential', scope: 'website:sync', description: 'Idempotent metadata, stack and build synchronisation.' },
  { method: 'PATCH', path: '/api/v1/website', auth: 'Website credential', scope: 'website:sync', description: 'Alias of /sync for partial metadata updates.' },
  { method: 'POST', path: '/api/v1/events', auth: 'Website credential', scope: 'events:write', description: 'Report up to 50 diagnostic events with idempotency keys.' },
  { method: 'POST', path: '/api/v1/deployments', auth: 'Website credential', scope: 'deployments:write', description: 'Report deployment started / succeeded / failed / cancelled.' },
  { method: 'POST', path: '/api/v1/health-report', auth: 'Website credential', scope: 'health:write', description: 'Report integration health and dependency checks (stored as reported, not verified).' },
  { method: 'POST', path: '/api/v1/maintenance-requests', auth: 'Website credential', scope: 'maintenance:write', description: 'Open a support request for the calling website’s own client.' },
  { method: 'GET', path: '/api/v1/maintenance-requests', auth: 'Website credential', scope: 'website:read', description: 'List recent requests for the calling website.' },
];

export function apiReferenceBody(): string {
  const endpointRows = ENDPOINTS.map(
    (e) => `<tr>
      <td><span class="badge ${e.method === 'GET' ? 'info' : e.method === 'PATCH' ? 'warn' : 'ok'} mono">${e.method}</span></td>
      <td><span class="mono">${esc(e.path)}</span></td>
      <td class="tiny">${esc(e.auth)}</td>
      <td><span class="chip mono">${esc(e.scope)}</span></td>
      <td class="tiny">${esc(e.description)}</td>
    </tr>`,
  ).join('');

  const scopeRows = API_SCOPES.map(
    (s) => `<tr><td><span class="mono">${esc(s)}</span></td><td class="tiny">${esc(SCOPE_LABELS[s] ?? '')}</td></tr>`,
  ).join('');

  return `
  <div class="grid grid-detail">
    <div class="stack">
      ${section('Overview', `<p>Version 1 of the Anvil integration API lets every website you build authenticate itself, synchronise its metadata and report events back to this platform. It is a normal HTTP/JSON API with no SDK requirement — the bundled SDK is a convenience.</p>
        <p class="small muted">Base URL: <span class="mono">https://&lt;your-platform-host&gt;/api/v1</span>. All responses are JSON and include <span class="mono">request_id</span> and <span class="mono">api_version</span>.</p>
        <div class="callout info">The API is website-scoped by design. A credential can only read and write records belonging to its own website. There is no endpoint that returns another client's data, and no administrative capability is exposed here.</div>`)}

      ${section('Authentication', `<p>Every request (except <span class="mono">/health</span>) must present a credential as a bearer token:</p>
        ${codeBlock('bash', `curl https://<platform>/api/v1/me \\
  -H "Authorization: Bearer wxi_ab12cd34.<secret>"`)}
        <p class="small">Credentials are issued per website. The key ID identifies the credential; the secret is hashed (SHA-256) before storage and is only ever displayed once, at creation or rotation. An <span class="mono">X-API-Key</span> header with the same value is also accepted.</p>
        <p class="small">Registration uses a separate, single-use token prefixed <span class="mono">wreg_</span>, valid for one hour, issued from the website's integration settings.</p>`)}

      ${section('Registration flow', `<ol class="small" style="padding-left:18px;display:grid;gap:6px">
        <li>Create the client and website record in this platform.</li>
        <li>Open the website's <strong>Integration</strong> tab and issue a registration token.</li>
        <li>Start the website with <span class="mono">ANVIL_API_URL</span> and <span class="mono">ANVIL_REGISTRATION_TOKEN</span>.</li>
        <li>The SDK exchanges the token for a website credential and stores it in the website's secret store.</li>
        <li>Subsequent syncs use that credential. The token cannot be reused.</li>
      </ol>
      ${codeBlock('http', `POST /api/v1/register
Authorization: Bearer wreg_<token>
Content-Type: application/json

{ "sdk_version": "1.0.0", "deployment_environment": "production" }

201 Created
{
  "website": { "id": 12, "name": "Acme Studio", "integration_id": "wsi_..." },
  "credential": {
    "key_id": "wxi_ab12cd34",
    "secret": "<shown once>",
    "token": "wxi_ab12cd34.<secret>",
    "scopes": ["website:read","website:sync","events:write","deployments:write","health:write"]
  },
  "request_id": "...",
  "api_version": "v1"
}`)}`)}

      ${section('Endpoints', `<div class="table-wrap"><table class="data"><thead><tr><th>Method</th><th>Path</th><th>Auth</th><th>Permission</th><th>Purpose</th></tr></thead><tbody>${endpointRows}</tbody></table></div>`)}

      ${section('Synchronisation', `<p>Metadata sync is idempotent: the API hashes the canonical payload and returns <span class="mono">unchanged: true</span> when nothing differs from the previous synchronisation. Only fields present in the payload are updated; omitted fields are left alone.</p>
        ${codeBlock('http', `POST /api/v1/sync
Authorization: Bearer wxi_...
Content-Type: application/json

{
  "metadata": {
    "name": "Acme Studio",
    "production_url": "https://acme.example.com",
    "staging_url": "https://staging.acme.example.com",
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
      "environment": "production",
      "status": "succeeded",
      "url": "https://acme.example.com",
      "version": "2.4.0",
      "build_id": "bld_8831",
      "commit": "9f2c1ab"
    }
  }
}

200 OK
{
  "website_id": 12,
  "synced_at": "2026-11-25T10:22:31.004Z",
  "applied": { "name": "Acme Studio", "stack": "Next.js 15", "production_url": "https://acme.example.com", ... },
  "unchanged": false
}`)}`)}

      ${section('Events and idempotency', `<p>Every event may carry a stable <span class="mono">id</span>. Re-sending the same id is safe: the unique index on <span class="mono">(website_id, event_key)</span> rejects duplicates and the response reports them separately.</p>
        ${codeBlock('http', `POST /api/v1/events
Authorization: Bearer wxi_...
Content-Type: application/json

{
  "events": [
    { "id": "err_2026_11_25_0412", "type": "error", "message": "Checkout webhook 500", "severity": "error", "occurred_at": "2026-11-25T10:14:00Z", "metadata": { "route": "/api/checkout" } },
    { "id": "dep_771", "type": "deployment", "message": "Deployed build bld_8831" }
  ]
}

200 OK { "accepted": 2, "duplicates": 0, "rejected": [] }
// replay → { "accepted": 0, "duplicates": 2, "rejected": [] }`)}`)}

      ${section('Deployments', `<p>Deployment reports update the website record on success (deployment date, production URL, version), create a history entry, and emit a signed webhook. Repeats with the same deployment id are ignored.</p>
        ${codeBlock('http', `POST /api/v1/deployments
{ "id": "dpl_8831", "status": "succeeded", "environment": "production",
  "url": "https://acme.example.com", "commit": "9f2c1ab", "build_id": "bld_8831", "version": "2.4.0" }`)}`)}

      ${section('Reported vs verified health', `<p>A website's self-reported health is stored with source <span class="mono">reported</span> and never overwrites platform availability measurements. The platform independently performs real HTTP checks on its own schedule and records them with source <span class="mono">automated</span>. The website record surfaces both, separately.</p>
        ${codeBlock('http', `POST /api/v1/health-report
{ "status": "degraded", "message": "Queue backlog",
  "checks": [ { "name": "database", "status": "ok" }, { "name": "queue", "status": "warn", "detail": "412 pending jobs" } ] }`)}`)}

      ${section('Webhooks (outbound)', `<p>The platform signs every delivery with HMAC-SHA256. Receivers must verify the signature and reject stale timestamps (five-minute window) to prevent replay.</p>
        ${codeBlock('text', `X-Anvil-Event: deployment.succeeded
X-Anvil-Delivery: 1842
X-Anvil-Timestamp: 1795600000
X-Anvil-Signature: t=1795600000,v1=<hex hmac of "1795600000."+raw_body>`)}
        <p class="small">Events: ${WEBHOOK_EVENTS.map((e) => `<span class="chip mono">${esc(e)}</span>`).join(' ')}</p>
        <p class="small">Delivery is retried with exponential backoff up to five attempts. Delivery history and manual replay are available under API → Webhooks.</p>`)}

      ${section('Rate limiting', `<p>Limits are applied per credential in one-minute fixed windows. Defaults are 120 requests per minute and are configurable in Settings.</p>
        ${codeBlock('http', `HTTP/1.1 429 Too Many Requests
Retry-After: 23
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 23

{ "error": { "code": "rate_limited", "message": "Rate limit of 120 requests per minute exceeded." } }`)}`)}

      ${section('Errors', `<div class="table-wrap"><table class="data"><thead><tr><th>Status</th><th>Code</th><th>Meaning</th></tr></thead><tbody>
        <tr><td>400</td><td class="mono">invalid_body</td><td class="tiny">Body missing or not JSON.</td></tr>
        <tr><td>401</td><td class="mono">missing_credentials / invalid_credentials / credential_revoked</td><td class="tiny">No valid credential presented.</td></tr>
        <tr><td>403</td><td class="mono">insufficient_scope</td><td class="tiny">Credential lacks the required permission.</td></tr>
        <tr><td>404</td><td class="mono">not_found</td><td class="tiny">No endpoint matches the path.</td></tr>
        <tr><td>409</td><td class="mono">token_already_used</td><td class="tiny">Registration token consumed.</td></tr>
        <tr><td>410</td><td class="mono">token_expired</td><td class="tiny">Registration token older than one hour.</td></tr>
        <tr><td>422</td><td class="mono">validation_failed</td><td class="tiny">Events rejected; per-item reasons returned.</td></tr>
        <tr><td>429</td><td class="mono">rate_limited</td><td class="tiny">Slow down; see Retry-After.</td></tr>
        <tr><td>500</td><td class="mono">internal_error</td><td class="tiny">Unexpected failure; retry with the same idempotency key.</td></tr>
      </tbody></table></div>
      <p class="small muted">All error payloads follow <span class="mono">{ "error": { "code", "message" }, "request_id" }</span>.</p>`)}

      ${section('SDK', `<p>The reusable integration package lives in <span class="mono">sdk/</span> of this repository and is framework-agnostic (fetch-based). It handles registration, authentication, sync, deployment and error reporting, plus webhook signature verification.</p>
        ${codeBlock('ts', `import { AnvilClient } from '@anvil/integration';

const anvil = new AnvilClient({
  baseUrl: env.ANVIL_API_URL,
  token: env.ANVIL_TOKEN,          // wxi_... from registration
});

// on build/deploy
await anvil.syncMetadata({
  name: 'Acme Studio',
  productionUrl: 'https://acme.example.com',
  technology: { framework: 'Next.js 15', hosting: 'Cloudflare' },
});

await anvil.reportDeployment({ status: 'succeeded', environment: 'production', url: 'https://acme.example.com', version: '2.4.0' });

// error reporting
await anvil.reportError({ id: 'err_001', message: 'Checkout 500', detail: stack.slice(0, 2000) });`)}`)}

      ${section('Versioning', `<p>Endpoints are namespaced under <span class="mono">/api/v1</span>. Breaking changes ship under a new prefix; additive changes (new optional fields, new event types) may appear within v1 and must be tolerated by clients. Responses always include <span class="mono">api_version</span>.</p>`)}

      ${section('Testing the integration', `<ol class="small" style="padding-left:18px;display:grid;gap:6px">
        <li>Call <span class="mono">GET /api/v1/me</span> and confirm the website ID.</li>
        <li>POST a sync and confirm the website record updates under Integration.</li>
        <li>Repeat the same sync payload and confirm <span class="mono">unchanged: true</span>.</li>
        <li>Report an error event twice and confirm the second is a duplicate.</li>
        <li>Trigger a deployment and confirm the webhook arrives with a valid signature.</li>
        <li>Revoke the credential and confirm requests immediately return 401.</li>
      </ol>`)}
    </div>
    <div class="stack">
      ${section('Permissions', `<div class="table-wrap"><table class="data"><thead><tr><th>Scope</th><th>Allows</th></tr></thead><tbody>${scopeRows}</tbody></table></div>
        <p class="small muted mt-1">Least privilege: issue only the scopes a site needs. A read-only status page needs <span class="mono">website:read</span> and nothing else.</p>`)}

      ${section('Quick reference', `<dl class="kv">
        <dt>Version</dt><dd class="mono">v1</dd>
        <dt>Content type</dt><dd class="mono">application/json</dd>
        <dt>Auth header</dt><dd class="mono">Authorization: Bearer</dd>
        <dt>Max body</dt><dd class="mono">64 KB</dd>
        <dt>Events/request</dt><dd class="mono">50</dd>
        <dt>Rate limit</dt><dd class="mono">120/min (configurable)</dd>
        <dt>Webhook window</dt><dd class="mono">300 s</dd>
        <dt>Retries</dt><dd class="mono">5 with backoff</dd>
      </dl>`)}

      ${section('Security rules', `<ul class="small" style="padding-left:16px;display:grid;gap:7px">
        <li>Never embed a credential in client-side JavaScript or a public bundle.</li>
        <li>Store secrets in the website's server environment, not in this platform's notes.</li>
        <li>Rotate credentials after any staff change; rotation revokes the old key immediately.</li>
        <li>Verify webhook signatures before trusting a payload.</li>
        <li>Treat this API as one-way per site: it can never read another client's records.</li>
      </ul>`)}

      ${section('Related', `<div class="stack" style="gap:7px">
        <a class="btn ghost sm block" href="/admin/api/integrations">Integration management</a>
        <a class="btn ghost sm block" href="/admin/api/credentials">Credentials</a>
        <a class="btn ghost sm block" href="/admin/api/logs">Request log</a>
        <a class="btn ghost sm block" href="/admin/api/webhooks">Webhook deliveries</a>
      </div>`)}
    </div>
  </div>`;
}

function section(title: string, body: string): string {
  return `<section class="panel"><div class="panel-head"><h2>${esc(title)}</h2></div><div class="panel-body">${body}</div></section>`;
}

function codeBlock(lang: string, code: string): string {
  return `<div class="mono-block" style="margin:10px 0"><div class="tiny" style="color:#7d8b94;margin-bottom:6px;text-transform:uppercase;letter-spacing:.12em">${esc(lang)}</div>${esc(code)}</div>`;
}

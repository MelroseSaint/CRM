# @anvil/integration

Client for the Anvil Ops website integration API (v1). Use it in each website you build so the
site can identify itself, synchronise metadata, report deployments and errors, and verify inbound
webhooks — without rewriting the integration for every client.

- No runtime dependencies. Uses global `fetch` and WebCrypto.
- Runs in Cloudflare Workers, Node 18+, Deno, Bun and other edge runtimes.
- Scoped to a single website: the credential cannot read another client's data.

## Install

```bash
npm install @anvil/integration
```

From this repository (not published to a registry), build it locally and install by path:

```bash
cd sdk && npm install && npm run build
# in the website project
npm install /absolute/path/to/anvil-ops/sdk
```

## Register the website (once)

Create the client and website in the platform, open **Websites → Integration**, and issue a
registration token. Store it in the website's environment, not in the repository.

```ts
import { AnvilClient } from '@anvil/integration';

const result = await AnvilClient.register({
  baseUrl: process.env.ANVIL_API_URL!,
  registrationToken: process.env.ANVIL_REGISTRATION_TOKEN!,
  deploymentEnvironment: 'production',
});

// Persist `result.credential.token` in the platform's secret store, then remove the
// registration token: it is single-use and expires after one hour.
console.log(result.website.id, result.credential.scopes);
```

In a Cloudflare Worker or any platform with a writable secret store, store the token as a secret.
If you cannot store it, print it once during a deploy job and set it manually — never commit it.

## Use the credential

```ts
import { AnvilClient } from '@anvil/integration';

export const anvil = new AnvilClient({
  baseUrl: process.env.ANVIL_API_URL!,
  token: process.env.ANVIL_TOKEN!,     // wxi_<keyId>.<secret>
  timeoutMs: 10_000,
  retries: 2,
});

await anvil.me();                       // website + client identity, granted scopes
await anvil.getWebsite();               // own record, plus reported vs automated health
```

### Metadata synchronisation

Idempotent: repeating an identical payload returns `unchanged: true` and writes nothing.

```ts
await anvil.syncMetadata({
  metadata: {
    name: 'Acme Studio',
    production_url: 'https://acme.example.com',
    staging_url: 'https://staging.acme.example.com',
    category: 'Portfolio',
  },
  technology: {
    framework: 'Next.js 15',
    hosting: 'Cloudflare',
    deploy_platform: 'Vercel',
    repository_url: 'https://github.com/acme/site',
    backend: 'Workers',
    database: 'D1',
    media_storage: 'R2',
  },
  deployment: {
    status: 'succeeded',
    environment: 'production',
    version: '2.4.0',
    build_id: 'bld_8831',
    commit: '9f2c1ab',
  },
});
```

### Deployments

```ts
await anvil.reportDeployment({
  id: process.env.DEPLOYMENT_ID,            // stable id → safe to retry
  status: 'started',
  environment: 'production',
});

await anvil.reportDeployment({
  id: process.env.DEPLOYMENT_ID,
  status: 'succeeded',
  environment: 'production',
  url: 'https://acme.example.com',
  version: '2.4.0',
  build_id: 'bld_8831',
});
```

A succeeded production deployment updates the website's deployment date, URL and version in the
platform and emits a signed webhook.

### Errors and events

`reportEvent` derives a stable id from the event contents when you do not supply one, so a retried
call cannot create a duplicate record.

```ts
try {
  await handleCheckout(request);
} catch (error) {
  await anvil.reportError({
    message: 'Checkout failed',
    detail: error instanceof Error ? error.stack : String(error),
    metadata: { route: '/api/checkout' },
  });
}
```

Up to 50 events per request:

```ts
await anvil.reportEvents([
  { id: 'content_441', type: 'content', message: 'Published three case studies' },
  { id: 'perf_442', type: 'performance', message: 'LCP 1.4s', metadata: { lcp: 1400 } },
]);
```

### Health

```ts
await anvil.reportHealth({
  status: 'ok',
  checks: [
    { name: 'database', status: 'ok' },
    { name: 'queue', status: 'warn', detail: '412 pending jobs' },
  ],
});
```

Reported health is stored with source `reported` and is shown separately from the platform's own
measurements. It never replaces an automated availability result.

### Maintenance requests

```ts
await anvil.createMaintenanceRequest({
  title: 'Checkout error on iOS Safari',
  description: 'One customer reported a failed payment; provider logs attached.',
  priority: 'urgent',
});
```

The request lands in the platform's maintenance queue against the website's own client.

## Verify inbound webhooks

```ts
import { verifyWebhook, AnvilApiError } from '@anvil/integration';

export async function POST(request: Request) {
  const rawBody = await request.text();
  try {
    const payload = await verifyWebhook({
      rawBody,
      signatureHeader: request.headers.get('x-anvil-signature'),
      secret: process.env.ANVIL_WEBHOOK_SECRET!,
    });
    // only now trust `payload`
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AnvilApiError) return new Response(error.message, { status: error.status });
    throw error;
  }
}
```

`verifyWebhook` checks the `t=`/`v1=` header, rejects timestamps outside a five-minute window
(replay protection) and compares the HMAC in constant time. It always hashes the **raw** body, so
read the body as text before parsing it.

`signWebhook(secret, rawBody, timestamp?)` produces a header for tests.

## Error handling

Failed requests throw `AnvilApiError` with `status`, `code`, `requestId` and the parsed `body`.
The client retries `429`, `5xx` and network failures with backoff (honouring `Retry-After`) up to
`retries` times. Everything else — `401` invalid/revoked credential, `403` insufficient scope,
`422` validation — is thrown immediately.

```ts
import { AnvilApiError } from '@anvil/integration';

try {
  await anvil.reportEvents(events);
} catch (error) {
  if (error instanceof AnvilApiError && error.status === 429) {
    // already retried; queue and try later
  } else if (error instanceof AnvilApiError && error.status === 401) {
    // credential revoked or rotated — do not retry, alert and stop reporting
  } else {
    throw error;
  }
}
```

## Versioning

The SDK targets `/api/v1` and sends `anvil-integration/1.0.0` as its user agent. Additive API
changes are expected within v1; a breaking change would ship as `/api/v2`. Pin a minor version in
the website's lockfile and update deliberately.

## Security rules

- Never ship the credential to the browser, a public bundle or a client-side environment variable.
- Keep the registration token out of version control; it is single-use and expires.
- Rotate after staff changes. Rotation revokes the previous key immediately, so the site's next
  request fails until the new secret is deployed.
- Treat inbound webhook payloads as untrusted until `verifyWebhook` succeeds.
- The credential can only reach its own website's records. Do not build workarounds that share one
  credential between sites.

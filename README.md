# Anvil Ops

An operations platform for an independent web developer: clients, pipeline, projects, websites,
contracts, invoices, maintenance, tasks, calendar, documents, a client portal, and a versioned
integration API that lets each website you build report back to the platform.

The application is a React single-page app (Vite + TypeScript, React Router) served by a single
Cloudflare Worker that exposes a JSON API. Data lives in D1, files in R2. The Worker also serves the
versioned integration API that client websites call. The same API runs on Node/Vercel with a libSQL
database (see [Run it on Vercel](#run-it-on-vercel-node--libsql)). There is no mock data: every
figure on every screen comes from a record you created.

```
src/
  index.ts            Worker entry: session middleware, JSON API mount, SPA assets, cron jobs
  db/schema.sql       ~28 tables, indexes and default settings
  lib/                D1 helpers, auth/sessions/CSRF, monitoring, webhooks, API credentials
  api/app.ts          JSON API for the React app, mounted at /app/api
  api/app-*.ts        session/setup, clients & leads & tasks, projects & websites,
                      agreements & invoices, dashboard/reports/settings/API ops/portal
  api/v1.ts           integration API for client websites (registration, sync, events, health)
  docs/api-reference.ts  reference rendered into the in-app API docs screen
  ui/styles.ts        design-system stylesheet served at /assets/app.css
web/
  src/main.tsx        router and entry
  src/shell.tsx       staff workspace shell and client-portal shell
  src/pages/          dashboard, clients, pipeline, projects, websites, agreements, invoices,
                      maintenance, tasks, calendar, documents, reports, settings, API ops, portal
  src/api.ts          typed fetch client and formatters
  src/ui.tsx          shared components (panels, tables, badges, modals, toasts)
sdk/                  @anvil/integration — framework-agnostic client + webhook verification
docs/API.md           full API reference
scripts/demo.sql      optional sample dataset (local evaluation only)
scripts/test-api.mts  end-to-end integration suite
```

## Signing in

A fresh database starts on `/setup`, where you create the first administrator — that is the only
account a new workspace needs. The optional demo seed (`npm run db:demo`, local evaluation only)
also adds these two public accounts and turns on the demo banner on the sign-in screen:

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@anvil.test` | `AnvilOps-2026!` |
| Client (portal) | `portal@anvil.test` | `PortalPass-2026!` |

Change or delete these before using the workspace for real client data — they are public demo
credentials, not a secret. Password resets for staff accounts are under Settings → Users; a portal
account is created from the client record with an email and a password of at least 10 characters.

## Run it locally

Node 22.6 or newer is required: the test runner executes `scripts/test-api.mts` directly, which
relies on Node's built-in TypeScript support.

```bash
npm ci                   # installs from package-lock.json, nothing is upgraded
npm run web:install      # installs the React app's dependencies from its lockfile
npm run db:init          # create tables in the local D1 database
npm run build            # compiles the React app into web/dist
npm run dev              # wrangler dev on http://localhost:3000
```

Open the app and complete `/setup` — the first-run form creates the administrator account. No data
is seeded automatically.

For UI development with hot reload, run the Worker and Vite side by side:

```bash
npm run dev              # Worker on :3000
npm run dev:web          # Vite on :5173, proxying /app/api and /api to the Worker
```

`npm run build` is required for the Worker to serve the app; without a build it returns a short
page explaining how to compile it.

Optional: load the sample dataset to see the interface populated (clients, projects, invoices,
websites, maintenance, tasks):

```bash
npm run db:demo
```

The demo file is SQL you can read and delete; the application does not depend on it. Run it against a
freshly initialised database: its sample rows reference each other by id, so loading it twice
duplicates data and can trip foreign keys. Its two public accounts are inserted only when the
database still has no users, and the sign-in banner only appears when both exist, so loading it onto
a database that already has accounts never adds a known-password administrator.

## Run it on Vercel (Node + libSQL)

The API is not tied to Cloudflare. `src/vercel.ts` serves the same Hono application as a Vercel
function, and `src/node/` supplies the pieces Cloudflare used to provide: the database, document
storage and the scheduled jobs. `vercel.json` declares two Vercel Services — `app` (this repo,
framework `hono`, entrypoint `src/vercel.ts`) for `/app/api` and `/api`, and `web` (`web/`, Vite) for
the built SPA — and a cron job that calls `/api/cron` every 15 minutes.

Use a libSQL database (Turso) rather than Postgres: the schema and every query are SQLite, so the
SQL is unchanged. Set these environment variables in the Vercel project:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | `libsql://…` or `https://…` database URL |
| `DATABASE_AUTH_TOKEN` | database token for that URL |
| `CRON_SECRET` | shared secret; `/api/cron` rejects requests without `Authorization: Bearer <secret>` |

Apply the shared schema to the database once, then deploy:

```bash
DATABASE_URL=libsql://… DATABASE_AUTH_TOKEN=… npm run db:init:node
vercel deploy            # Services are in beta; inspect the build logs on the first deploy
```

On Vercel, uploaded documents are stored in the `file_blobs` table (same key/value contract as R2,
still capped at 20 MB per file), because a serverless function has no R2 binding. Local Node runs the
identical runtime:

```bash
DATABASE_URL=file:.data/anvil.db npm run db:init:node
DATABASE_URL=file:.data/anvil.db npm run dev:node   # http://localhost:3000
```

Without `CRON_SECRET` the cron route refuses to run when `VERCEL` is set, so a deployment never runs
scheduled work unauthenticated; local Node allows it for convenience. Vercel Hobby plans only allow
daily cron schedules — change `crons` in `vercel.json` if the project is on Hobby. The Cloudflare
Worker remains the default deployment: `wrangler.jsonc`, D1, R2 and the `scheduled` handler are
untouched.

## Test it

```bash
npm run test:api         # drives the running app over HTTP
```

The suite runs against `http://127.0.0.1:3000` (override with `TEST_BASE`, `TEST_EMAIL`,
`TEST_PASSWORD`). On a database with no accounts it performs first-run setup itself using
`TEST_EMAIL` and `TEST_PASSWORD` (defaults `admin@anvil.test` / `AnvilOps-2026!`), so
`npm run db:init` alone is enough before a test run. That setup only happens when `TEST_BASE` is a
loopback address, so a suite pointed at a deployed environment never creates an account there: it
stops and asks you to run `/setup` or supply credentials. `TEST_BOOTSTRAP=1` opts in explicitly for
a disposable remote database. It covers sign-in and CSRF rejection, client and project CRUD, milestone and
deliverable storage, a real availability check with its measured source, invoice totals, the rule
that a pending payment never settles an invoice, overpayment refusal, payment confirmation, portal
isolation (including another client's invoice and an internal document), portal payment claims,
typed-name agreement acceptance with name/IP/hash, API credential scope and immediate revocation on
revoke, the audit log, the SPA shell and security headers. It creates its own records with a unique
suffix and deletes them at the end, so it can be run repeatedly against the same database.

`npm test` runs both type checks followed by the suite. `npm run sdk:typecheck` compiles the SDK.

GitHub Actions repeats these steps on every push and pull request — checkout, `npm ci`, web install,
`db:init`, build, start the Worker and run the suite — in `.github/workflows/ci.yml`, so a clean
clone is verified continuously.

## How the pieces work

**Money** is stored in integer cents. `invoices.paid_cents` is derived from payments with
`status = 'confirmed'`. A client-reported payment is stored as `pending`: it appears on the invoice
as unverified, but it does not change the invoice status or the collected-revenue figures.
Overdue status is recomputed on read and by the scheduled job.

**Agreements** support a typed-name acceptance flow that records the signer, IP, timestamp and a
SHA-256 hash of the agreement text. It is explicitly labelled as a simple electronic acceptance,
not a qualified e-signature, and manually recorded acceptances are labelled as entered by staff.

**Website health** separates sources. The platform performs real HTTP checks on a schedule
(`automated`), staff can record inspections (`manual`), and a connected website can report its own
state (`reported`). Reported values never overwrite measured ones; both are shown side by side.

**Monitoring** runs from the Worker's cron trigger (`*/15 * * * *`): due website checks, webhook
retries and the overdue-invoice sweep. On Vercel the same jobs run from `/api/cron`, called by the
cron entry in `vercel.json` and guarded by `CRON_SECRET`. Manual checks are available from the
website screen.

**Security**: PBKDF2-SHA256 (150k iterations) password hashes, hashed session IDs in HttpOnly cookies
(`SameSite=None; Secure` over HTTPS so the app also works inside an embedded preview frame, `Lax`
over plain HTTP), a per-session CSRF token plus a `Sec-Fetch-Site`/Origin check on every mutating
request, login throttling after repeated failures, staff/client route guards, row-level portal
scoping, audit log, security headers and a strict CSP. Secrets belong in Worker secrets or
per-website environment variables — never in notes, the database, or client-side code.

**Client portal access** is enforced per row, not per route. D1 has no row-level security, so
`src/lib/portal-scope.ts` is the single door to client-owned tables: it always binds the signed-in
`client_id`, refuses any table outside a fixed allowlist, and loads project milestones,
deliverables, invoices and activity by joining the parent project. A portal request therefore cannot
read or write another client's record even if an endpoint forgets a predicate. Portal writes are
also budgeted at **30 changes per hour per client account** (`src/lib/ratelimit.ts`, counted in D1 so
the limit holds across isolates); reads are not limited, and the over-limit response includes
`Retry-After`.

## Integration API

- Base path `/api/v1`, per-website credentials `wxi_<keyId>.<secret>`, SHA-256-hashed secrets.
- One-time `wreg_` registration tokens let a website exchange for its own credential.
- Scopes: `website:read`, `website:sync`, `events:write`, `deployments:write`, `health:write`,
  `maintenance:write`. A credential is limited to its own website; no endpoint reaches another
  client's data.
- Idempotency: sync payloads are hashed, events and deployments carry keys with unique indexes.
- Webhooks: HMAC-SHA256 over `timestamp.rawBody`, five-minute replay window, five attempts with
  exponential backoff, delivery history and manual replay.
- Rate limits per credential (default 120/min, configurable in Settings), request logging and a
  usage dashboard at **API** in the sidebar.

Documentation lives in the app under **API & webhooks → API reference** and in [docs/API.md](docs/API.md).

### Connecting a website

1. Create the client, then the website record. Open **Websites → Integration**.
2. Issue a registration token (single use, one hour).
3. Set `ANVIL_API_URL` and `ANVIL_REGISTRATION_TOKEN` in the website's environment and call
   `AnvilClient.register(...)` from the SDK, or `POST /api/v1/register` directly.
4. Store the returned credential in the website's secret store. It is shown once.
5. From then on the site can sync metadata, report deployments and errors, and receive webhooks.

```ts
import { AnvilClient, verifyWebhook } from '@anvil/integration';

const anvil = new AnvilClient({
  baseUrl: process.env.ANVIL_API_URL!,
  token: process.env.ANVIL_TOKEN!,
});

await anvil.syncMetadata({
  metadata: { production_url: 'https://acme.example.com' },
  technology: { framework: 'Next.js 15', hosting: 'Cloudflare' },
});
await anvil.reportDeployment({ status: 'succeeded', environment: 'production', version: '2.4.0' });

const payload = await verifyWebhook({
  rawBody,
  signatureHeader: request.headers.get('x-anvil-signature'),
  secret: process.env.ANVIL_WEBHOOK_SECRET!,
});
```

The SDK has no runtime dependencies, uses only `fetch` and WebCrypto, and works in Workers, Node
18+, Deno and Bun. See `sdk/README.md`.

## Deploying

The Worker needs a D1 database bound as `DB`, an R2 bucket bound as `FILES`, the static assets
directory `web/dist` and the cron trigger.
`wrangler.jsonc` contains the local configuration; replace `database_id` with your D1 ID, then:

```bash
npm run db:init:remote
npm run build            # compiles the React app into web/dist (served as Worker assets)
npx wrangler deploy
```

Run `/setup` on the deployed origin to create the administrator account. Put any provider tokens
(email, deployment providers) in Worker secrets, not in `wrangler.jsonc` vars.

## Pushing to GitHub

The remote is `https://github.com/MelroseSaint/CRM.git`.

Pushes go through the GitHub account connected to this project. Ask the agent to push and it
publishes the branch over that connection, using a short-lived, repository-scoped deploy key that is
deleted as soon as the push completes. No personal access token, project secret or SSH key is
required, and no credential is stored in the workspace or in the repository.

The sandbox itself has no saved git credential, so a bare `git push` from a shell will ask for
authentication; use the chat instead.

## Scope and honest limits

Implemented and tested: the modules above, the API, the SDK, webhooks, monitoring and the
scheduled jobs. External integrations are deliberately not pretended:

- **E-signature**: typed acceptance with an audit trail, not a qualified signature. For legally
  binding signature workflows, integrate a dedicated e-signature provider.
- **Payments**: recorded manually or confirmed by staff. No payment provider is called, so no
  payment is marked received automatically; pending client claims stay pending until verified.
- **Email**: communication is logged, not sent. No email provider is configured.
- **Calendar**: internal calendar only; no external calendar sync.
- **Deployment providers** (Vercel, GitHub, registrars): the data model and API accept reported
  deployment and repository information, but no provider credentials are assumed or fabricated.
- **Availability checks** measure the URL the platform can reach; SSL and domain expiry are fields
  and manual checks unless you report them through the API.

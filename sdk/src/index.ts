/**
 * @anvil/integration — client for the Anvil Ops website integration API (v1).
 *
 * Framework-agnostic: uses the global `fetch`, WebCrypto and nothing else. It runs in
 * Cloudflare Workers, Node 18+, Deno, Bun and edge runtimes.
 *
 * Security notes:
 *  - The credential (token) is a server-side secret. Never expose it to browsers.
 *  - The credential is scoped to exactly one website. The API cannot read another client's data.
 *  - Webhook payloads must be verified with `verifyWebhook` before being trusted.
 */

export interface AnvilClientOptions {
  /** Platform origin or full API base, e.g. https://ops.example.com or https://ops.example.com/api/v1 */
  baseUrl: string;
  /** Website credential: `wxi_<keyId>.<secret>`. Omit only when calling `register`. */
  token?: string;
  /** Optional custom fetch (tests, proxies). Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Per-request timeout in ms. Default 15000. */
  timeoutMs?: number;
  /** Retries for 429/5xx/network failures. Default 2 (three attempts total). */
  retries?: number;
  /** Optional label included in the User-Agent. */
  sdkVersion?: string;
}

export interface AnvilApiErrorBody {
  error?: { code?: string; message?: string };
  request_id?: string;
  api_version?: string;
}

export class AnvilApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly body: unknown;

  constructor(status: number, code: string, message: string, requestId: string | null, body: unknown) {
    super(message);
    this.name = 'AnvilApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.body = body;
  }

  /** True when retrying later may succeed. */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500 || this.status === 0;
  }
}

export interface WebsiteIdentity {
  id: number;
  name: string;
  domain: string | null;
  integration_id: string;
  client: { id: number; name: string; company: string | null };
  scopes: string[];
  integration_status: string;
  last_sync_at: string | null;
}

export interface SyncInput {
  metadata?: {
    name?: string;
    production_url?: string | null;
    staging_url?: string | null;
    deployment_environment?: string | null;
    category?: string | null;
    notes?: string | null;
  };
  technology?: {
    framework?: string | null;
    hosting?: string | null;
    deploy_platform?: string | null;
    repository_url?: string | null;
    backend?: string | null;
    database?: string | null;
    media_storage?: string | null;
  };
  deployment?: {
    status?: 'queued' | 'started' | 'succeeded' | 'failed' | 'cancelled';
    environment?: string;
    url?: string | null;
    version?: string | null;
    build_id?: string | null;
    commit?: string | null;
    deployed_at?: string | null;
  };
}

export interface SyncResult {
  website_id: number;
  synced_at: string;
  unchanged: boolean;
  applied: Record<string, unknown>;
}

export interface DeploymentInput {
  id?: string;
  status: 'queued' | 'started' | 'succeeded' | 'failed' | 'cancelled';
  environment?: string;
  url?: string | null;
  version?: string | null;
  build_id?: string | null;
  commit?: string | null;
  message?: string | null;
  occurred_at?: string;
}

export interface EventInput {
  id?: string;
  type: 'error' | 'warning' | 'deployment' | 'content' | 'security' | 'performance' | 'info' | string;
  message: string;
  severity?: 'info' | 'warn' | 'error' | 'critical';
  occurred_at?: string;
  metadata?: Record<string, unknown>;
}

export interface EventsResult {
  accepted: number;
  duplicates: number;
  rejected: { index: number; reason: string }[];
}

export interface HealthInput {
  status: 'ok' | 'degraded' | 'down' | 'unknown';
  message?: string;
  checks?: { name: string; status: 'ok' | 'warn' | 'fail'; detail?: string }[];
  reported_at?: string;
}

export interface MaintenanceRequestInput {
  title: string;
  description: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  category?: string;
}

export interface RegistrationResult {
  website: { id: number; name: string; integration_id: string };
  credential: { key_id: string; secret: string; token: string; scopes: string[] };
}

const SDK_VERSION = '1.0.0';

export class AnvilClient {
  private readonly base: string;
  private readonly token?: string;
  private readonly doFetch: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly ua: string;

  constructor(options: AnvilClientOptions) {
    if (!options?.baseUrl) throw new Error('AnvilClient: baseUrl is required');
    this.base = normalizeBase(options.baseUrl);
    this.token = options.token;
    this.doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.retries = options.retries ?? 2;
    this.ua = `anvil-integration/${options.sdkVersion ?? SDK_VERSION}`;
  }

  /** Identity of the calling website. */
  me(): Promise<WebsiteIdentity> {
    return this.request<WebsiteIdentity>('GET', '/me', undefined, 'website:read');
  }

  getWebsite(): Promise<Record<string, unknown>> {
    return this.request('GET', '/website', undefined, 'website:read');
  }

  /** Idempotent metadata synchronisation. Returns `unchanged: true` when nothing changed. */
  syncMetadata(input: SyncInput): Promise<SyncResult> {
    return this.request<SyncResult>('POST', '/sync', input, 'website:sync');
  }

  /** Alias of syncMetadata for partial updates. */
  updateWebsite(input: SyncInput): Promise<SyncResult> {
    return this.request<SyncResult>('PATCH', '/website', input, 'website:sync');
  }

  /**
   * Report one diagnostic event. A stable `id` makes the call idempotent; when omitted a
   * deterministic key is derived from the event contents so retries cannot duplicate it.
   */
  async reportEvent(event: EventInput): Promise<{ accepted: boolean; duplicate: boolean; id: string }> {
    const id = event.id ?? (await stableKey(event));
    const res = await this.reportEvents([{ ...event, id }]);
    return { accepted: res.accepted > 0, duplicate: res.duplicates > 0, id };
  }

  reportEvents(events: EventInput[]): Promise<EventsResult> {
    return this.request<EventsResult>('POST', '/events', { events }, 'events:write');
  }

  reportError(error: { message: string; detail?: string; id?: string; metadata?: Record<string, unknown> }): Promise<{ accepted: boolean; duplicate: boolean; id: string }> {
    return this.reportEvent({
      id: error.id,
      type: 'error',
      severity: 'error',
      message: error.message,
      metadata: { ...(error.metadata ?? {}), detail: error.detail?.slice(0, 4000) },
    });
  }

  reportDeployment(input: DeploymentInput): Promise<Record<string, unknown>> {
    return this.request('POST', '/deployments', input, 'deployments:write');
  }

  reportHealth(input: HealthInput): Promise<Record<string, unknown>> {
    return this.request('POST', '/health-report', input, 'health:write');
  }

  createMaintenanceRequest(input: MaintenanceRequestInput): Promise<Record<string, unknown>> {
    return this.request('POST', '/maintenance-requests', input, 'maintenance:write');
  }

  listMaintenanceRequests(): Promise<Record<string, unknown>> {
    return this.request('GET', '/maintenance-requests', undefined, 'website:read');
  }

  /**
   * Exchange a one-time registration token for a website credential.
   * The returned secret is shown once — persist it in the website's secret store.
   */
  static async register(options: {
    baseUrl: string;
    registrationToken: string;
    sdkVersion?: string;
    fetch?: typeof fetch;
    deploymentEnvironment?: string;
  }): Promise<RegistrationResult> {
    if (!options.registrationToken?.startsWith('wreg_')) {
      throw new Error('AnvilClient.register: registrationToken must start with "wreg_"');
    }
    const client = new AnvilClient({ baseUrl: options.baseUrl, token: options.registrationToken, fetch: options.fetch, retries: 0 });
    return client.request<RegistrationResult>('POST', '/register', {
      sdk_version: options.sdkVersion ?? SDK_VERSION,
      deployment_environment: options.deploymentEnvironment ?? 'production',
    });
  }

  private async request<T = Record<string, unknown>>(method: string, path: string, body?: unknown, scope?: string): Promise<T> {
    if (!this.token) throw new Error(`AnvilClient: a credential is required for ${method} ${path}${scope ? ` (scope ${scope})` : ''}`);
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.doFetch(`${this.base}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${this.token}`,
            'content-type': 'application/json',
            accept: 'application/json',
            'user-agent': this.ua,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });
        const text = await res.text();
        const payload = text ? safeJson(text) : {};
        if (!res.ok) {
          const err = payload as AnvilApiErrorBody;
          const error = new AnvilApiError(
            res.status,
            err.error?.code ?? 'request_failed',
            err.error?.message ?? `Request failed with status ${res.status}`,
            err.request_id ?? res.headers.get('x-request-id'),
            payload,
          );
          if (error.retryable && attempt < this.retries) {
            lastError = error;
            await sleep(retryDelay(res.headers.get('retry-after'), attempt));
            continue;
          }
          throw error;
        }
        return payload as T;
      } catch (err) {
        if (err instanceof AnvilApiError) throw err;
        lastError = err;
        if (attempt < this.retries) {
          await sleep(retryDelay(null, attempt));
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw new AnvilApiError(0, 'network_error', lastError instanceof Error ? lastError.message : 'Network request failed', null, null);
  }
}

/** Verify an inbound webhook. Returns the parsed payload, or throws when the signature is invalid. */
export async function verifyWebhook(options: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
  toleranceSeconds?: number;
  now?: number;
}): Promise<unknown> {
  const header = options.signatureHeader ?? '';
  const parts = Object.fromEntries(
    header.split(',').map((piece) => {
      const i = piece.indexOf('=');
      return i < 0 ? [piece.trim(), ''] : [piece.slice(0, i).trim(), piece.slice(i + 1).trim()];
    }),
  ) as Record<string, string>;
  const timestamp = Number(parts.t);
  const provided = parts.v1;
  if (!timestamp || !provided) throw new AnvilApiError(400, 'invalid_signature_header', 'Missing t= or v1= in signature header', null, null);

  const tolerance = options.toleranceSeconds ?? 300;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) {
    throw new AnvilApiError(400, 'stale_webhook', `Webhook timestamp is outside the ${tolerance}s tolerance window`, null, null);
  }

  const expected = await hmacHex(options.secret, `${timestamp}.${options.rawBody}`);
  if (!timingSafeEqual(expected, provided)) {
    throw new AnvilApiError(401, 'invalid_signature', 'Webhook signature does not match', null, null);
  }
  return JSON.parse(options.rawBody);
}

/** Produce a signature header for tests or for re-sending recorded payloads. */
export async function signWebhook(secret: string, rawBody: string, timestamp = Math.floor(Date.now() / 1000)): Promise<string> {
  const v1 = await hmacHex(secret, `${timestamp}.${rawBody}`);
  return `t=${timestamp},v1=${v1}`;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function stableKey(event: EventInput): Promise<string> {
  const basis = `${event.type}|${event.severity ?? 'error'}|${event.message}|${event.occurred_at ?? ''}|${JSON.stringify(event.metadata ?? {})}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(basis));
  return `evt_${[...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function normalizeBase(input: string): string {
  const trimmed = input.replace(/\/+$/, '');
  return /\/api\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/api/v1`;
}

function retryDelay(retryAfter: string | null, attempt: number): number {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 30_000);
  return Math.min(400 * 2 ** attempt, 8_000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: { code: 'invalid_json', message: text.slice(0, 300) } };
  }
}

export default AnvilClient;

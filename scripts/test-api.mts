// Integration checks for the application JSON API and the /api/v1 integration API.
// Requires a running Worker: npm run dev (or npm run dev:web for the Vite app).
// Run: npm run test:api

const BASE = process.env.TEST_BASE ?? 'http://127.0.0.1:3000';
const ADMIN_EMAIL = process.env.TEST_EMAIL ?? 'admin@anvil.test';
const ADMIN_PASSWORD = process.env.TEST_PASSWORD ?? 'AnvilOps-2026!';

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: unknown, detail?: unknown): void {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}

class Session {
  cookies = new Map<string, string>();
  csrf = '';
  user: any = null;
  loginSetCookies: string[] = [];

  header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async call(path: string, init: { method?: string; body?: unknown; form?: FormData; headers?: Record<string, string> } = {}) {
    const method = init.method ?? (init.body !== undefined || init.form ? 'POST' : 'GET');
    const headers: Record<string, string> = { accept: 'application/json', ...(init.headers ?? {}) };
    let body: BodyInit | undefined;
    if (init.form) body = init.form;
    else if (init.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
    if (this.cookies.size) headers.cookie = this.header();
    if (method !== 'GET' && this.csrf) headers['x-csrf-token'] = this.csrf;

    const res = await fetch(`${BASE}${path}`, { method, headers, body, redirect: 'manual' });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const raw of setCookies) {
      const [pair] = raw.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (!value || /Max-Age=0/.test(raw)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 200) };
    }
    return { status: res.status, data, setCookies, headers: Object.fromEntries(res.headers.entries()) };
  }

  async open(): Promise<void> {
    const session = await this.call('/app/api/session');
    this.csrf = session.data?.csrf ?? '';
  }

  async login(email: string, password: string) {
    await this.open();
    const res = await this.call('/app/api/session', { body: { email, password } });
    this.loginSetCookies = res.setCookies ?? [];
    this.user = res.data?.user ?? null;
    if (res.data?.csrf) this.csrf = res.data.csrf;
    return res;
  }
}

const suffix = Date.now().toString(36).slice(-6);

async function main(): Promise<void> {
  const admin = new Session();
  const login = await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
  check('administrator can sign in', login.status === 200 && login.data?.user?.role === 'admin', login);
  if (login.status !== 200) {
    report();
    return;
  }

  // ---------------------------------------------------------------- CSRF
  const noToken = await fetch(`${BASE}/app/api/clients`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: admin.header() },
    body: JSON.stringify({ name: 'No CSRF' }),
  });
  check('writes without a CSRF token are rejected', noToken.status === 403, noToken.status);

  // ---------------------------------------------------------------- clients
  const created = await admin.call('/app/api/clients', {
    body: { name: `Test Client ${suffix}`, email: `client-${suffix}@example.test`, status: 'active_client', tags: 'test, integration' },
  });
  check('client creation returns an id', created.status === 201 && Number(created.data?.id) > 0, created);
  const clientId = Number(created.data?.id);

  const search = await admin.call(`/app/api/clients?q=${encodeURIComponent(`Test Client ${suffix}`)}`);
  check('client search finds the new record', search.data?.rows?.some((row: any) => row.id === clientId), search.data?.total);
  check('client list is paginated', search.data?.page === 1 && typeof search.data?.pages === 'number');

  const patched = await admin.call(`/app/api/clients/${clientId}`, { method: 'PATCH', body: { company: 'Integration Co' } });
  const client = await admin.call(`/app/api/clients/${clientId}`);
  check('client update persists', patched.status === 200 && client.data?.client?.company === 'Integration Co', client.data?.client?.company);

  // ---------------------------------------------------------------- projects
  const project = await admin.call('/app/api/projects', {
    body: { name: `Test Project ${suffix}`, client_id: clientId, category: 'business_website', budget: '2400', status: 'in_progress' },
  });
  const projectId = Number(project.data?.id);
  check('project creation works', project.status === 201 && projectId > 0, project);

  const milestone = await admin.call(`/app/api/projects/${projectId}/milestones`, {
    body: { title: 'Design', status: 'done', amount: '600' },
  });
  const projectDetail = await admin.call(`/app/api/projects/${projectId}`);
  check('project milestone is stored', milestone.status === 201 && projectDetail.data?.milestones?.length === 1);
  check('project budget is stored in cents', projectDetail.data?.project?.budget_cents === 240000, projectDetail.data?.project?.budget_cents);

  const deliverable = await admin.call(`/app/api/projects/${projectId}/deliverables`, {
    body: { title: 'Homepage', url: 'https://example.com', status: 'ready', portal_visible: true },
  });
  check('deliverable is stored', deliverable.status === 201, deliverable);

  // ---------------------------------------------------------------- websites + monitoring
  const site = await admin.call('/app/api/websites', {
    body: {
      client_id: clientId, project_id: projectId, name: `Test Site ${suffix}`, domain: `test-${suffix}.example`,
      production_url: `${BASE}/api/v1/health`, status: 'live', monitoring_enabled: true,
    },
  });
  const siteId = Number(site.data?.id);
  check('website creation works', site.status === 201 && siteId > 0, site);

  const before = await admin.call(`/app/api/websites/${siteId}`);
  const checkRun = await admin.call(`/app/api/websites/${siteId}/check`, { body: {} });
  const after = await admin.call(`/app/api/websites/${siteId}`);
  check('a real availability check is recorded', checkRun.data?.result?.httpStatus === 200, checkRun.data);
  check('check is stored with the manual source', after.data?.checks?.[0]?.source === 'manual', after.data?.checks?.[0]?.source);
  check('measured health updates the website', after.data?.website?.last_health === 'ok', after.data?.website?.last_health);
  check('checks grow by one', after.data.checks.length === before.data.checks.length + 1);

  // ---------------------------------------------------------------- invoices + money
  const invoice = await admin.call('/app/api/invoices', {
    body: {
      client_id: clientId, project_id: projectId, kind: 'development', description: 'Test invoice',
      items: [{ description: 'Design', qty: 2, unit_price: 500 }, { description: 'Build', qty: 1, unit_price: 900 }],
    },
  });
  const invoiceId = Number(invoice.data?.id);
  const invoiceDetail = await admin.call(`/app/api/invoices/${invoiceId}`);
  check('invoice totals are computed from line items', invoiceDetail.data?.invoice?.total_cents === 190000, invoiceDetail.data?.invoice?.total_cents);
  check('draft invoice starts unpaid at zero', invoiceDetail.data?.invoice?.paid_cents === 0);

  const pending = await admin.call(`/app/api/invoices/${invoiceId}/payments`, {
    body: { amount: '1900', status: 'pending', method: 'bank_transfer' },
  });
  const afterPending = await admin.call(`/app/api/invoices/${invoiceId}`);
  check('pending payment is recorded', pending.status === 201, pending);
  check('pending payment does not mark the invoice paid', afterPending.data?.invoice?.paid_cents === 0 && afterPending.data?.invoice?.status !== 'paid', afterPending.data?.invoice?.status);

  const overpay = await admin.call(`/app/api/invoices/${invoiceId}/payments`, { body: { amount: '5000', status: 'confirmed' } });
  check('overpayment is refused', overpay.status === 422, overpay);

  await admin.call(`/app/api/invoices/${invoiceId}/send`, { body: {} });
  const confirmed = await admin.call(`/app/api/payments/${pending.data.id}/confirm`, { body: {} });
  const afterConfirm = await admin.call(`/app/api/invoices/${invoiceId}`);
  check('confirming the claim settles the invoice', confirmed.status === 200 && afterConfirm.data?.invoice?.status === 'paid', afterConfirm.data?.invoice?.status);
  check('paid amount equals the total', afterConfirm.data?.invoice?.paid_cents === 190000, afterConfirm.data?.invoice?.paid_cents);

  const pendingInvoice = await admin.call('/app/api/invoices', {
    body: { client_id: clientId, items: [{ description: 'Retainer', qty: 1, unit_price: 400 }] },
  });
  await admin.call(`/app/api/invoices/${pendingInvoice.data.id}/send`, { body: {} });

  const invoiceList = await admin.call('/app/api/invoices');
  check('invoice list loads with totals', invoiceList.status === 200 && Array.isArray(invoiceList.data?.rows) && Number(invoiceList.data?.totals?.invoiced_cents) >= 0, invoiceList.status);

  // ---------------------------------------------------------------- agreements
  const agreement = await admin.call('/app/api/agreements', {
    body: { client_id: clientId, title: `Test Agreement ${suffix}`, amount: '2400', body: 'Terms of the engagement.', scope: 'Design and build.' },
  });
  await admin.call(`/app/api/agreements/${agreement.data.id}/send`, { body: {} });

  // ---------------------------------------------------------------- documents
  const docForm = new FormData();
  docForm.set('file', new Blob(['internal notes'], { type: 'text/plain' }), 'internal.txt');
  docForm.set('client_id', String(clientId));
  docForm.set('visibility', 'internal');
  const internalDoc = await admin.call('/app/api/documents', { form: docForm });
  check('document upload succeeds', internalDoc.status === 201, internalDoc);

  // ---------------------------------------------------------------- portal user + isolation
  const portalEmail = `portal-${suffix}@example.test`;
  const portalPassword = 'PortalPass-2026!';
  const portalCreate = await admin.call(`/app/api/clients/${clientId}/portal`, {
    body: { email: portalEmail, password: portalPassword, name: 'Portal Tester' },
  });
  check('portal login can be created', portalCreate.status === 201, portalCreate);

  const otherClient = await admin.call('/app/api/clients', { body: { name: `Other Client ${suffix}`, status: 'active_client' } });
  const otherInvoice = await admin.call('/app/api/invoices', {
    body: { client_id: Number(otherClient.data.id), items: [{ description: 'Private', qty: 1, unit_price: 999 }] },
  });
  await admin.call(`/app/api/invoices/${otherInvoice.data.id}/send`, { body: {} });

  const otherProject = await admin.call('/app/api/projects', {
    body: { name: `Other Project ${suffix}`, client_id: Number(otherClient.data.id), category: 'business_website' },
  });
  const otherAgreement = await admin.call('/app/api/agreements', {
    body: { client_id: Number(otherClient.data.id), title: `Other Agreement ${suffix}`, amount: '500' },
  });
  await admin.call(`/app/api/agreements/${otherAgreement.data.id}/send`, { body: {} });
  const otherDocForm = new FormData();
  otherDocForm.set('file', new Blob(['other client secret'], { type: 'text/plain' }), 'other.txt');
  otherDocForm.set('client_id', String(Number(otherClient.data.id)));
  otherDocForm.set('visibility', 'client');
  const otherDoc = await admin.call('/app/api/documents', { form: otherDocForm });

  const portal = new Session();
  const portalLogin = await portal.login(portalEmail, portalPassword);
  check('client can sign in to the portal', portalLogin.status === 200 && portalLogin.data?.user?.role === 'client', portalLogin);

  const portalHome = await portal.call('/app/api/portal');
  const portalInvoiceIds = (portalHome.data?.invoices ?? []).map((row: any) => row.id);
  check('portal lists only its own invoices', portalInvoiceIds.includes(Number(invoice.data.id)) && !portalInvoiceIds.includes(Number(otherInvoice.data.id)), portalInvoiceIds);

  const foreignInvoice = await portal.call(`/app/api/portal/invoices/${otherInvoice.data.id}/claim`, { body: { amount: '10' } });
  check('portal cannot act on another client\'s invoice', foreignInvoice.status === 404, foreignInvoice.status);

  const staffOnly = await portal.call('/app/api/clients');
  check('portal cannot read the staff client list', staffOnly.status === 403, staffOnly.status);
  const adminOnly = await portal.call('/app/api/settings');
  check('portal cannot read settings', adminOnly.status === 403, adminOnly.status);

  const internalDownload = await portal.call(`/app/api/documents/${internalDoc.data.id}/download`);
  check('internal document is hidden from the portal', internalDownload.status === 404, internalDownload.status);

  // ---------------------------------------------------------------- portal hardening
  const foreignSite = await admin.call('/app/api/websites', {
    body: { client_id: Number(otherClient.data.id), name: `Foreign site ${suffix}`, domain: `foreign-${suffix}.example` },
  });
  const crossClientSite = await portal.call('/app/api/portal/requests', {
    body: { title: 'Wrong site', website_id: foreignSite.data.id },
  });
  check("portal rejects another client's website id on a request", crossClientSite.status === 422, crossClientSite);

  const portalProjectDetail = await portal.call(`/app/api/portal/projects/${projectId}`);
  const portalProjectRow = portalProjectDetail.data?.project ?? {};
  check(
    'portal project detail hides internal billing fields',
    portalProjectDetail.status === 200 &&
      portalProjectRow.name === `Test Project ${suffix}` &&
      !('budget_cents' in portalProjectRow) &&
      !('notes' in portalProjectRow) &&
      !('payment_structure' in portalProjectRow),
    Object.keys(portalProjectRow),
  );

  // ---------------------------------------------------------------- row-level scoping
  const foreignProject = await portal.call(`/app/api/portal/projects/${otherProject.data.id}`);
  check("portal cannot open another client's project", foreignProject.status === 404, foreignProject.status);

  const foreignAgreementView = await portal.call(`/app/api/portal/agreements/${otherAgreement.data.id}/view`, { body: {} });
  check("portal cannot open another client's agreement", foreignAgreementView.status === 404, foreignAgreementView.status);

  const foreignAgreementAccept = await portal.call(`/app/api/portal/agreements/${otherAgreement.data.id}/accept`, {
    body: { name: 'Mallory', consent: true },
  });
  check("portal cannot accept another client's agreement", foreignAgreementAccept.status === 404, foreignAgreementAccept.status);

  const foreignDocument = await portal.call(`/app/api/documents/${otherDoc.data.id}/download`);
  check("portal cannot download another client's document", foreignDocument.status === 404, foreignDocument.status);

  const refreshedHome = await portal.call('/app/api/portal');
  check(
    'portal overview lists no records from another client',
    !(refreshedHome.data?.projects ?? []).some((row: any) => row.id === Number(otherProject.data.id)) &&
      !(refreshedHome.data?.agreements ?? []).some((row: any) => row.id === Number(otherAgreement.data.id)),
  );

  const sessionCookie = admin.loginSetCookies.find((value) => value.startsWith('anvil_session='));
  const secureContext = BASE.startsWith('https://');
  check(
    'session cookie is HttpOnly with a HTTPS-safe SameSite policy',
    Boolean(sessionCookie) &&
      /HttpOnly/.test(sessionCookie ?? '') &&
      (secureContext
        ? /SameSite=None/.test(sessionCookie ?? '') && /Secure/.test(sessionCookie ?? '')
        : /SameSite=Lax/.test(sessionCookie ?? '')),
    sessionCookie,
  );

  const evilOrigin = await fetch(`${BASE}/app/api/clients`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: admin.header(),
      'x-csrf-token': admin.csrf,
      origin: 'https://evil.example',
    },
    body: JSON.stringify({ name: 'Origin test' }),
  });
  check('cross-origin writes are rejected', evilOrigin.status === 403, evilOrigin.status);

  const sameOrigin = await fetch(`${BASE}/app/api/clients`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: admin.header(),
      'x-csrf-token': admin.csrf,
      origin: BASE,
    },
    body: JSON.stringify({ name: `Origin test ${suffix}` }),
  });
  check('same-origin writes still work', sameOrigin.status === 201, sameOrigin.status);
  if (sameOrigin.status === 201) {
    const originClient = await sameOrigin.json().catch(() => null);
    if (originClient?.id) await admin.call(`/app/api/clients/${originClient.id}`, { method: 'DELETE' });
  }

  const crossSiteFetch = await fetch(`${BASE}/app/api/clients`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: admin.header(),
      'x-csrf-token': admin.csrf,
      'sec-fetch-site': 'cross-site',
    },
    body: JSON.stringify({ name: 'Cross site test' }),
  });
  check('cross-site fetch metadata is rejected', crossSiteFetch.status === 403, crossSiteFetch.status);

  // portal payment claim stays pending
  const claim = await portal.call(`/app/api/portal/invoices/${pendingInvoice.data.id}/claim`, {
    body: { amount: '400', reference: 'BANK-123' },
  });
  const afterClaim = await admin.call(`/app/api/invoices/${pendingInvoice.data.id}`);
  check('portal payment claim is accepted', claim.status === 201 && claim.data?.status === 'pending', claim);
  check('portal claim does not settle the invoice', afterClaim.data?.invoice?.paid_cents === 0, afterClaim.data?.invoice?.paid_cents);
  check('invoice exposes the pending claim', afterClaim.data?.payments?.some((p: any) => p.status === 'pending' && p.source === 'portal'));

  // portal agreement acceptance records identity, IP and hash
  const view = await portal.call(`/app/api/portal/agreements/${agreement.data.id}/view`, { body: {} });
  check('portal can open a sent agreement', view.status === 200, view);
  const accept = await portal.call(`/app/api/portal/agreements/${agreement.data.id}/accept`, {
    body: { name: 'Portal Tester', consent: true },
  });
  const accepted = await admin.call(`/app/api/agreements/${agreement.data.id}`);
  check('agreement acceptance is recorded', accept.status === 200 && accepted.data?.agreement?.status === 'accepted', accepted.data?.agreement?.status);
  check('acceptance stores the signer name', accepted.data?.agreement?.accepted_by === 'Portal Tester');
  check('acceptance stores a content hash', /^[0-9a-f]{64}$/.test(String(accepted.data?.agreement?.accepted_hash)), accepted.data?.agreement?.accepted_hash);
  check('acceptance stores the client IP', Boolean(accepted.data?.agreement?.accepted_ip));

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const expiredAgreement = await admin.call('/app/api/agreements', {
    body: { client_id: clientId, title: `Expired Terms ${suffix}`, amount: '900', expires_at: yesterday },
  });
  await admin.call(`/app/api/agreements/${expiredAgreement.data.id}/send`, { body: {} });
  const expiredAccept = await portal.call(`/app/api/portal/agreements/${expiredAgreement.data.id}/accept`, {
    body: { name: 'Portal Tester', consent: true },
  });
  check(
    'expired agreements cannot be accepted',
    expiredAccept.status === 409 && /expired/i.test(String(expiredAccept.data?.error?.message ?? '')),
    expiredAccept,
  );
  const expiredDetail = await admin.call(`/app/api/agreements/${expiredAgreement.data.id}`);
  check('expired agreement stays unaccepted', !expiredDetail.data?.agreement?.accepted_at, expiredDetail.data?.agreement?.status);

  // ---------------------------------------------------------------- portal write budget
  const spamClient = await admin.call('/app/api/clients', {
    body: { name: `Rate limit ${suffix}`, status: 'active_client' },
  });
  const spamEmail = `spam-${suffix}@example.test`;
  await admin.call(`/app/api/clients/${spamClient.data.id}/portal`, {
    body: { email: spamEmail, password: portalPassword },
  });
  const spam = new Session();
  const spamLogin = await spam.login(spamEmail, portalPassword);
  check('a second client account can sign in', spamLogin.status === 200, spamLogin.status);

  let limited: Awaited<ReturnType<Session['call']>> | null = null;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    limited = await spam.call('/app/api/portal/requests', { body: {} });
    if (limited.status === 429) break;
  }
  check('portal writes are rate limited per account', limited?.status === 429, limited?.status);
  check('rate limit response carries Retry-After', Number(limited?.headers?.['retry-after'] ?? 0) > 0, limited?.headers);
  const unaffected = await portal.call(`/app/api/portal/agreements/${agreement.data.id}/view`, { body: {} });
  check('rate limiting does not leak across accounts', unaffected.status === 200, unaffected.status);
  await admin.call(`/app/api/clients/${spamClient.data.id}`, { method: 'DELETE' });

  // ---------------------------------------------------------------- integration API
  const credential = await admin.call(`/app/api/websites/${siteId}/credentials`, {
    body: { label: 'Integration test', scopes: 'website:read' },
  });
  check('credential is issued with a one-time secret', credential.status === 201 && String(credential.data?.token).includes('.'), credential);

  const apiCall = async (token: string, path: string, method = 'GET') =>
    fetch(`${BASE}${path}`, { method, headers: { authorization: `Bearer ${token}` } });

  const siteRead = await apiCall(credential.data.token, '/api/v1/website');
  check('API key reads its own website', siteRead.status === 200, siteRead.status);

  const wrongScope = await apiCall(credential.data.token, '/api/v1/events', 'POST');
  check('scope is enforced', wrongScope.status === 403, wrongScope.status);

  const noKey = await fetch(`${BASE}/api/v1/website`);
  check('API requires credentials', noKey.status === 401, noKey.status);

  const credentialId = (
    await admin.call(`/app/api/websites/${siteId}`)
  ).data.credentials[0].id;
  await admin.call(`/app/api/websites/${siteId}/credentials/${credentialId}`, { method: 'DELETE' });
  const afterRevoke = await apiCall(credential.data.token, '/api/v1/website');
  check('revoked key stops working immediately', afterRevoke.status === 401, afterRevoke.status);

  // ---------------------------------------------------------------- audit + security headers
  const audit = await admin.call('/app/api/activity');
  check('audit log records activity', (audit.data?.rows ?? []).length > 0, audit.data?.total);

  const shell = await fetch(`${BASE}/admin/clients`);
  const shellText = await shell.text();
  check('SPA shell is served for client routes', shell.status === 200 && shellText.includes('<div id="root">'), shell.status);
  check('security headers are present', shell.headers.get('x-content-type-options') === 'nosniff');
  check('CSP is set for documents', (shell.headers.get('content-security-policy') ?? '').includes("default-src 'self'"), shell.headers.get('content-security-policy'));

  // ---------------------------------------------------------------- cleanup
  await admin.call(`/app/api/clients/${clientId}`, { method: 'DELETE' });
  await admin.call(`/app/api/clients/${Number(otherClient.data.id)}`, { method: 'DELETE' });
  const removed = await admin.call(`/app/api/clients/${clientId}`);
  check('deleting a client removes its records', removed.status === 404, removed.status);

  report();
}

function report(): void {
  console.log(`\n${passed}/${passed + failures.length} checks passed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const failure of failures) console.log(`  ✗ ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('All checks passed.');
  }
}

main().catch((err) => {
  console.error('Test run crashed:', err);
  process.exitCode = 1;
});

// Reports, search, settings, API operations and the audit log.

import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, fmtDate, fmtDateTime, money, titleize, useApi, type List, type Row } from '../api';
import { useSession } from '../session';
import { FormModal } from '../forms';
import {
  Alert, Badge, Dt, Empty, KV, Loading, Money, PageHead, Panel, StatBand, Status, Table, toast,
} from '../ui';

export function Reports() {
  const { session } = useSession();
  const currency = session?.settings.currency ?? 'USD';
  const [from, setFrom] = useState(`${new Date().getUTCFullYear()}-01-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const { data, error, loading } = useApi<any>(`/app/api/reports?from=${from}&to=${to}`);
  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;
  const maxMonth = Math.max(1, ...data.by_month.map((m: Row) => Number(m.invoiced)));
  const agingTotal = data.aging.reduce((sum: number, row: Row) => sum + Number(row.amount), 0);

  const exportCsv = () => {
    const lines = [['Client', 'Invoiced', 'Collected', 'Outstanding']];
    for (const row of data.by_client) {
      lines.push([String(row.name), (row.invoiced / 100).toFixed(2), (row.collected / 100).toFixed(2), (row.outstanding / 100).toFixed(2)]);
    }
    const blob = new Blob([lines.map((line) => line.join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `revenue-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHead
        eyebrow="Business"
        title="Reports"
        sub="Revenue, aging and delivery — computed from records, with invoiced and collected kept apart."
        actions={<button className="btn ghost" onClick={exportCsv}>Export revenue CSV</button>}
      />
      <div className="filters">
        <label className="lbl" htmlFor="from">From</label>
        <input id="from" className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label className="lbl" htmlFor="to">To</label>
        <input id="to" className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <StatBand
        items={[
          { label: 'Invoiced', value: money(data.totals.invoiced_cents, currency) },
          { label: 'Collected', value: money(data.totals.collected_cents, currency), tone: 'ok' },
          { label: 'Outstanding', value: money(agingTotal, currency), tone: agingTotal ? 'warn' : undefined },
          { label: 'Retainers / month', value: money(data.mrr_cents, currency) },
          { label: 'Open pipeline', value: money(data.totals.pipeline_value_cents, currency) },
        ]}
      />

      <div className="grid grid-2">
        <Panel title="Invoiced by month" foot={`${fmtDate(from)} — ${fmtDate(to)}`}>
          {data.by_month.length === 0 ? <Empty title="No invoices in this period" body="Widen the date range or issue an invoice." /> : (
            <div className="rev-chart" style={{ height: 150 }}>
              {data.by_month.map((row: Row) => (
                <div className="rev-col" key={row.month} title={`${row.month}: ${money(row.invoiced, currency)}`}>
                  <div className="rev-bars"><div className="b2" style={{ height: `${Math.round((Number(row.invoiced) / maxMonth) * 100)}%`, width: '62%' }} /></div>
                  <div className="rev-x">{String(row.month).slice(5)}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Receivables aging">
          <div className="stack" style={{ gap: 8 }}>
            {['current', '1-30', '31-60', '60+', 'undated'].map((bucket) => {
              const row = data.aging.find((r: Row) => r.bucket === bucket);
              const amount = Number(row?.amount ?? 0);
              return (
                <div className="dist-row" key={bucket} style={{ gridTemplateColumns: '96px 1fr 96px' }}>
                  <span className="small">{bucket === 'current' ? 'Not due' : bucket === 'undated' ? 'No due date' : `${bucket} days`}</span>
                  <div className="bar"><span style={{ width: `${agingTotal ? Math.round((amount / agingTotal) * 100) : 0}%`, background: ['31-60', '60+'].includes(bucket) ? 'var(--danger)' : undefined }} /></div>
                  <span className="n">{money(amount, currency)}</span>
                </div>
              );
            })}
          </div>
          <div className="hint mt-2">Includes unpaid, partially paid and overdue invoices.</div>
        </Panel>
      </div>

      <Panel title="Revenue by client" right={<span className="tiny muted">Issued invoices in range</span>} flush>
        <Table
          rows={data.by_client}
          empty="No client revenue in this period."
          columns={[
            { label: 'Client', render: (row) => <Link to={`/admin/clients/${row.id}`}>{row.name}</Link> },
            { label: 'Invoiced', num: true, render: (row) => <Money cents={row.invoiced} currency={currency} /> },
            { label: 'Collected', num: true, render: (row) => <Money cents={row.collected} currency={currency} /> },
            { label: 'Outstanding', num: true, render: (row) => <Money cents={row.outstanding} currency={currency} /> },
            {
              label: 'Collection',
              num: true,
              render: (row) => `${row.invoiced ? Math.round((Number(row.collected) / Number(row.invoiced)) * 100) : 0}%`,
            },
          ]}
        />
      </Panel>

      <div className="grid grid-2 mt-2">
        <Panel title="Projects by status" flush>
          <Table
            rows={data.project_status}
            empty="No projects."
            columns={[
              { label: 'Status', render: (row) => <Status status={row.status} /> },
              { label: 'Count', num: true, render: (row) => row.count },
              { label: 'Budget', num: true, render: (row) => <Money cents={row.budget} currency={currency} /> },
            ]}
          />
        </Panel>
        <Panel title="Pipeline funnel" flush>
          <Table
            rows={data.funnel}
            empty="No leads."
            columns={[
              { label: 'Stage', render: (row) => titleize(row.stage) },
              { label: 'Leads', num: true, render: (row) => row.count },
              { label: 'Value', num: true, render: (row) => <Money cents={row.value} currency={currency} /> },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Website health" right={<Link to="/admin/websites" className="link-action">Websites</Link>}>
        <div className="row" style={{ gap: 18 }}>
          {data.health.map((row: Row) => (
            <div key={row.health} className="row-tight">
              <Status status={row.health === 'unchecked' ? 'draft' : row.health} />
              <span className="mono small">{row.count}</span>
            </div>
          ))}
          {data.health.length === 0 ? <span className="muted small">No websites recorded.</span> : null}
        </div>
      </Panel>
    </>
  );
}

export function SearchPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get('q') ?? '';
  const [term, setTerm] = useState(q);
  const { data, error, loading } = useApi<{ groups: { label: string; items: Row[] }[] }>(q ? `/app/api/search?q=${encodeURIComponent(q)}` : null);

  return (
    <>
      <PageHead eyebrow="Search" title={q ? `Results for “${q}”` : 'Search'} sub="Clients, leads, projects, websites, invoices, agreements and documents." />
      <form
        className="filters"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const value = term.trim();
          if (value.length > 1) navigate(`/admin/search?q=${encodeURIComponent(value)}`);
        }}
      >
        <input
          className="input"
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search the workspace"
          aria-label="Search"
          autoFocus
        />
        <button className="btn accent" type="submit">Search</button>
      </form>
      {error ? <Alert>{error}</Alert> : null}
      {loading ? <Loading /> : null}
      {!loading && data?.groups.length === 0 ? <Empty title="No matches" body="Try a shorter term or a client name." /> : null}
      {data?.groups.map((group) => (
        <div className="search-group" key={group.label}>
          <h2>{group.label}</h2>
          {group.items.map((item) => (
            <Link className="search-hit" to={item.href} key={`${group.label}-${item.id}`}>
              <span className="t">{item.title}</span>
              <span className="s">{item.subtitle}</span>
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}

export function SettingsPage() {
  const { session, refresh } = useSession();
  const { data, error, loading, reload } = useApi<{ settings: Record<string, string>; users: Row[] }>('/app/api/settings');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string> | null>(null);

  if (loading) return <Loading />;
  if (error) {
    return <Alert kind="warn">{error} Settings are restricted to administrators.</Alert>;
  }
  if (!data) return null;
  const values = form ?? data.settings;
  const set = (key: string, value: string) => setForm({ ...values, [key]: value });

  return (
    <>
      <PageHead
        eyebrow="System"
        title="Settings"
        sub="Business identity, invoicing defaults and staff access."
        actions={(
          <button
            className="btn accent"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await api('/app/api/settings', { method: 'PUT', body: values });
                toast('Settings saved.');
                setForm(null);
                await refresh();
                reload();
              } catch (err) {
                toast(err instanceof Error ? err.message : 'Could not save.', 'err');
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        )}
      />

      <div className="grid grid-2">
        <Panel title="Business">
          <div className="form-grid">
            {[
              ['business_name', 'Business name'], ['business_email', 'Billing email'], ['currency', 'Currency (ISO)'],
              ['tax_rate', 'Tax rate (%)'], ['invoice_prefix', 'Invoice prefix'], ['agreement_prefix', 'Agreement prefix'],
              ['payment_terms_days', 'Payment terms (days)'], ['api_rate_limit_per_minute', 'API rate limit / minute'],
            ].map(([key, label]) => (
              <div className="field" key={key}>
                <label className="lbl" htmlFor={`s-${key}`}>{label}</label>
                <input id={`s-${key}`} className="input" value={values[key] ?? ''} onChange={(e) => set(key, e.target.value)} />
              </div>
            ))}
            <div className="field span-2">
              <label className="lbl" htmlFor="s-portal">Portal welcome message</label>
              <textarea id="s-portal" className="input" rows={3} value={values.portal_welcome ?? ''} onChange={(e) => set('portal_welcome', e.target.value)} />
            </div>
          </div>
          <div className="hint mt-2">Currency changes affect display only; stored amounts stay in minor units.</div>
        </Panel>

        <Panel title="Security posture">
          <KV items={[
            ['Password hashing', 'PBKDF2-SHA256, 150k iterations'],
            ['Sessions', 'Hashed IDs, HttpOnly, 12h, SameSite=None on HTTPS'],
            ['CSRF', 'Per-session token, required on writes'],
            ['Request origin', 'Cross-site writes rejected (Sec-Fetch-Site)'],
            ['Login throttling', '8 failures per 15 minutes'],
            ['Roles', 'Administrator, Staff, Client'],
            ['Portal isolation', 'Server-side client scope on every query'],
            ['Portal payloads', 'Internal budget, notes and plans never serialised'],
            ['Sign-in lockout', 'Account status checked on every request'],
          ]} />
        </Panel>
      </div>

      <Panel
        title="Staff accounts"
        right={<button className="btn ghost sm" onClick={() => setCreating(true)}>Add staff</button>}
        flush
      >
        <Table
          rows={data.users}
          empty="No accounts."
          columns={[
            { label: 'Name', render: (row) => <div><div className="primary-cell">{row.name}</div><div className="sub-cell">{row.email}</div></div> },
            { label: 'Role', render: (row) => <Badge tone={row.role === 'admin' ? 'gold' : row.role === 'client' ? 'info' : 'neutral'}>{titleize(row.role)}</Badge> },
            { label: 'Client', render: (row) => row.client_name ?? '—' },
            { label: 'Last sign-in', render: (row) => row.last_login_at ? fmtDateTime(row.last_login_at) : 'Never' },
            { label: 'Status', render: (row) => <Status status={row.status} /> },
            {
              label: '',
              render: (row) => row.role === 'client' ? null : (
                <button
                  className="link-action link-danger"
                  onClick={async () => {
                    const next = row.status === 'active' ? 'disabled' : 'active';
                    if (!window.confirm(`${next === 'disabled' ? 'Disable' : 'Enable'} ${row.name}?`)) return;
                    try {
                      await api(`/app/api/users/${row.id}`, { method: 'PATCH', body: { status: next } });
                      toast('Account updated.');
                      reload();
                    } catch (err) {
                      toast(err instanceof Error ? err.message : 'Could not update.', 'err');
                    }
                  }}
                >
                  {row.status === 'active' ? 'Disable' : 'Enable'}
                </button>
              ),
            },
          ]}
        />
      </Panel>

      <div className="hint mt-2">
        Signed in as {session?.user?.name} ({session?.user?.role}). Client logins are created from the client record so they
        inherit the right data scope.
      </div>

      {creating ? (
        <FormModal
          title="Add staff account"
          fields={[
            { name: 'name', label: 'Name', required: true },
            { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'role', label: 'Role', type: 'select', options: [{ value: 'staff', label: 'Staff' }, { value: 'admin', label: 'Administrator' }] },
            { name: 'password', label: 'Temporary password', type: 'password', required: true, hint: 'At least 10 characters.' },
          ]}
          initial={{ role: 'staff' }}
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            await api('/app/api/users', { body: values });
            toast('Staff account created.');
            reload();
          }}
        />
      ) : null}
    </>
  );
}

export function ApiConsole() {
  const { data, error, loading } = useApi<any>('/app/api/api-admin');
  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;
  const maxUsage = Math.max(1, ...data.usage.map((row: Row) => Number(row.count)));

  return (
    <>
      <PageHead
        eyebrow="System"
        title="API & webhooks"
        sub="Per-website credentials, scoped access, delivery history and request logs."
        actions={<Link className="btn ghost" to="/admin/api/docs">API reference</Link>}
      />
      <StatBand
        items={[
          { label: 'Active keys', value: String(data.credentials.filter((c: Row) => c.status === 'active').length) },
          { label: 'Endpoints', value: String(data.endpoints.length) },
          { label: 'Requests logged', value: String(data.logs.length) },
          { label: 'Failed deliveries', value: String(data.deliveries.filter((d: Row) => d.status === 'failed').length) },
          { label: 'Base URL', value: <span className="mono" style={{ fontSize: 13 }}>/api/v1</span> },
        ]}
      />

      <div className="grid grid-2">
        <Panel title="Request volume" right={<span className="tiny muted">Last 14 days</span>}>
          {data.usage.length === 0 ? <Empty title="No API traffic yet" body="Issue a credential on a website, then call /api/v1/website." /> : (
            <div className="rev-chart" style={{ height: 120 }}>
              {data.usage.map((row: Row) => (
                <div className="rev-col" key={row.day} title={`${row.day}: ${row.count} requests`}>
                  <div className="rev-bars"><div className="b2" style={{ height: `${Math.round((Number(row.count) / maxUsage) * 100)}%`, width: '60%' }} /></div>
                  <div className="rev-x">{String(row.day).slice(5)}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel title="Busiest integrations" flush>
          <Table
            rows={data.by_website}
            empty="No connected websites."
            columns={[
              { label: 'Website', render: (row) => row.name },
              { label: 'Requests', num: true, render: (row) => row.requests },
              { label: 'Last call', render: (row) => row.last_request ? fmtDateTime(row.last_request) : '—' },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Credentials" flush>
        <Table
          rows={data.credentials}
          empty="No credentials issued."
          columns={[
            { label: 'Key', render: (row) => <span className="mono tiny">{row.key_id}</span> },
            { label: 'Website', render: (row) => <Link to={`/admin/websites/${row.website_id}`}>{row.website_name}</Link> },
            { label: 'Client', render: (row) => row.client_name },
            { label: 'Scopes', render: (row) => <span className="tiny">{row.scopes}</span> },
            { label: 'Last used', render: (row) => row.last_used_at ? fmtDateTime(row.last_used_at) : 'Never' },
            { label: 'Status', render: (row) => <Status status={row.status} /> },
          ]}
        />
      </Panel>

      <div className="grid grid-2 mt-2">
        <Panel title="Webhook endpoints" flush>
          <Table
            rows={data.endpoints}
            empty="No endpoints."
            columns={[
              { label: 'Endpoint', render: (row) => <span className="mono tiny" style={{ wordBreak: 'break-all' }}>{row.url}</span> },
              { label: 'Site', render: (row) => row.website_name },
              { label: 'Events', render: (row) => <span className="tiny">{row.events === '*' ? 'All' : row.events}</span> },
              { label: 'Status', render: (row) => <Status status={row.status} /> },
            ]}
          />
        </Panel>
        <Panel title="Delivery history" flush>
          <Table
            rows={data.deliveries}
            empty="No deliveries."
            columns={[
              { label: 'Event', render: (row) => <span className="mono tiny">{row.event}</span> },
              { label: 'Attempts', num: true, render: (row) => row.attempts },
              { label: 'Result', render: (row) => <Status status={row.status} /> },
              { label: 'When', render: (row) => <Dt value={row.created_at} mode="datetime" /> },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Recent API requests" flush foot="Every authenticated call is logged with status and duration.">
        <Table
          rows={data.logs}
          empty="No requests yet."
          columns={[
            { label: 'When', render: (row) => <span className="tiny">{fmtDateTime(row.created_at)}</span> },
            { label: 'Method', render: (row) => <span className="mono tiny">{row.method}</span> },
            { label: 'Path', render: (row) => <span className="mono tiny">{row.path}</span> },
            { label: 'Site', render: (row) => row.website_name ?? '—' },
            { label: 'Status', num: true, render: (row) => <Badge tone={row.status < 300 ? 'ok' : row.status < 500 ? 'warn' : 'danger'}>{row.status}</Badge> },
            { label: 'Duration', num: true, render: (row) => row.duration_ms ? `${row.duration_ms} ms` : '—' },
          ]}
        />
      </Panel>
    </>
  );
}

export function ApiDocs() {
  const { data, error, loading } = useApi<{ html: string }>('/app/api/api-docs');
  if (loading) return <Loading label="Loading reference…" />;
  if (error) return <Alert>{error}</Alert>;
  return (
    <>
      <PageHead
        eyebrow="System"
        title="API reference"
        sub="The versioned integration API available to client websites."
        actions={<Link className="btn ghost" to="/admin/api">API operations</Link>}
      />
      <Panel>
        <div dangerouslySetInnerHTML={{ __html: data?.html ?? '' }} />
      </Panel>
      <div className="hint mt-2">Reference source: docs/API.md, rendered by the Worker.</div>
    </>
  );
}

export function ActivityPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApi<List>(`/app/api/activity?page=${page}&per_page=50`);
  return (
    <>
      <PageHead eyebrow="System" title="Audit log" sub="Every sign-in, change and revocation recorded server-side." />
      {error ? <Alert>{error}</Alert> : null}
      <Panel flush>
        {loading ? <Loading /> : (
          <Table
            rows={data?.rows ?? []}
            empty="No audit entries."
            columns={[
              { label: 'When', render: (row) => <span className="tiny">{fmtDateTime(row.created_at)}</span> },
              { label: 'Actor', render: (row) => <div><div className="primary-cell">{row.actor_email ?? 'system'}</div><div className="sub-cell">{titleize(row.actor_role ?? 'service')}</div></div> },
              { label: 'Action', render: (row) => <span className="mono tiny">{row.action}</span> },
              { label: 'Entity', render: (row) => row.entity_type ? `${titleize(row.entity_type)} #${row.entity_id ?? '—'}` : '—' },
              { label: 'IP', render: (row) => <span className="mono tiny">{row.ip ?? '—'}</span> },
            ]}
          />
        )}
      </Panel>
      {data && data.pages > 1 ? (
        <div className="row mt-2">
          <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span className="tiny muted">Page {page} of {data.pages}</span>
          <button className="btn ghost sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      ) : null}
    </>
  );
}

export function NotFound() {
  return (
    <Empty
      title="Page not found"
      body="That address does not match a page in the workspace."
      action={<Link className="btn ghost" to="/admin">Back to the dashboard</Link>}
    />
  );
}

// Projects and websites, including monitoring, credentials and webhooks.

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmtDate, fmtDateShort, fmtDateTime, money, relTime, titleize, useApi, type List, type Row } from '../api';
import { useSession } from '../session';
import { FormModal, type Field } from '../forms';
import {
  Alert, Badge, Dt, HealthDot, Icon, KV, Loading, Modal, Money, PageHead, Panel, Progress, StatBand, Status, Table, toast,
} from '../ui';

const PROJECT_STATUSES = ['planning', 'in_progress', 'review', 'awaiting_client', 'launched', 'on_hold', 'completed', 'cancelled'];
const PROJECT_CATEGORIES = ['artist_website', 'business_website', 'ecommerce', 'web_app', 'redesign', 'landing_page', 'maintenance', 'other'];
const WEBSITE_STATUSES = ['in_development', 'staging', 'live', 'maintenance', 'paused', 'archived'];
const SCOPES = ['website:read', 'website:sync', 'events:write', 'deployments:write', 'health:write', 'maintenance:write'];

type Lookups = { clients: Row[]; projects: Row[]; websites: Row[]; staff: Row[] };

function clientOptions(lookups: Lookups | null) {
  return (lookups?.clients ?? []).map((client) => ({ value: String(client.id), label: `${client.name}${client.company ? ` — ${client.company}` : ''}` }));
}

export function Projects() {
  const { session } = useSession();
  const currency = session?.settings.currency ?? 'USD';
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const { data, error, loading } = useApi<List>(`/app/api/projects?q=${encodeURIComponent(q)}&status=${status}`);
  const lookups = useApi<Lookups>('/app/api/lookups');

  const fields: Field[] = [
    { name: 'name', label: 'Project name', required: true, span: 2 },
    { name: 'client_id', label: 'Client', type: 'select', required: true, options: clientOptions(lookups.data) },
    { name: 'category', label: 'Category', type: 'select', options: PROJECT_CATEGORIES.map((c) => ({ value: c, label: titleize(c) })) },
    { name: 'status', label: 'Status', type: 'select', options: PROJECT_STATUSES.map((s) => ({ value: s, label: titleize(s) })) },
    { name: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high', 'urgent'].map((p) => ({ value: p, label: titleize(p) })) },
    { name: 'start_date', label: 'Start date', type: 'date' },
    { name: 'due_date', label: 'Due date', type: 'date' },
    { name: 'budget', label: 'Budget', type: 'money' },
    { name: 'payment_structure', label: 'Payment structure', placeholder: '50% deposit, 50% launch' },
    { name: 'description', label: 'Description', type: 'textarea', span: 2 },
    { name: 'scope', label: 'Scope', type: 'textarea', span: 2 },
    { name: 'portal_visible', label: 'Visible in client portal', type: 'checkbox' },
  ];

  return (
    <>
      <PageHead
        eyebrow="Delivery"
        title="Projects"
        sub="Scope, milestones, budget and delivery dates across the studio."
        actions={<button className="btn accent" onClick={() => setCreating(true)}>New project</button>}
      />
      <div className="filters">
        <input className="input" type="search" placeholder="Search projects or clients" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{titleize(s)}</option>)}
        </select>
        <span className="spacer" />
        <span className="tiny muted">{data?.total ?? 0} projects</span>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <Panel flush>
        {loading ? <Loading /> : (
          <Table
            rows={data?.rows ?? []}
            onRow={(row) => navigate(`/admin/projects/${row.id}`)}
            empty="No projects match these filters."
            columns={[
              {
                label: 'Project',
                render: (row) => (
                  <div>
                    <div className="primary-cell">{row.name}</div>
                    <div className="sub-cell">{row.client_name} · {titleize(row.category)}</div>
                  </div>
                ),
              },
              { label: 'Status', render: (row) => <Status status={row.status} /> },
              {
                label: 'Milestones',
                render: (row) => <div style={{ width: 110 }}><Progress value={Number(row.milestones_done)} total={Number(row.milestones_total)} /></div>,
              },
              { label: 'Budget', num: true, render: (row) => <Money cents={row.budget_cents} currency={currency} /> },
              { label: 'Due', render: (row) => <Dt value={row.due_date} /> },
              { label: 'Open tasks', num: true, render: (row) => row.open_tasks },
            ]}
          />
        )}
      </Panel>
      {creating ? (
        <FormModal
          title="New project"
          fields={fields}
          initial={{ status: 'planning', priority: 'medium', category: 'business_website', portal_visible: true }}
          submitLabel="Create project"
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            const res = await api<{ id: number }>('/app/api/projects', { body: values });
            toast('Project created.');
            navigate(`/admin/projects/${res.id}`);
          }}
        />
      ) : null}
    </>
  );
}

export function ProjectDetail() {
  const { id } = useParams();
  const { session } = useSession();
  const currency = session?.settings.currency ?? 'USD';
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [milestone, setMilestone] = useState(false);
  const [deliverable, setDeliverable] = useState(false);
  const { data, error, loading, reload } = useApi<any>(id ? `/app/api/projects/${id}` : null);
  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;
  const project = data.project;

  const fields: Field[] = [
    { name: 'name', label: 'Project name', required: true, span: 2 },
    { name: 'category', label: 'Category', type: 'select', options: PROJECT_CATEGORIES.map((c) => ({ value: c, label: titleize(c) })) },
    { name: 'status', label: 'Status', type: 'select', options: PROJECT_STATUSES.map((s) => ({ value: s, label: titleize(s) })) },
    { name: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high', 'urgent'].map((p) => ({ value: p, label: titleize(p) })) },
    { name: 'code', label: 'Internal code' },
    { name: 'start_date', label: 'Start date', type: 'date' },
    { name: 'due_date', label: 'Due date', type: 'date' },
    { name: 'budget', label: 'Budget', type: 'money' },
    { name: 'payment_structure', label: 'Payment structure' },
    { name: 'description', label: 'Description', type: 'textarea', span: 2 },
    { name: 'scope', label: 'Scope', type: 'textarea', span: 2 },
    { name: 'portal_visible', label: 'Visible in client portal', type: 'checkbox' },
  ];

  return (
    <>
      <div className="detail-head">
        <div className="grow">
          <div className="eyebrow" style={{ color: 'var(--accent)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 5 }}>Project</div>
          <h1>{project.name}</h1>
          <div className="meta">
            <Status status={project.status} />
            <Link to={`/admin/clients/${project.client_id}`}>{data.client?.name}</Link>
            <span>{titleize(project.category)}</span>
            {project.due_date ? <span>Due {fmtDate(project.due_date)}</span> : null}
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost" onClick={() => setEditing(true)}>Edit</button>
          <Link className="btn ghost" to={`/admin/invoices?new=1&client_id=${project.client_id}&project_id=${project.id}`}>Invoice</Link>
        </div>
      </div>

      <StatBand
        items={[
          { label: 'Budget', value: money(project.budget_cents, currency) },
          { label: 'Milestones', value: `${data.milestones.filter((m: Row) => m.status === 'done').length}/${data.milestones.length}` },
          { label: 'Deliverables', value: String(data.deliverables.length) },
          { label: 'Open tasks', value: String(data.tasks.filter((t: Row) => t.status !== 'done').length) },
          { label: 'Invoiced', value: money(data.invoices.reduce((s: number, i: Row) => s + Number(i.total_cents), 0), currency) },
        ]}
      />

      <div className="grid grid-main">
        <div className="stack" style={{ gap: 16 }}>
          <Panel title="Milestones" right={<button className="btn ghost sm" onClick={() => setMilestone(true)}>Add milestone</button>} flush>
            {data.milestones.length === 0 ? <div className="table-empty">No milestones defined.</div> : (
              <div>
                {data.milestones.map((m: Row) => (
                  <div className="item-row" key={m.id} style={{ padding: '10px 16px' }}>
                    <div className="grow">
                      <div className="t">{m.title}</div>
                      <div className="s">
                        {m.due_date ? `Due ${fmtDateShort(m.due_date)}` : 'No date'}
                        {m.amount_cents ? ` · ${money(m.amount_cents, currency)}` : ''}
                        {m.requires_approval ? ' · needs approval' : ''}
                      </div>
                    </div>
                    <select
                      className="input"
                      style={{ width: 130, height: 28, fontSize: 11.5 }}
                      value={m.status}
                      onChange={async (e) => {
                        await api(`/app/api/milestones/${m.id}`, { method: 'PATCH', body: { status: e.target.value } });
                        toast('Milestone updated.');
                        reload();
                      }}
                    >
                      {['pending', 'in_progress', 'done', 'blocked', 'approved'].map((s) => <option key={s} value={s}>{titleize(s)}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Deliverables" right={<button className="btn ghost sm" onClick={() => setDeliverable(true)}>Add deliverable</button>} flush>
            {data.deliverables.length === 0 ? <div className="table-empty">No deliverables recorded.</div> : (
              <div>
                {data.deliverables.map((d: Row) => (
                  <div className="item-row" key={d.id} style={{ padding: '10px 16px' }}>
                    <div className="grow">
                      <div className="t">{d.title}</div>
                      <div className="s">{d.url ? <a href={d.url} target="_blank" rel="noreferrer">{d.url}</a> : (d.notes ?? 'No link')}</div>
                    </div>
                    <Status status={d.status} />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Tasks" flush>
            {data.tasks.length === 0 ? <div className="table-empty">No tasks for this project.</div> : (
              <div>
                {data.tasks.map((task: Row) => (
                  <div className="list-row" key={task.id}>
                    <div className="grow">
                      <div className="t">{task.title}</div>
                      <div className="s">{task.due_date ? `Due ${fmtDateShort(task.due_date)}` : 'No date'} · {titleize(task.priority)}</div>
                    </div>
                    <Status status={task.status} />
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <Panel title="Details">
            <KV items={[
              ['Client', <Link key="c" to={`/admin/clients/${project.client_id}`}>{data.client?.name}</Link>],
              ['Start', fmtDate(project.start_date)],
              ['Due', fmtDate(project.due_date)],
              ['Priority', titleize(project.priority)],
              ['Payment plan', project.payment_structure ?? '—'],
              ['Portal visible', project.portal_visible ? 'Yes' : 'No'],
              ['Scope', project.scope ?? '—'],
            ]} />
          </Panel>
          <Panel title="Invoices" right={<Link className="link-action" to={`/admin/invoices?client_id=${project.client_id}`}>All</Link>} flush>
            {data.invoices.length === 0 ? <div className="table-empty">No invoices.</div> : data.invoices.map((invoice: Row) => (
              <Link className="list-row" to={`/admin/invoices/${invoice.id}`} key={invoice.id} style={{ textDecoration: 'none' }}>
                <div className="grow"><div className="t mono">{invoice.number}</div><div className="s">{money(invoice.total_cents, currency)}</div></div>
                <Status status={invoice.status} />
              </Link>
            ))}
          </Panel>
          <Panel title="Agreements" flush>
            {data.agreements.length === 0 ? <div className="table-empty">No agreements.</div> : data.agreements.map((agreement: Row) => (
              <Link className="list-row" to={`/admin/agreements/${agreement.id}`} key={agreement.id} style={{ textDecoration: 'none' }}>
                <div className="grow"><div className="t">{agreement.title}</div><div className="s mono">{agreement.number}</div></div>
                <Status status={agreement.status} />
              </Link>
            ))}
          </Panel>
          <Panel title="History" flush>
            {data.activities.length === 0 ? <div className="table-empty">Nothing recorded.</div> : (
              <div style={{ padding: '12px 16px' }}>
                <ul className="timeline">
                  {data.activities.map((item: Row) => (
                    <li key={item.id}>
                      <div className="tl-head"><span className="tl-title">{item.subject}</span><span className="tl-meta">{relTime(item.happened_at)}</span></div>
                      {item.body ? <div className="tl-body">{item.body}</div> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </div>
      </div>

      {editing ? (
        <FormModal
          title="Edit project"
          fields={fields}
          initial={{ ...project, budget: project.budget_cents ? (project.budget_cents / 100).toFixed(2) : '' }}
          onClose={() => setEditing(false)}
          onSubmit={async (values) => {
            await api(`/app/api/projects/${project.id}`, { method: 'PATCH', body: values });
            toast('Project updated.');
            reload();
          }}
        />
      ) : null}

      {milestone ? (
        <FormModal
          title="Add milestone"
          fields={[
            { name: 'title', label: 'Title', required: true, span: 2 },
            { name: 'due_date', label: 'Due date', type: 'date' },
            { name: 'amount', label: 'Amount', type: 'money' },
            { name: 'status', label: 'Status', type: 'select', options: ['pending', 'in_progress', 'done'].map((s) => ({ value: s, label: titleize(s) })) },
            { name: 'requires_approval', label: 'Requires client approval', type: 'checkbox' },
            { name: 'description', label: 'Description', type: 'textarea', span: 2 },
          ]}
          onClose={() => setMilestone(false)}
          onSubmit={async (values) => {
            await api(`/app/api/projects/${project.id}/milestones`, { body: values });
            toast('Milestone added.');
            reload();
          }}
        />
      ) : null}

      {deliverable ? (
        <FormModal
          title="Add deliverable"
          fields={[
            { name: 'title', label: 'Title', required: true, span: 2 },
            { name: 'url', label: 'Link', span: 2 },
            { name: 'status', label: 'Status', type: 'select', options: ['in_progress', 'ready', 'delivered'].map((s) => ({ value: s, label: titleize(s) })) },
            { name: 'portal_visible', label: 'Visible to client', type: 'checkbox' },
            { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
          ]}
          initial={{ portal_visible: true, status: 'in_progress' }}
          onClose={() => setDeliverable(false)}
          onSubmit={async (values) => {
            await api(`/app/api/projects/${project.id}/deliverables`, { body: values });
            toast('Deliverable added.');
            reload();
          }}
        />
      ) : null}
      <div className="mt-3">
        <button className="link-action" onClick={() => navigate('/admin/projects')}>← All projects</button>
      </div>
    </>
  );
}

export function Websites() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const { data, error, loading } = useApi<List>(`/app/api/websites?q=${encodeURIComponent(q)}&status=${status}`);
  const lookups = useApi<Lookups>('/app/api/lookups');

  const fields: Field[] = [
    { name: 'name', label: 'Website name', required: true },
    { name: 'client_id', label: 'Client', type: 'select', required: true, options: clientOptions(lookups.data) },
    { name: 'domain', label: 'Domain', placeholder: 'example.com' },
    { name: 'production_url', label: 'Production URL', placeholder: 'https://example.com' },
    { name: 'project_id', label: 'Project', type: 'select', options: (lookups.data?.projects ?? []).map((p) => ({ value: String(p.id), label: `${p.name} — ${p.client_name}` })) },
    { name: 'status', label: 'Status', type: 'select', options: WEBSITE_STATUSES.map((s) => ({ value: s, label: titleize(s) })) },
    { name: 'stack', label: 'Stack', placeholder: 'React, Vite, Cloudflare' },
    { name: 'hosting_provider', label: 'Hosting' },
    { name: 'deploy_platform', label: 'Deploy platform' },
    { name: 'domain_registrar', label: 'Registrar' },
    { name: 'repo_url', label: 'Repository' },
    { name: 'monitor_interval_minutes', label: 'Check interval (minutes)', type: 'number' },
    { name: 'monitoring_enabled', label: 'Enable availability monitoring', type: 'checkbox' },
    { name: 'portal_visible', label: 'Visible in portal', type: 'checkbox' },
    { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
  ];

  return (
    <>
      <PageHead
        eyebrow="Delivery"
        title="Websites"
        sub="Measured availability, stack, renewals and the integration state of every site."
        actions={<button className="btn accent" onClick={() => setCreating(true)}>Add website</button>}
      />
      <div className="filters">
        <input className="input" type="search" placeholder="Search name, domain or client" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {WEBSITE_STATUSES.map((s) => <option key={s} value={s}>{titleize(s)}</option>)}
        </select>
        <span className="spacer" />
        <span className="tiny muted">{data?.total ?? 0} sites</span>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <Panel flush>
        {loading ? <Loading /> : (
          <Table
            rows={data?.rows ?? []}
            onRow={(row) => navigate(`/admin/websites/${row.id}`)}
            empty="No websites recorded."
            columns={[
              {
                label: 'Site',
                render: (row) => (
                  <div className="row-tight" style={{ gap: 8 }}>
                    <HealthDot status={row.last_health} />
                    <div>
                      <div className="primary-cell">{row.name}</div>
                      <div className="sub-cell">{row.domain ?? '—'}</div>
                    </div>
                  </div>
                ),
              },
              { label: 'Client', render: (row) => row.client_name },
              { label: 'Status', render: (row) => <Status status={row.status} /> },
              {
                label: 'Last check',
                render: (row) => row.last_check_at
                  ? <span className="small">{relTime(row.last_check_at)}{row.last_http_status ? ` · ${row.last_http_status}` : ''}</span>
                  : <span className="muted small">Never</span>,
              },
              { label: 'Integration', render: (row) => <Status status={row.integration_status === 'not_connected' ? 'draft' : row.integration_status} /> },
              { label: 'Renewal', render: (row) => <Dt value={row.domain_renewal_date ?? row.hosting_renewal_date} /> },
            ]}
          />
        )}
      </Panel>
      {creating ? (
        <FormModal
          title="Add website"
          fields={fields}
          initial={{ status: 'in_development', monitoring_enabled: true, portal_visible: true, monitor_interval_minutes: 60 }}
          submitLabel="Add website"
          wide
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            const res = await api<{ id: number }>('/app/api/websites', { body: values });
            toast('Website added.');
            navigate(`/admin/websites/${res.id}`);
          }}
        />
      ) : null}
    </>
  );
}

export function WebsiteDetail() {
  const { id } = useParams();
  const [editing, setEditing] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [credentialOpen, setCredentialOpen] = useState(false);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [secret, setSecret] = useState<{ title: string; value: string; note: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const { data, error, loading, reload } = useApi<any>(id ? `/app/api/websites/${id}` : null);
  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;
  const site = data.website;

  const fields: Field[] = [
    { name: 'name', label: 'Website name', required: true },
    { name: 'domain', label: 'Domain' },
    { name: 'production_url', label: 'Production URL' },
    { name: 'staging_url', label: 'Staging URL' },
    { name: 'status', label: 'Status', type: 'select', options: WEBSITE_STATUSES.map((s) => ({ value: s, label: titleize(s) })) },
    { name: 'category', label: 'Category' },
    { name: 'stack', label: 'Stack' },
    { name: 'hosting_provider', label: 'Hosting' },
    { name: 'domain_registrar', label: 'Registrar' },
    { name: 'deploy_platform', label: 'Deploy platform' },
    { name: 'repo_url', label: 'Repository' },
    { name: 'backend_provider', label: 'Backend' },
    { name: 'db_provider', label: 'Database' },
    { name: 'media_provider', label: 'Media' },
    { name: 'deployed_at', label: 'Deployed', type: 'date' },
    { name: 'domain_renewal_date', label: 'Domain renewal', type: 'date' },
    { name: 'hosting_renewal_date', label: 'Hosting renewal', type: 'date' },
    { name: 'ssl_expires_at', label: 'SSL expiry', type: 'date' },
    { name: 'monitor_interval_minutes', label: 'Check interval (minutes)', type: 'number' },
    { name: 'monitoring_enabled', label: 'Monitoring enabled', type: 'checkbox' },
    { name: 'portal_visible', label: 'Visible in portal', type: 'checkbox' },
    { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
  ];

  const runCheck = async () => {
    setChecking(true);
    try {
      const res = await api<{ result: { ok: boolean; httpStatus: number | null; latencyMs: number | null; error: string | null } }>(
        `/app/api/websites/${site.id}/check`,
        { body: {} },
      );
      toast(
        res.result.httpStatus
          ? `Checked: HTTP ${res.result.httpStatus} in ${res.result.latencyMs} ms.`
          : `Check failed: ${res.result.error ?? 'no response'}`,
        res.result.ok ? 'ok' : 'err',
      );
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Check failed.', 'err');
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <div className="detail-head">
        <div className="grow">
          <div className="eyebrow" style={{ color: 'var(--accent)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 5 }}>Website</div>
          <h1>{site.name}</h1>
          <div className="meta">
            <Status status={site.status} />
            <Link to={`/admin/clients/${site.client_id}`}>{data.client?.name}</Link>
            {site.domain ? <span className="mono">{site.domain}</span> : null}
            <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><HealthDot status={site.last_health} /> {site.last_health ? titleize(site.last_health) : 'Never checked'}</span>
          </div>
        </div>
        <div className="page-actions">
          {site.production_url ? <a className="btn ghost" href={site.production_url} target="_blank" rel="noreferrer">Open site <Icon name="external" size={13} /></a> : null}
          <button className="btn ghost" onClick={() => void runCheck()} disabled={checking}>{checking ? 'Checking…' : 'Run check'}</button>
          <button className="btn ghost" onClick={() => setEditing(true)}>Edit</button>
        </div>
      </div>

      <StatBand
        items={[
          { label: 'HTTP status', value: site.last_http_status ? String(site.last_http_status) : '—' },
          { label: 'Latency', value: site.last_latency_ms ? `${site.last_latency_ms} ms` : '—' },
          { label: 'Checks (40)', value: String(data.checks.length) },
          { label: 'Open requests', value: String(data.requests.filter((r: Row) => !['completed', 'closed', 'rejected'].includes(r.status)).length) },
          { label: 'Credential', value: data.credentials.filter((c: Row) => c.status === 'active').length ? 'Active' : 'None' },
        ]}
      />

      <div className="grid grid-main">
        <div className="stack" style={{ gap: 16 }}>
          <Panel
            title="Availability checks"
            right={<button className="btn ghost sm" onClick={() => void runCheck()} disabled={checking}>Check now</button>}
            flush
            foot="Automated and manual checks are performed by the platform itself. Values reported by a site through the API are stored separately and never shown as measurements."
          >
            {data.checks.length === 0 ? <div className="table-empty">No checks recorded yet.</div> : (
              <Table
                rows={data.checks.slice(0, 20)}
                columns={[
                  { label: 'Checked', render: (row) => fmtDateTime(row.checked_at) },
                  { label: 'Source', render: (row) => <Badge tone={row.source === 'automated' ? 'info' : 'neutral'}>{titleize(row.source)}</Badge> },
                  { label: 'Kind', render: (row) => titleize(row.kind) },
                  { label: 'Result', render: (row) => <Status status={row.status} /> },
                  { label: 'HTTP', num: true, render: (row) => row.http_status ?? '—' },
                  { label: 'Latency', num: true, render: (row) => row.latency_ms ? `${row.latency_ms} ms` : '—' },
                  { label: 'Detail', render: (row) => <span className="tiny muted">{row.detail ?? '—'}</span> },
                ]}
              />
            )}
          </Panel>

          <Panel title="Change history" right={<button className="btn ghost sm" onClick={() => setEventOpen(true)}>Record event</button>} flush>
            {data.events.length === 0 ? <div className="table-empty">No events recorded.</div> : (
              <div style={{ padding: '12px 16px' }}>
                <ul className="timeline">
                  {data.events.slice(0, 15).map((event: Row) => (
                    <li key={event.id} className={event.type === 'monitoring' ? 'warn' : ''}>
                      <div className="tl-head">
                        <span className="tl-title">{event.title}</span>
                        <Badge tone="neutral">{titleize(event.type)}</Badge>
                        <span className="tl-meta">{relTime(event.created_at)}</span>
                      </div>
                      {event.detail ? <div className="tl-body">{event.detail}</div> : null}
                      <div className="tiny muted mt-1">Source: {titleize(event.source)}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>

          <Panel title="Sync activity" flush>
            {data.sync_logs.length === 0 ? <div className="table-empty">The site has not called the API yet.</div> : (
              <Table
                rows={data.sync_logs}
                columns={[
                  { label: 'When', render: (row) => fmtDateTime(row.created_at) },
                  { label: 'Kind', render: (row) => titleize(row.kind) },
                  { label: 'Status', render: (row) => <Status status={row.status} /> },
                  { label: 'Message', render: (row) => <span className="tiny muted">{row.message ?? '—'}</span> },
                ]}
              />
            )}
          </Panel>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <Panel title="Site record">
            <KV items={[
              ['Client', <Link key="c" to={`/admin/clients/${site.client_id}`}>{data.client?.name}</Link>],
              ['Production', site.production_url ? <a href={site.production_url} target="_blank" rel="noreferrer">{site.production_url}</a> : '—'],
              ['Staging', site.staging_url ?? '—'],
              ['Stack', site.stack ?? '—'],
              ['Hosting', site.hosting_provider ?? '—'],
              ['Registrar', site.domain_registrar ?? '—'],
              ['Deploy', site.deploy_platform ?? '—'],
              ['Repository', site.repo_url ? <a href={site.repo_url} target="_blank" rel="noreferrer">Repository</a> : '—'],
              ['Domain renewal', fmtDate(site.domain_renewal_date)],
              ['Hosting renewal', fmtDate(site.hosting_renewal_date)],
              ['SSL expiry', fmtDate(site.ssl_expires_at)],
              ['Monitoring', site.monitoring_enabled ? `Every ${site.monitor_interval_minutes} min` : 'Disabled'],
              ['Last check', site.last_check_at ? fmtDateTime(site.last_check_at) : 'Never'],
            ]} />
          </Panel>

          <Panel title="API credentials" right={<button className="btn ghost sm" onClick={() => setCredentialOpen(true)}>Issue key</button>} flush>
            {data.credentials.length === 0 ? (
              <div className="table-empty">
                No credentials. The site cannot call the integration API until a key is issued.
              </div>
            ) : data.credentials.map((credential: Row) => (
              <div className="list-row" key={credential.id}>
                <div className="grow">
                  <div className="t mono">{credential.key_id}</div>
                  <div className="s">
                    {credential.label} · {credential.scopes}
                    {credential.last_used_at ? ` · used ${relTime(credential.last_used_at)}` : ' · never used'}
                  </div>
                </div>
                <Status status={credential.status} />
                {credential.status === 'active' ? (
                  <button
                    className="link-action link-danger"
                    onClick={async () => {
                      if (!window.confirm('Revoke this credential? Requests using it will start failing immediately.')) return;
                      await api(`/app/api/websites/${site.id}/credentials/${credential.id}`, { method: 'DELETE' });
                      toast('Credential revoked.');
                      reload();
                    }}
                  >
                    Revoke
                  </button>
                ) : null}
              </div>
            ))}
          </Panel>

          <Panel title="Webhooks" right={<button className="btn ghost sm" onClick={() => setWebhookOpen(true)}>Add endpoint</button>} flush>
            {data.webhooks.length === 0 ? <div className="table-empty">No webhook endpoints.</div> : data.webhooks.map((hook: Row) => (
              <div className="list-row" key={hook.id}>
                <div className="grow">
                  <div className="t mono" style={{ fontSize: 11.5 }}>{hook.url}</div>
                  <div className="s">{hook.events === '*' ? 'All events' : hook.events}{hook.last_delivery_at ? ` · last ${relTime(hook.last_delivery_at)}` : ''}{hook.failure_count ? ` · ${hook.failure_count} failures` : ''}</div>
                </div>
                <Status status={hook.status} />
                <button
                  className="link-action link-danger"
                  onClick={async () => {
                    if (!window.confirm('Delete this endpoint? Pending deliveries will stop.')) return;
                    await api(`/app/api/webhooks/${hook.id}`, { method: 'DELETE' });
                    toast('Endpoint deleted.');
                    reload();
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </Panel>

          <Panel title="Recent deliveries" flush>
            {data.deliveries.length === 0 ? <div className="table-empty">No deliveries yet.</div> : data.deliveries.slice(0, 8).map((delivery: Row) => (
              <div className="list-row" key={delivery.id}>
                <div className="grow">
                  <div className="t mono" style={{ fontSize: 11.5 }}>{delivery.event}</div>
                  <div className="s">
                    {delivery.attempts} attempt{delivery.attempts === 1 ? '' : 's'}
                    {delivery.response_status ? ` · HTTP ${delivery.response_status}` : ''}
                    {delivery.last_error ? ` · ${delivery.last_error}` : ''}
                  </div>
                </div>
                <Status status={delivery.status} />
                <button
                  className="link-action"
                  onClick={async () => {
                    await api(`/app/api/webhook-deliveries/${delivery.id}/replay`, { body: {} });
                    toast('Replay queued.');
                    reload();
                  }}
                >
                  Replay
                </button>
              </div>
            ))}
          </Panel>

          <Panel title="Maintenance" right={<Link className="link-action" to="/admin/maintenance">Queue</Link>} flush>
            {data.requests.length === 0 ? <div className="table-empty">No maintenance requests.</div> : data.requests.slice(0, 6).map((request: Row) => (
              <div className="list-row" key={request.id}>
                <div className="grow"><div className="t">{request.title}</div><div className="s">{titleize(request.priority)} · {relTime(request.submitted_at)}</div></div>
                <Status status={request.status} />
              </div>
            ))}
          </Panel>
          <div className="tiny muted">Client {data.client?.company ?? ''} · Website #{site.id}</div>
        </div>
      </div>

      {editing ? (
        <FormModal
          title="Edit website"
          fields={fields}
          initial={site}
          wide
          onClose={() => setEditing(false)}
          onSubmit={async (values) => {
            await api(`/app/api/websites/${site.id}`, { method: 'PATCH', body: values });
            toast('Website updated.');
            reload();
          }}
        />
      ) : null}

      {eventOpen ? (
        <FormModal
          title="Record a website event"
          fields={[
            { name: 'type', label: 'Type', type: 'select', options: ['update', 'content', 'design', 'feature', 'bugfix', 'security', 'performance', 'deployment', 'maintenance'].map((t) => ({ value: t, label: titleize(t) })) },
            { name: 'title', label: 'Title', required: true, span: 2 },
            { name: 'detail', label: 'Detail', type: 'textarea', span: 2 },
          ]}
          onClose={() => setEventOpen(false)}
          onSubmit={async (values) => {
            await api(`/app/api/websites/${site.id}/events`, { body: values });
            toast('Event recorded.');
            reload();
          }}
        />
      ) : null}

      {credentialOpen ? (
        <FormModal
          title="Issue API credential"
          fields={[
            { name: 'label', label: 'Label', placeholder: 'Production integration' },
            {
              name: 'scopes', label: 'Scopes', type: 'select',
              options: SCOPES.map((s) => ({ value: s, label: s })),
              hint: 'Choose one scope at a time; multiple scopes can be added by editing the key later.',
            },
          ]}
          submitLabel="Issue key"
          onClose={() => setCredentialOpen(false)}
          footnote="The secret is shown exactly once. Only its SHA-256 hash is stored."
          onSubmit={async (values) => {
            const res = await api<{ token: string; key_id: string }>(`/app/api/websites/${site.id}/credentials`, {
              body: { label: values.label, scopes: values.scopes },
            });
            setCredentialOpen(false);
            setSecret({
              title: 'API credential created',
              value: res.token,
              note: 'Store this now — it cannot be shown again. Send it as Authorization: Bearer <token>.',
            });
            reload();
          }}
        />
      ) : null}

      {webhookOpen ? (
        <FormModal
          title="Add webhook endpoint"
          fields={[
            { name: 'url', label: 'HTTPS endpoint', required: true, span: 2, placeholder: 'https://example.com/webhooks/anvil' },
            { name: 'events', label: 'Events', placeholder: 'leave blank for all', span: 2, hint: 'Comma separated, e.g. deployment.succeeded, website.health_changed.' },
          ]}
          submitLabel="Add endpoint"
          onClose={() => setWebhookOpen(false)}
          onSubmit={async (values) => {
            const res = await api<{ secret: string }>(`/app/api/websites/${site.id}/webhooks`, { body: values });
            setWebhookOpen(false);
            setSecret({
              title: 'Signing secret',
              value: res.secret,
              note: 'Verify X-Anvil-Signature as t=<timestamp>,v1=HMAC_SHA256(secret, `${t}.${body}`).',
            });
            reload();
          }}
        />
      ) : null}

      {secret ? (
        <Modal
          title={secret.title}
          onClose={() => setSecret(null)}
          footer={<button className="btn accent" onClick={() => setSecret(null)}>I stored it</button>}
        >
          <div className="credential-box">
            <div className="val">{secret.value}</div>
          </div>
          <p className="hint mt-2">{secret.note}</p>
        </Modal>
      ) : null}
    </>
  );
}

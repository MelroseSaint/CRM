// Clients, client detail and the sales pipeline.

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, fmtDate, fmtDateShort, fmtDateTime, money, relTime, titleize, useApi, type List, type Row } from '../api';
import { useSession } from '../session';
import { FormModal, type Field } from '../forms';
import {
  Alert, Badge, Dt, Empty, KV, Loading, Money, PageHead, Panel, StatBand, Status, Table, toast,
} from '../ui';

const CLIENT_STATUSES = ['new_lead', 'contacted', 'proposal_sent', 'onboarding', 'active_client', 'paused', 'former_client'];
const STAGES = [
  'new_inquiry', 'discovery', 'proposal_sent', 'negotiation', 'contract_sent', 'deposit_paid',
  'in_progress', 'review', 'launch', 'retainer', 'converted', 'lost',
];

export function Clients() {
  const { session } = useSession();
  const currency = session?.settings.currency ?? 'USD';
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useApi<List>(`/app/api/clients${`?page=${page}&q=${encodeURIComponent(q)}&status=${status}`}`);

  const fields: Field[] = [
    { name: 'name', label: 'Client name', required: true },
    { name: 'company', label: 'Company' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'phone', label: 'Phone' },
    { name: 'status', label: 'Status', type: 'select', options: CLIENT_STATUSES.map((s) => ({ value: s, label: titleize(s) })) },
    { name: 'category', label: 'Category', placeholder: 'café, artist, e-commerce…' },
    { name: 'lead_source', label: 'Lead source' },
    { name: 'acquired_at', label: 'Client since', type: 'date' },
    { name: 'services_discussed', label: 'Services', span: 2 },
    { name: 'tags', label: 'Tags', placeholder: 'retainer, hospitality', span: 2 },
    { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
  ];

  return (
    <>
      <PageHead
        eyebrow="Relationships"
        title="Clients"
        sub="Every client record with delivery, revenue and portal access in one place."
        actions={<button className="btn accent" onClick={() => setCreating(true)}>New client</button>}
      />
      <div className="filters">
        <input
          className="input"
          type="search"
          placeholder="Search name, company or email"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
        <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          {CLIENT_STATUSES.map((s) => <option key={s} value={s}>{titleize(s)}</option>)}
        </select>
        <span className="spacer" />
        <span className="tiny muted">{data?.total ?? 0} records</span>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <Panel flush>
        {loading ? <Loading /> : (
          <Table
            rows={data?.rows ?? []}
            onRow={(row) => navigate(`/admin/clients/${row.id}`)}
            empty="No clients match these filters."
            columns={[
              {
                label: 'Client',
                render: (row) => (
                  <div>
                    <div className="primary-cell">{row.name}</div>
                    <div className="sub-cell">{row.company ?? row.email ?? '—'}</div>
                  </div>
                ),
              },
              { label: 'Status', render: (row) => <Status status={row.status} /> },
              { label: 'Projects', num: true, render: (row) => row.project_count },
              { label: 'Retainer', num: true, render: (row) => <Money cents={row.mrr_cents} currency={currency} /> },
              {
                label: 'Outstanding',
                num: true,
                render: (row) => Number(row.outstanding_cents) > 0
                  ? <span style={{ color: 'var(--danger)' }}>{money(row.outstanding_cents, currency)}</span>
                  : <span className="muted">—</span>,
              },
              { label: 'Since', render: (row) => <Dt value={row.acquired_at} /> },
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

      {creating ? (
        <FormModal
          title="New client"
          fields={fields}
          submitLabel="Create client"
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            const res = await api<{ id: number }>('/app/api/clients', { body: values });
            toast('Client created.');
            reload();
            navigate(`/admin/clients/${res.id}`);
          }}
        />
      ) : null}
    </>
  );
}

type ClientDetailData = {
  client: Row;
  projects: Row[];
  websites: Row[];
  invoices: Row[];
  agreements: Row[];
  activities: Row[];
  tasks: Row[];
  plans: Row[];
  documents: Row[];
  portal_user: Row | null;
  totals: Row;
};

export function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session } = useSession();
  const currency = session?.settings.currency ?? 'USD';
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);
  const [noting, setNoting] = useState(false);
  const [portalOpen, setPortalOpen] = useState(false);
  const { data, error, loading, reload } = useApi<ClientDetailData>(id ? `/app/api/clients/${id}` : null);
  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;
  const { client, totals } = data;

  const clientFields: Field[] = [
    { name: 'name', label: 'Client name', required: true },
    { name: 'company', label: 'Company' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'phone', label: 'Phone' },
    { name: 'status', label: 'Status', type: 'select', options: CLIENT_STATUSES.map((s) => ({ value: s, label: titleize(s) })) },
    { name: 'preferred_contact', label: 'Preferred contact', type: 'select', options: ['email', 'phone', 'sms'].map((s) => ({ value: s, label: titleize(s) })) },
    { name: 'category', label: 'Category' },
    { name: 'acquired_at', label: 'Client since', type: 'date' },
    { name: 'address', label: 'Address', span: 2 },
    { name: 'services_discussed', label: 'Services', span: 2 },
    { name: 'tags', label: 'Tags', span: 2 },
    { name: 'notes', label: 'Internal notes', type: 'textarea', span: 2, hint: 'Never shown in the client portal.' },
  ];

  return (
    <>
      <div className="detail-head">
        <div className="grow">
          <div className="eyebrow" style={{ color: 'var(--accent)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 5 }}>
            Client record
          </div>
          <h1>{client.name}</h1>
          <div className="meta">
            <Status status={client.status} />
            {client.company ? <span>{client.company}</span> : null}
            {client.email ? <a href={`mailto:${client.email}`}>{client.email}</a> : null}
            {client.phone ? <span>{client.phone}</span> : null}
            <span>Client since {fmtDate(client.acquired_at)}</span>
          </div>
        </div>
        <div className="page-actions">
          <button className="btn ghost" onClick={() => setNoting(true)}>Log interaction</button>
          <button className="btn ghost" onClick={() => setEditing(true)}>Edit</button>
          <Link className="btn accent" to={`/admin/invoices?new=1&client_id=${client.id}`}>New invoice</Link>
        </div>
      </div>

      <StatBand
        items={[
          { label: 'Lifetime collected', value: money(totals?.lifetime_cents, currency), tone: 'ok' },
          { label: 'Outstanding', value: money(totals?.outstanding_cents, currency), tone: Number(totals?.outstanding_cents) > 0 ? 'warn' : undefined },
          { label: 'Retainer / month', value: money(totals?.mrr_cents, currency) },
          { label: 'Projects', value: String(totals?.project_count ?? 0) },
          { label: 'Websites', value: String(data.websites.length) },
        ]}
      />

      <div className="tabs">
        {[
          ['overview', 'Overview'], ['projects', 'Projects'], ['websites', 'Websites'], ['invoices', 'Invoices'],
          ['agreements', 'Agreements'], ['activity', 'History'], ['documents', 'Documents'],
        ].map(([key, label]) => (
          <button key={key} className={`tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="grid grid-2">
          <Panel title="Details">
            <KV items={[
              ['Company', client.company ?? '—'],
              ['Email', client.email ?? '—'],
              ['Phone', client.phone ?? '—'],
              ['Preferred contact', titleize(client.preferred_contact)],
              ['Category', client.category ?? '—'],
              ['Lead source', client.lead_source ?? '—'],
              ['Services', client.services_discussed ?? '—'],
              ['Address', client.address ?? '—'],
              ['Tags', client.tags ? String(client.tags).split(',').map((tag: string) => <span className="tag" key={tag}>{tag.trim()}</span>) : '—'],
              ['Notes', client.notes ?? '—'],
            ]} />
          </Panel>
          <div className="stack" style={{ gap: 16 }}>
            <Panel title="Client portal">
              {data.portal_user ? (
                <>
                  <KV items={[
                    ['Account', data.portal_user.email],
                    ['Name', data.portal_user.name],
                    ['Status', <Status key="status" status={data.portal_user.status} />],
                    ['Last sign-in', data.portal_user.last_login_at ? fmtDateTime(data.portal_user.last_login_at) : 'Never'],
                  ]} />
                  <div className="hint mt-2">Portal users only ever see records marked visible for this client.</div>
                </>
              ) : (
                <Empty
                  title="No portal access"
                  body="Create a client login so this client can follow milestones, invoices and documents."
                  action={<button className="btn ghost sm" onClick={() => setPortalOpen(true)}>Create portal login</button>}
                />
              )}
            </Panel>
            <Panel title="Open tasks" flush>
              {data.tasks.length === 0 ? <div className="table-empty">No open tasks.</div> : data.tasks.map((task) => (
                <div key={task.id} className="list-row">
                  <div className="grow"><div className="t">{task.title}</div><div className="s">{task.due_date ? `Due ${fmtDateShort(task.due_date)}` : 'No date'}</div></div>
                  <Status status={task.status} />
                </div>
              ))}
            </Panel>
            <Panel title="Retainers" flush>
              {data.plans.length === 0 ? <div className="table-empty">No maintenance plans.</div> : data.plans.map((plan) => (
                <div key={plan.id} className="list-row">
                  <div className="grow"><div className="t">{plan.name}</div><div className="s">{plan.next_service_date ? `Next service ${fmtDateShort(plan.next_service_date)}` : 'No scheduled service'}</div></div>
                  <span className="mono small">{money(plan.monthly_cents, currency)}/mo</span>
                  <Status status={plan.status} />
                </div>
              ))}
            </Panel>
          </div>
        </div>
      ) : null}

      {tab === 'projects' ? (
        <Panel flush>
          <Table
            rows={data.projects}
            onRow={(row) => navigate(`/admin/projects/${row.id}`)}
            empty="No projects for this client."
            columns={[
              { label: 'Project', render: (row) => <div><div className="primary-cell">{row.name}</div><div className="sub-cell">{titleize(row.category)}</div></div> },
              { label: 'Status', render: (row) => <Status status={row.status} /> },
              { label: 'Due', render: (row) => <Dt value={row.due_date} /> },
              { label: 'Budget', num: true, render: (row) => <Money cents={row.budget_cents} currency={currency} /> },
            ]}
          />
        </Panel>
      ) : null}

      {tab === 'websites' ? (
        <Panel flush>
          <Table
            rows={data.websites}
            onRow={(row) => navigate(`/admin/websites/${row.id}`)}
            empty="No websites recorded."
            columns={[
              { label: 'Website', render: (row) => <div><div className="primary-cell">{row.name}</div><div className="sub-cell">{row.domain ?? '—'}</div></div> },
              { label: 'Status', render: (row) => <Status status={row.status} /> },
              { label: 'Health', render: (row) => row.last_health ? <Status status={row.last_health} /> : <span className="muted">Not checked</span> },
              { label: 'Last check', render: (row) => row.last_check_at ? relTime(row.last_check_at) : '—' },
              { label: 'API', render: (row) => <Status status={row.integration_status === 'not_connected' ? 'draft' : row.integration_status} /> },
            ]}
          />
        </Panel>
      ) : null}

      {tab === 'invoices' ? (
        <Panel flush>
          <Table
            rows={data.invoices}
            onRow={(row) => navigate(`/admin/invoices/${row.id}`)}
            empty="No invoices yet."
            columns={[
              { label: 'Invoice', render: (row) => <span className="mono">{row.number}</span> },
              { label: 'Issued', render: (row) => <Dt value={row.issue_date} /> },
              { label: 'Due', render: (row) => <Dt value={row.due_date} /> },
              { label: 'Total', num: true, render: (row) => <Money cents={row.total_cents} currency={currency} /> },
              { label: 'Paid', num: true, render: (row) => <Money cents={row.paid_cents} currency={currency} /> },
              { label: 'Status', render: (row) => <Status status={row.status} /> },
            ]}
          />
        </Panel>
      ) : null}

      {tab === 'agreements' ? (
        <Panel flush>
          <Table
            rows={data.agreements}
            onRow={(row) => navigate(`/admin/agreements/${row.id}`)}
            empty="No agreements."
            columns={[
              { label: 'Agreement', render: (row) => <div><div className="primary-cell">{row.title}</div><div className="sub-cell mono">{row.number}</div></div> },
              { label: 'Value', num: true, render: (row) => <Money cents={row.amount_cents} currency={currency} /> },
              { label: 'Accepted', render: (row) => row.accepted_at ? fmtDate(row.accepted_at) : '—' },
              { label: 'Status', render: (row) => <Status status={row.status} /> },
            ]}
          />
        </Panel>
      ) : null}

      {tab === 'activity' ? (
        <Panel title="Communication history" right={<button className="btn ghost sm" onClick={() => setNoting(true)}>Log interaction</button>} flush>
          {data.activities.length === 0 ? (
            <div className="table-empty">No interactions recorded yet. Nothing here is inferred.</div>
          ) : (
            <div style={{ padding: '16px 18px' }}>
              <ul className="timeline">
                {data.activities.map((item) => (
                  <li key={item.id} className={item.visibility === 'client' ? 'accent' : ''}>
                    <div className="tl-head">
                      <span className="tl-title">{item.subject}</span>
                      <Badge tone={item.visibility === 'client' ? 'ok' : 'neutral'}>{item.visibility === 'client' ? 'Client visible' : 'Internal'}</Badge>
                      <span className="tl-meta">{fmtDateTime(item.happened_at)}</span>
                    </div>
                    {item.body ? <div className="tl-body">{item.body}</div> : null}
                    <div className="tiny muted mt-1">{titleize(item.type)}{item.author ? ` · ${item.author}` : ''}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === 'documents' ? (
        <Panel title="Documents" right={<Link className="link-action" to="/admin/documents">Upload</Link>} flush>
          <Table
            rows={data.documents}
            empty="No documents filed for this client."
            columns={[
              { label: 'Name', render: (row) => row.name },
              { label: 'Category', render: (row) => titleize(row.category) },
              { label: 'Visibility', render: (row) => <Badge tone={row.visibility === 'client' ? 'ok' : 'neutral'}>{row.visibility === 'client' ? 'Client' : 'Internal'}</Badge> },
              { label: 'Added', render: (row) => fmtDate(row.created_at) },
              {
                label: '',
                render: (row) => <a className="link-action" href={`/app/api/documents/${row.id}/download`}>Download</a>,
              },
            ]}
          />
        </Panel>
      ) : null}

      {editing ? (
        <FormModal
          title="Edit client"
          fields={clientFields}
          initial={client}
          onClose={() => setEditing(false)}
          onSubmit={async (values) => {
            await api(`/app/api/clients/${client.id}`, { method: 'PATCH', body: values });
            toast('Client updated.');
            reload();
          }}
        />
      ) : null}

      {noting ? (
        <FormModal
          title="Log an interaction"
          fields={[
            { name: 'type', label: 'Type', type: 'select', options: ['email', 'call', 'meeting', 'note', 'proposal', 'support'].map((t) => ({ value: t, label: titleize(t) })) },
            { name: 'happened_at', label: 'When', type: 'datetime' },
            { name: 'subject', label: 'Subject', required: true, span: 2 },
            { name: 'body', label: 'Details', type: 'textarea', span: 2 },
            { name: 'visibility', label: 'Visible to client', type: 'select', options: [{ value: 'internal', label: 'Internal only' }, { value: 'client', label: 'Client visible' }] },
          ]}
          submitLabel="Save entry"
          onClose={() => setNoting(false)}
          footnote="Entries are recorded manually. No message is sent and nothing is inferred from email."
          onSubmit={async (values) => {
            await api(`/app/api/clients/${client.id}/activity`, { body: values });
            toast('Interaction logged.');
            reload();
          }}
        />
      ) : null}

      {portalOpen ? (
        <FormModal
          title="Create portal login"
          fields={[
            { name: 'name', label: 'Display name', placeholder: String(client.name) },
            { name: 'email', label: 'Email', type: 'email', required: true },
            { name: 'password', label: 'Temporary password', type: 'password', required: true, hint: 'At least 10 characters. Share it over a channel you trust.' },
          ]}
          submitLabel="Create login"
          onClose={() => setPortalOpen(false)}
          onSubmit={async (values) => {
            await api(`/app/api/clients/${client.id}/portal`, { body: values });
            toast('Portal login created.');
            reload();
          }}
        />
      ) : null}
    </>
  );
}

export function Pipeline() {
  const { session } = useSession();
  const currency = session?.settings.currency ?? 'USD';
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi<{ rows: Row[]; pipeline: Row[] }>('/app/api/leads?per_page=100');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [moving, setMoving] = useState<number | null>(null);

  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  const leads = data?.rows ?? [];
  const activeStages = STAGES.filter((s) => s !== 'converted' && s !== 'lost');
  const valueFor = (stage: string) => leads.filter((l) => l.stage === stage).reduce((sum, l) => sum + Number(l.est_value_cents ?? 0), 0);
  const weighted = leads
    .filter((l) => !['converted', 'lost'].includes(l.stage))
    .reduce((sum, l) => sum + (Number(l.est_value_cents) * Number(l.probability)) / 100, 0);

  const move = async (lead: Row, stage: string) => {
    setMoving(lead.id);
    try {
      await api(`/app/api/leads/${lead.id}`, { method: 'PATCH', body: { stage } });
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not move the lead.', 'err');
    } finally {
      setMoving(null);
    }
  };

  const leadFields: Field[] = [
    { name: 'name', label: 'Contact name', required: true },
    { name: 'company', label: 'Company' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'phone', label: 'Phone' },
    { name: 'source', label: 'Source', placeholder: 'referral, instagram…' },
    { name: 'stage', label: 'Stage', type: 'select', options: STAGES.map((s) => ({ value: s, label: titleize(s) })) },
    { name: 'est_value', label: 'Estimated value', type: 'money' },
    { name: 'recurring', label: 'Recurring / month', type: 'money' },
    { name: 'probability', label: 'Probability %', type: 'number' },
    { name: 'next_follow_up', label: 'Next follow-up', type: 'date' },
    { name: 'services', label: 'Services discussed', span: 2 },
    { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
  ];

  return (
    <>
      <PageHead
        eyebrow="Sales"
        title="Pipeline"
        sub="Stages, weighted value and follow-up dates for every open opportunity."
        actions={<button className="btn accent" onClick={() => setCreating(true)}>New lead</button>}
      />
      <StatBand
        items={[
          { label: 'Open leads', value: String(leads.filter((l) => !['converted', 'lost'].includes(l.stage)).length) },
          { label: 'Pipeline value', value: money(leads.filter((l) => !['converted', 'lost'].includes(l.stage)).reduce((s, l) => s + Number(l.est_value_cents), 0), currency) },
          { label: 'Weighted', value: money(Math.round(weighted), currency), sub: 'Value × probability' },
          { label: 'Won', value: String(leads.filter((l) => l.stage === 'converted').length) },
          { label: 'Lost', value: String(leads.filter((l) => l.stage === 'lost').length) },
        ]}
      />
      <div className="board">
        {activeStages.map((stage) => {
          const column = leads.filter((l) => l.stage === stage);
          return (
            <div className="col" key={stage}>
              <div className="col-head">
                <span className="name">{titleize(stage)}</span>
                <span className="n">{column.length}</span>
                <span className="val">{valueFor(stage) ? money(valueFor(stage), currency) : ''}</span>
              </div>
              <div className="col-body">
                {column.length === 0 ? <div className="none">No leads</div> : column.map((lead) => (
                  <div className="kcard" key={lead.id}>
                    <button
                      className="t"
                      style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
                      onClick={() => setSelected(lead)}
                    >
                      {lead.name}
                    </button>
                    <div className="m">
                      {lead.company ? <span>{lead.company}</span> : null}
                      <span className="money">{lead.est_value_cents ? money(lead.est_value_cents, currency) : '—'}</span>
                      <Badge tone="neutral">{lead.probability}%</Badge>
                    </div>
                    {lead.next_follow_up ? <div className="tiny muted">Follow up {fmtDateShort(lead.next_follow_up)}</div> : null}
                    <div className="move">
                      <select
                        className="input"
                        value={lead.stage}
                        disabled={moving === lead.id}
                        onChange={(e) => void move(lead, e.target.value)}
                        aria-label={`Move ${lead.name} to another stage`}
                      >
                        {STAGES.map((s) => <option key={s} value={s}>{titleize(s)}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {creating ? (
        <FormModal
          title="New lead"
          fields={leadFields}
          initial={{ stage: 'new_inquiry', probability: 10 }}
          submitLabel="Create lead"
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            await api('/app/api/leads', { body: values });
            toast('Lead created.');
            reload();
          }}
        />
      ) : null}

      {selected ? (
        <FormModal
          title={`Edit ${selected.name}`}
          fields={leadFields}
          initial={selected}
          onClose={() => setSelected(null)}
          footnote="Converting creates a client record from this lead and keeps the original history."
          onSubmit={async (values) => {
            await api(`/app/api/leads/${selected.id}`, { method: 'PATCH', body: values });
            toast('Lead updated.');
            reload();
          }}
        >
          <div className="form-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={async () => {
                try {
                  const res = await api<{ client_id: number }>(`/app/api/leads/${selected.id}/convert`, { body: {} });
                  toast('Lead converted to a client.');
                  setSelected(null);
                  navigate(`/admin/clients/${res.client_id}`);
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Could not convert.', 'err');
                }
              }}
            >
              Convert to client
            </button>
          </div>
        </FormModal>
      ) : null}
    </>
  );
}

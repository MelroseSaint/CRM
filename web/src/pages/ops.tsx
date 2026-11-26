// Maintenance, tasks, calendar and documents.

import { useMemo, useState } from 'react';
import { api, fmtDate, money, titleize, useApi, type List, type Row } from '../api';
import { useSession } from '../session';
import { FormModal, type Field } from '../forms';
import {
  Alert, Badge, Dt, Icon, Loading, Modal, Money, PageHead, Panel, StatBand, Status, Table, toast,
} from '../ui';

type Lookups = { clients: Row[]; projects: Row[]; websites: Row[]; staff: Row[] };

function clientOptions(lookups: Lookups | null) {
  return (lookups?.clients ?? []).map((c) => ({ value: String(c.id), label: `${c.name}${c.company ? ` — ${c.company}` : ''}` }));
}
function websiteOptions(lookups: Lookups | null) {
  return (lookups?.websites ?? []).map((w) => ({ value: String(w.id), label: `${w.name}${w.domain ? ` (${w.domain})` : ''}` }));
}

const REQUEST_STATUSES = ['submitted', 'acknowledged', 'in_progress', 'awaiting_client', 'completed', 'closed', 'rejected'];

export function Maintenance() {
  const { session } = useSession();
  const currency = session?.settings.currency ?? 'USD';
  const [tab, setTab] = useState<'requests' | 'plans'>('requests');
  const [planOpen, setPlanOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const { data, error, loading, reload } = useApi<any>('/app/api/maintenance');
  const lookups = useApi<Lookups>('/app/api/lookups');
  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;

  const planFields: Field[] = [
    { name: 'client_id', label: 'Client', type: 'select', required: true, options: clientOptions(lookups.data) },
    { name: 'website_id', label: 'Website', type: 'select', options: websiteOptions(lookups.data) },
    { name: 'name', label: 'Plan name', required: true, span: 2 },
    { name: 'monthly', label: 'Monthly fee', type: 'money' },
    { name: 'hours_included', label: 'Hours included', type: 'number', step: '0.5' },
    { name: 'start_date', label: 'Start', type: 'date' },
    { name: 'next_service_date', label: 'Next service', type: 'date' },
    { name: 'status', label: 'Status', type: 'select', options: ['active', 'paused', 'ended'].map((s) => ({ value: s, label: titleize(s) })) },
    { name: 'services', label: 'Included services', type: 'textarea', span: 2 },
    { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
  ];

  const requestFields: Field[] = [
    { name: 'client_id', label: 'Client', type: 'select', required: true, options: clientOptions(lookups.data) },
    { name: 'website_id', label: 'Website', type: 'select', options: websiteOptions(lookups.data) },
    { name: 'title', label: 'Request', required: true, span: 2 },
    { name: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high', 'urgent'].map((p) => ({ value: p, label: titleize(p) })) },
    { name: 'target_date', label: 'Target date', type: 'date' },
    { name: 'description', label: 'Details', type: 'textarea', span: 2 },
  ];

  const openRequests = data.requests.filter((r: Row) => !['completed', 'closed', 'rejected'].includes(r.status));

  return (
    <>
      <PageHead
        eyebrow="Operations"
        title="Maintenance"
        sub="Retainers, service dates and client requests — with the source of every request recorded."
        actions={<>
          {tab === 'plans'
            ? <button className="btn accent" onClick={() => setPlanOpen(true)}>New plan</button>
            : <button className="btn accent" onClick={() => setRequestOpen(true)}>New request</button>}
        </>}
      />
      <StatBand
        items={[
          { label: 'Retainer revenue', value: money(data.mrr_cents, currency), tone: 'ok', sub: 'Active plans per month' },
          { label: 'Active plans', value: String(data.plans.filter((p: Row) => p.status === 'active').length) },
          { label: 'Open requests', value: String(openRequests.length), tone: openRequests.length ? 'warn' : undefined },
          { label: 'Urgent', value: String(openRequests.filter((r: Row) => r.priority === 'urgent').length) },
        ]}
      />
      <div className="tabs">
        <button className={`tab${tab === 'requests' ? ' active' : ''}`} onClick={() => setTab('requests')}>Requests <span className="n">{data.requests.length}</span></button>
        <button className={`tab${tab === 'plans' ? ' active' : ''}`} onClick={() => setTab('plans')}>Plans <span className="n">{data.plans.length}</span></button>
      </div>

      {tab === 'requests' ? (
        <Panel flush>
          {data.requests.length === 0 ? <div className="table-empty">No maintenance requests.</div> : (
            <Table
              rows={data.requests}
              columns={[
                {
                  label: 'Request',
                  render: (row) => (
                    <div>
                      <div className="primary-cell">{row.title}</div>
                      <div className="sub-cell">{row.client_name}{row.website_name ? ` · ${row.website_name}` : ''} · {titleize(row.source)}</div>
                    </div>
                  ),
                },
                { label: 'Priority', render: (row) => <Badge tone={row.priority === 'urgent' ? 'danger' : row.priority === 'high' ? 'warn' : 'neutral'}>{titleize(row.priority)}</Badge> },
                { label: 'Submitted', render: (row) => <Dt value={row.submitted_at} /> },
                {
                  label: 'Status',
                  render: (row) => (
                    <select
                      className="input"
                      style={{ height: 28, fontSize: 11.5, width: 150 }}
                      value={row.status}
                      onChange={async (e) => {
                        await api(`/app/api/maintenance/requests/${row.id}`, { method: 'PATCH', body: { status: e.target.value } });
                        toast('Request updated.');
                        reload();
                      }}
                    >
                      {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{titleize(s)}</option>)}
                    </select>
                  ),
                },
              ]}
            />
          )}
        </Panel>
      ) : (
        <Panel flush>
          {data.plans.length === 0 ? <div className="table-empty">No maintenance plans.</div> : (
            <Table
              rows={data.plans}
              columns={[
                { label: 'Plan', render: (row) => <div><div className="primary-cell">{row.name}</div><div className="sub-cell">{row.client_name}{row.website_name ? ` · ${row.website_name}` : ''}</div></div> },
                { label: 'Monthly', num: true, render: (row) => <Money cents={row.monthly_cents} currency={currency} /> },
                { label: 'Hours', num: true, render: (row) => row.hours_included ?? '—' },
                { label: 'Next service', render: (row) => <Dt value={row.next_service_date} /> },
                { label: 'Status', render: (row) => <Status status={row.status} /> },
              ]}
            />
          )}
        </Panel>
      )}

      {planOpen ? (
        <FormModal
          title="New maintenance plan"
          fields={planFields}
          initial={{ status: 'active', start_date: new Date().toISOString().slice(0, 10) }}
          onClose={() => setPlanOpen(false)}
          onSubmit={async (values) => {
            await api('/app/api/maintenance/plans', { body: values });
            toast('Plan created.');
            reload();
          }}
        />
      ) : null}
      {requestOpen ? (
        <FormModal
          title="New maintenance request"
          fields={requestFields}
          initial={{ priority: 'medium' }}
          onClose={() => setRequestOpen(false)}
          onSubmit={async (values) => {
            await api('/app/api/maintenance/requests', { body: values });
            toast('Request created.');
            reload();
          }}
        />
      ) : null}
    </>
  );
}

export function Tasks() {
  const [status, setStatus] = useState('open');
  const [mine, setMine] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const { data, error, loading, reload } = useApi<List>(`/app/api/tasks?status=${status}&mine=${mine ? '1' : '0'}`);
  const lookups = useApi<Lookups>('/app/api/lookups');

  const fields: Field[] = [
    { name: 'title', label: 'Task', required: true, span: 2 },
    { name: 'status', label: 'Status', type: 'select', options: ['open', 'in_progress', 'blocked', 'done'].map((s) => ({ value: s, label: titleize(s) })) },
    { name: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high', 'urgent'].map((p) => ({ value: p, label: titleize(p) })) },
    { name: 'due_date', label: 'Due', type: 'date' },
    { name: 'assignee_id', label: 'Assignee', type: 'select', options: (lookups.data?.staff ?? []).map((s) => ({ value: String(s.id), label: s.name })) },
    { name: 'client_id', label: 'Client', type: 'select', options: clientOptions(lookups.data) },
    { name: 'project_id', label: 'Project', type: 'select', options: (lookups.data?.projects ?? []).map((p) => ({ value: String(p.id), label: p.name })) },
    { name: 'website_id', label: 'Website', type: 'select', options: websiteOptions(lookups.data) },
    { name: 'description', label: 'Description', type: 'textarea', span: 2 },
  ];

  const toggle = async (task: Row) => {
    await api(`/app/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: { status: task.status === 'done' ? 'open' : 'done' },
    });
    reload();
  };

  return (
    <>
      <PageHead
        eyebrow="Operations"
        title="Tasks"
        sub="The work that keeps delivery and maintenance moving."
        actions={<button className="btn accent" onClick={() => setCreating(true)}>New task</button>}
      />
      <div className="filters">
        {[
          ['open', 'Open'], ['', 'All'], ['done', 'Done'],
        ].map(([value, label]) => (
          <button key={label} className={`btn ${status === value ? '' : 'ghost'} sm`} onClick={() => setStatus(value)}>{label}</button>
        ))}
        <label className="check" style={{ marginLeft: 8 }}>
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Assigned to me
        </label>
        <span className="spacer" />
        <span className="tiny muted">{data?.total ?? 0} tasks</span>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <Panel flush>
        {loading ? <Loading /> : (
          <Table
            rows={data?.rows ?? []}
            onRow={(row) => setEditing(row)}
            empty="No tasks match this view."
            columns={[
              {
                label: '',
                width: '34px',
                render: (row) => (
                  <button
                    onClick={(event) => { event.stopPropagation(); void toggle(row); }}
                    aria-label={row.status === 'done' ? 'Reopen task' : 'Complete task'}
                    style={{ background: 'none', border: 0, cursor: 'pointer', color: row.status === 'done' ? 'var(--accent)' : 'var(--line-strong)', padding: 0 }}
                  >
                    <Icon name="check" size={16} />
                  </button>
                ),
              },
              {
                label: 'Task',
                render: (row) => (
                  <div>
                    <div className="primary-cell" style={{ textDecoration: row.status === 'done' ? 'line-through' : 'none' }}>{row.title}</div>
                    <div className="sub-cell">{row.client_name ?? row.project_name ?? 'General'}</div>
                  </div>
                ),
              },
              { label: 'Priority', render: (row) => <Badge tone={row.priority === 'urgent' ? 'danger' : row.priority === 'high' ? 'warn' : 'neutral'}>{titleize(row.priority)}</Badge> },
              { label: 'Due', render: (row) => <Dt value={row.due_date} /> },
              { label: 'Status', render: (row) => <Status status={row.status} /> },
            ]}
          />
        )}
      </Panel>

      {creating ? (
        <FormModal
          title="New task"
          fields={fields}
          initial={{ status: 'open', priority: 'medium' }}
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            await api('/app/api/tasks', { body: values });
            toast('Task created.');
            reload();
          }}
        />
      ) : null}
      {editing ? (
        <FormModal
          title="Edit task"
          fields={fields}
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            await api(`/app/api/tasks/${editing.id}`, { method: 'PATCH', body: values });
            toast('Task updated.');
            reload();
          }}
        />
      ) : null}
    </>
  );
}

export function CalendarPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [creating, setCreating] = useState<string | null>(null);
  const from = `${month}-01`;
  const to = `${month}-31`;
  const { data, error, loading, reload } = useApi<{ events: Row[] }>(`/app/api/calendar?from=${from}&to=${to}`);
  const lookups = useApi<Lookups>('/app/api/lookups');

  const grid = useMemo(() => {
    const first = new Date(`${month}-01T00:00:00Z`);
    const startWeekday = (first.getUTCDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    const cells: { date: string; day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < startWeekday; i++) {
      const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), -startWeekday + i + 1));
      cells.push({ date: d.toISOString().slice(0, 10), day: d.getUTCDate(), inMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ date: `${month}-${String(day).padStart(2, '0')}`, day, inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const last = new Date(`${cells[cells.length - 1].date}T00:00:00Z`);
      last.setUTCDate(last.getUTCDate() + 1);
      cells.push({ date: last.toISOString().slice(0, 10), day: last.getUTCDate(), inMonth: false });
    }
    return cells;
  }, [month]);

  const events = data?.events ?? [];
  const byDate = (date: string) => events.filter((event) => String(event.starts_at).slice(0, 10) === date);
  const today = new Date().toISOString().slice(0, 10);
  const shift = (delta: number) => {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + delta);
    setMonth(d.toISOString().slice(0, 7));
  };
  const title = new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <>
      <PageHead
        eyebrow="Operations"
        title="Calendar"
        sub="Meetings, launches and service dates. Client-visible events are marked in the portal."
        actions={<button className="btn accent" onClick={() => setCreating(today)}>New event</button>}
      />
      <div className="cal-toolbar">
        <button className="btn ghost sm" onClick={() => shift(-1)}>←</button>
        <span className="title">{title}</span>
        <button className="btn ghost sm" onClick={() => shift(1)}>→</button>
        <button className="btn ghost sm" onClick={() => setMonth(today.slice(0, 7))}>Today</button>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {loading ? <Loading /> : (
        <div className="cal-scroll">
        <div className="cal-grid">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((dow) => <div className="cal-dow" key={dow}>{dow}</div>)}
          {grid.map((cell) => {
            const dayEvents = byDate(cell.date);
            return (
              <div
                key={cell.date}
                className={`cal-cell${cell.inMonth ? '' : ' out'}${cell.date === today ? ' today' : ''}`}
                onDoubleClick={() => setCreating(cell.date)}
              >
                <div className="cal-day">
                  <button className="cal-day-btn" onClick={() => setCreating(cell.date)} aria-label={`Add an event on ${cell.date}`}>
                    {cell.day}
                  </button>
                  {dayEvents.length ? <span className="n">{dayEvents.length}</span> : null}
                </div>
                {dayEvents.slice(0, 3).map((event) => (
                  <span
                    className={`cal-item ${event.visibility === 'client' ? 'info' : ''}`}
                    key={event.id}
                    title={`${event.title}${event.client_name ? ` · ${event.client_name}` : ''}`}
                  >
                    {event.title}
                  </span>
                ))}
                {dayEvents.length > 3 ? <span className="cal-more">+{dayEvents.length - 3} more</span> : null}
              </div>
            );
          })}
        </div>
        </div>
      )}
      <div className="hint mt-2">Tap a day number to add an event.</div>

      {creating ? (
        <FormModal
          title="New calendar event"
          fields={[
            { name: 'title', label: 'Title', required: true, span: 2 },
            { name: 'type', label: 'Type', type: 'select', options: ['meeting', 'launch', 'deadline', 'maintenance', 'call'].map((t) => ({ value: t, label: titleize(t) })) },
            { name: 'starts_at', label: 'Starts', type: 'datetime', required: true },
            { name: 'ends_at', label: 'Ends', type: 'datetime' },
            { name: 'client_id', label: 'Client', type: 'select', options: clientOptions(lookups.data) },
            { name: 'project_id', label: 'Project', type: 'select', options: (lookups.data?.projects ?? []).map((p) => ({ value: String(p.id), label: p.name })) },
            { name: 'location', label: 'Location', span: 2 },
            { name: 'visibility', label: 'Visibility', type: 'select', options: [{ value: 'internal', label: 'Internal' }, { value: 'client', label: 'Client visible' }] },
            { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
          ]}
          initial={{ starts_at: `${creating}T09:00`, type: 'meeting', visibility: 'internal' }}
          onClose={() => setCreating(null)}
          onSubmit={async (values) => {
            await api('/app/api/calendar', { body: values });
            toast('Event added.');
            reload();
          }}
        />
      ) : null}
    </>
  );
}

export function Documents() {
  const { data, error, loading, reload } = useApi<{ rows: Row[] }>('/app/api/documents');
  const lookups = useApi<Lookups>('/app/api/lookups');
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState({ client_id: '', category: 'general', visibility: 'internal', name: '' });
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = async () => {
    if (!file) {
      setUploadError('Choose a file first.');
      return;
    }
    setBusy(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.set('file', file);
      if (meta.name) form.set('name', meta.name);
      form.set('category', meta.category);
      form.set('visibility', meta.visibility);
      if (meta.client_id) form.set('client_id', meta.client_id);
      await api('/app/api/documents', { form });
      toast('Document uploaded.');
      setOpen(false);
      setFile(null);
      setMeta({ client_id: '', category: 'general', visibility: 'internal', name: '' });
      reload();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        eyebrow="Operations"
        title="Documents"
        sub="Files stored in R2. Internal documents are never exposed to the client portal."
        actions={<button className="btn accent" onClick={() => setOpen(true)}>Upload document</button>}
      />
      {error ? <Alert>{error}</Alert> : null}
      <Panel flush>
        {loading ? <Loading /> : (
          <Table
            rows={data?.rows ?? []}
            empty="No documents uploaded."
            columns={[
              { label: 'Name', render: (row) => <div><div className="primary-cell">{row.name}</div><div className="sub-cell">{row.client_name ?? 'Unassigned'} · {titleize(row.category)}</div></div> },
              { label: 'Size', num: true, render: (row) => `${Math.max(1, Math.round(Number(row.size_bytes) / 1024))} KB` },
              { label: 'Visibility', render: (row) => <Badge tone={row.visibility === 'client' ? 'ok' : 'neutral'}>{row.visibility === 'client' ? 'Client' : 'Internal'}</Badge> },
              { label: 'Uploaded', render: (row) => <span className="small">{fmtDate(row.created_at)}{row.uploader ? ` · ${row.uploader}` : ''}</span> },
              {
                label: '',
                render: (row) => (
                  <div className="row-tight">
                    <a className="link-action" href={`/app/api/documents/${row.id}/download`}>Download</a>
                    <button
                      className="link-action link-danger"
                      onClick={async () => {
                        if (!window.confirm(`Delete ${row.name}? The stored file is removed too.`)) return;
                        await api(`/app/api/documents/${row.id}`, { method: 'DELETE' });
                        toast('Document deleted.');
                        reload();
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </Panel>

      {open ? (
        <Modal
          title="Upload document"
          onClose={() => setOpen(false)}
          footer={<><button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button><button className="btn accent" onClick={() => void upload()} disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button></>}
        >
          {uploadError ? <div className="flash err">{uploadError}</div> : null}
          <div className="stack">
            <div className="field">
              <label className="lbl" htmlFor="doc-file">File</label>
              <input id="doc-file" className="input" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} style={{ paddingTop: 6 }} />
              <div className="hint">PDF, images, Office files, text, CSV or ZIP. Up to 20 MB.</div>
            </div>
            <div className="field">
              <label className="lbl" htmlFor="doc-name">Display name</label>
              <input id="doc-name" className="input" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder={file?.name ?? 'Defaults to the file name'} />
            </div>
            <div className="field">
              <label className="lbl" htmlFor="doc-client">Client</label>
              <select id="doc-client" className="input" value={meta.client_id} onChange={(e) => setMeta({ ...meta, client_id: e.target.value })}>
                <option value="">Unassigned</option>
                {clientOptions(lookups.data).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="lbl" htmlFor="doc-category">Category</label>
              <select id="doc-category" className="input" value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })}>
                {['general', 'contract', 'invoice', 'brand', 'content', 'handover', 'report'].map((c) => <option key={c} value={c}>{titleize(c)}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="lbl" htmlFor="doc-visibility">Visibility</label>
              <select id="doc-visibility" className="input" value={meta.visibility} onChange={(e) => setMeta({ ...meta, visibility: e.target.value })}>
                <option value="internal">Internal only</option>
                <option value="client">Visible in client portal</option>
              </select>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

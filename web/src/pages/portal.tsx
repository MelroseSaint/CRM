// Client portal: milestones, invoices, documents and support requests.

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, fmtDate, fmtDateShort, money, relTime, titleize, useApi, type Row } from '../api';
import { useSession } from '../session';
import { FormModal } from '../forms';
import {
  Alert, Dt, Icon, KV, Loading, Modal, Money, PageHead, Panel, Progress, StatBand, Status, Table, toast,
} from '../ui';

export function PortalHome() {
  const { session } = useSession();
  const currency = session?.settings.currency ?? 'USD';
  const { data, error, loading, reload } = useApi<any>('/app/api/portal');
  const lookups = useApi<{ websites: Row[] }>('/app/api/portal/lookups');
  const [requestOpen, setRequestOpen] = useState(false);
  const [claim, setClaim] = useState<Row | null>(null);
  const [accepting, setAccepting] = useState<Row | null>(null);
  const [acceptName, setAcceptName] = useState('');
  const [consent, setConsent] = useState(false);
  const [acceptBusy, setAcceptBusy] = useState(false);

  if (loading) return <Loading label="Loading your workspace…" />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;

  const outstanding = Number(data.totals?.outstanding_cents ?? 0);
  const openRequests = data.requests.filter((r: Row) => !['completed', 'closed', 'rejected'].includes(r.status));

  return (
    <>
      <PageHead
        eyebrow="Client portal"
        title={`Hello, ${String(data.client?.name ?? '').split(' ')[0]}`}
        sub={session?.settings.portal_welcome || 'Your projects, invoices and documents in one place.'}
        actions={<button className="btn accent" onClick={() => setRequestOpen(true)}>Request work</button>}
      />

      <StatBand
        items={[
          { label: 'Balance due', value: money(outstanding, currency), tone: outstanding ? 'warn' : 'ok' },
          { label: 'Paid to date', value: money(data.totals?.paid_cents, currency), sub: 'Confirmed payments only' },
          { label: 'Active projects', value: String(data.projects.filter((p: Row) => !['completed', 'cancelled'].includes(p.status)).length) },
          { label: 'Open requests', value: String(openRequests.length) },
          { label: 'Websites', value: String(data.websites.length) },
        ]}
      />

      <div className="grid grid-main">
        <div className="stack" style={{ gap: 16 }}>
          <Panel title="Your projects" flush id="projects">
            {data.projects.length === 0 ? (
              <div className="table-empty">No projects are shared yet.</div>
            ) : data.projects.map((project: Row) => (
              <Link className="list-row" to={`/portal/projects/${project.id}`} key={project.id} style={{ textDecoration: 'none' }}>
                <div className="grow">
                  <div className="t">{project.name}</div>
                  <div className="s">
                    {project.due_date ? `Target ${fmtDateShort(project.due_date)}` : 'Schedule to be confirmed'}
                  </div>
                </div>
                <div style={{ width: 110 }}>
                  <Progress value={Number(project.done)} total={Number(project.total)} />
                </div>
                <Status status={project.status} />
              </Link>
            ))}
          </Panel>

          <Panel title="Invoices" flush id="invoices">
            {data.invoices.length === 0 ? <div className="table-empty">No invoices issued.</div> : (
              <Table
                rows={data.invoices}
                columns={[
                  { label: 'Invoice', render: (row) => <span className="mono">{row.number}</span> },
                  { label: 'Issued', render: (row) => <Dt value={row.issue_date} /> },
                  { label: 'Due', render: (row) => <Dt value={row.due_date} /> },
                  { label: 'Total', num: true, render: (row) => <Money cents={row.total_cents} currency={currency} /> },
                  { label: 'Balance', num: true, render: (row) => <Money cents={Number(row.total_cents) - Number(row.paid_cents)} currency={currency} /> },
                  { label: 'Status', render: (row) => <Status status={row.status} /> },
                  {
                    label: '',
                    render: (row) => ['unpaid', 'partially_paid', 'overdue'].includes(row.status) ? (
                      <button className="link-action" onClick={() => setClaim(row)}>I paid this</button>
                    ) : null,
                  },
                ]}
              />
            )}
            <div className="panel-foot">
              A payment you report here is recorded as a claim and only counts once the studio confirms it.
            </div>
          </Panel>

          <Panel title="Agreements" flush>
            {data.agreements.length === 0 ? <div className="table-empty">No agreements to review.</div> : data.agreements.map((agreement: Row) => (
              <div className="list-row" key={agreement.id}>
                <div className="grow">
                  <div className="t">{agreement.title}</div>
                  <div className="s">
                    {agreement.number} · {money(agreement.amount_cents, currency)}
                    {agreement.accepted_at ? ` · accepted ${fmtDate(agreement.accepted_at)}` : ''}
                  </div>
                </div>
                <Status status={agreement.status} />
                {['sent', 'viewed'].includes(agreement.status) ? (
                  <button className="btn ghost sm" onClick={() => { setAccepting(agreement); setAcceptName(''); setConsent(false); }}>Review & accept</button>
                ) : null}
              </div>
            ))}
          </Panel>

          <Panel title="Documents" flush id="documents">
            {data.documents.length === 0 ? <div className="table-empty">No documents shared with you.</div> : (
              <Table
                rows={data.documents}
                columns={[
                  { label: 'Name', render: (row) => row.name },
                  { label: 'Category', render: (row) => titleize(row.category) },
                  { label: 'Added', render: (row) => fmtDate(row.created_at) },
                  { label: '', render: (row) => <a className="link-action" href={`/app/api/documents/${row.id}/download`}>Download</a> },
                ]}
              />
            )}
          </Panel>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <Panel title="Support" right={<button className="btn ghost sm" onClick={() => setRequestOpen(true)}>Request</button>} flush id="support">
            {data.requests.length === 0 ? <div className="table-empty">No requests yet.</div> : data.requests.slice(0, 8).map((request: Row) => (
              <div className="list-row" key={request.id}>
                <div className="grow">
                  <div className="t">{request.title}</div>
                  <div className="s">{titleize(request.priority)} · {relTime(request.submitted_at)}</div>
                </div>
                <Status status={request.status} />
              </div>
            ))}
          </Panel>

          <Panel title="Your websites" flush>
            {data.websites.length === 0 ? <div className="table-empty">No websites shared.</div> : data.websites.map((site: Row) => (
              <div className="list-row" key={site.id}>
                <div className="grow">
                  <div className="t">{site.name}</div>
                  <div className="s">{site.domain ?? site.production_url ?? '—'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Status status={site.last_health ?? 'unknown'} />
                  <div className="tiny muted">{site.last_check_at ? `checked ${relTime(site.last_check_at)}` : 'not checked'}</div>
                </div>
              </div>
            ))}
          </Panel>

          <Panel title="Maintenance plans" flush>
            {data.plans.length === 0 ? <div className="table-empty">No plan on file.</div> : data.plans.map((plan: Row) => (
              <div className="list-row" key={plan.id}>
                <div className="grow">
                  <div className="t">{plan.name}</div>
                  <div className="s">{money(plan.monthly_cents, currency)}/month{plan.next_service_date ? ` · next ${fmtDateShort(plan.next_service_date)}` : ''}</div>
                </div>
                <Status status={plan.status} />
              </div>
            ))}
          </Panel>

          <Panel title="Project updates" flush>
            {data.activities.length === 0 ? <div className="table-empty">No updates posted.</div> : (
              <div style={{ padding: '12px 16px' }}>
                <ul className="timeline">
                  {data.activities.map((item: Row) => (
                    <li key={item.id} className="accent">
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

      {requestOpen ? (
        <FormModal
          title="Request work"
          fields={[
            { name: 'title', label: 'What do you need?', required: true, span: 2 },
            { name: 'website_id', label: 'Website', type: 'select', options: (lookups.data?.websites ?? []).map((w) => ({ value: String(w.id), label: w.name })) },
            { name: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high', 'urgent'].map((p) => ({ value: p, label: titleize(p) })) },
            { name: 'description', label: 'Details', type: 'textarea', span: 2 },
          ]}
          initial={{ priority: 'medium' }}
          submitLabel="Send request"
          onClose={() => setRequestOpen(false)}
          footnote="Requests are reviewed by the studio; submitting one does not confirm a delivery date."
          onSubmit={async (values) => {
            await api('/app/api/portal/requests', { body: values });
            toast('Request sent.');
            reload();
          }}
        />
      ) : null}

      {claim ? (
        <FormModal
          title={`Report payment for ${claim.number}`}
          fields={[
            { name: 'amount', label: 'Amount paid', type: 'money', required: true },
            { name: 'paid_at', label: 'Paid on', type: 'date' },
            { name: 'method', label: 'Method', type: 'select', options: ['bank_transfer', 'card', 'cash', 'paypal', 'other'].map((m) => ({ value: m, label: titleize(m) })) },
            { name: 'reference', label: 'Reference' },
            { name: 'note', label: 'Note', type: 'textarea', span: 2 },
          ]}
          initial={{ amount: ((Number(claim.total_cents) - Number(claim.paid_cents)) / 100).toFixed(2), method: 'bank_transfer' }}
          submitLabel="Submit claim"
          onClose={() => setClaim(null)}
          footnote="The studio verifies each claim. Until then the invoice balance stays unchanged."
          onSubmit={async (values) => {
            await api(`/app/api/portal/invoices/${claim.id}/claim`, { body: values });
            toast('Claim submitted — the studio will verify it.');
            reload();
          }}
        />
      ) : null}

      {accepting ? (
        <Modal
          title={`Accept “${accepting.title}”`}
          onClose={() => setAccepting(null)}
          footer={(
            <>
              <button className="btn ghost" onClick={() => setAccepting(null)}>Cancel</button>
              <button
                className="btn accent"
                disabled={acceptBusy || !acceptName.trim() || !consent}
                onClick={async () => {
                  setAcceptBusy(true);
                  try {
                    await api(`/app/api/portal/agreements/${accepting.id}/accept`, { body: { name: acceptName, consent } });
                    toast('Agreement accepted.');
                    setAccepting(null);
                    reload();
                  } catch (err) {
                    toast(err instanceof Error ? err.message : 'Could not accept.', 'err');
                  } finally {
                    setAcceptBusy(false);
                  }
                }}
              >
                {acceptBusy ? 'Recording…' : 'Accept agreement'}
              </button>
            </>
          )}
        >
          <p className="small">
            {accepting.number} · {money(accepting.amount_cents, currency)}
          </p>
          <p className="small muted">
            By accepting you confirm the scope, deliverables, payment terms and cancellation terms recorded in this
            agreement. Your name, IP address, the time and a SHA-256 digest of the terms are stored with the record.
          </p>
          <div className="field">
            <label className="lbl" htmlFor="accept-name">Type your full name</label>
            <input id="accept-name" className="input" value={acceptName} onChange={(e) => setAcceptName(e.target.value)} />
          </div>
          <label className="check mt-2">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            I have read and agree to these terms.
          </label>
          <div className="hint mt-2">
            This is a typed-name acceptance record with an audit trail. It is not a qualified electronic signature.
          </div>
        </Modal>
      ) : null}
    </>
  );
}

export function PortalProject() {
  const { id } = useParams();
  const { session } = useSession();
  const currency = session?.settings.currency ?? 'USD';
  const { data, error, loading } = useApi<any>(id ? `/app/api/portal/projects/${id}` : null);
  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;
  const project = data.project;

  return (
    <>
      <PageHead
        eyebrow="Project"
        title={project.name}
        sub={project.description ?? undefined}
        actions={<Link className="btn ghost" to="/portal">← All projects</Link>}
      />
      <StatBand
        items={[
          { label: 'Status', value: <Status status={project.status} /> },
          { label: 'Target', value: fmtDate(project.due_date) },
          { label: 'Milestones', value: `${data.milestones.filter((m: Row) => m.status === 'done').length}/${data.milestones.length}` },
          { label: 'Deliverables', value: String(data.deliverables.length) },
          { label: 'Invoices', value: String(data.invoices.length) },
        ]}
      />
      <div className="grid grid-main">
        <div className="stack" style={{ gap: 16 }}>
          <Panel title="Milestones" flush>
            {data.milestones.length === 0 ? <div className="table-empty">Milestones will appear here once planned.</div> : data.milestones.map((m: Row) => (
              <div className="list-row" key={m.id}>
                <div className="grow">
                  <div className="t">{m.title}</div>
                  <div className="s">
                    {m.due_date ? `Due ${fmtDateShort(m.due_date)}` : 'Schedule to be confirmed'}
                    {m.requires_approval ? ' · needs your approval' : ''}
                  </div>
                </div>
                <Status status={m.status} />
              </div>
            ))}
          </Panel>

          <Panel title="Deliverables" flush>
            {data.deliverables.length === 0 ? <div className="table-empty">No deliverables shared yet.</div> : data.deliverables.map((d: Row) => (
              <div className="list-row" key={d.id}>
                <div className="grow">
                  <div className="t">{d.title}</div>
                  <div className="s">{d.url ? <a href={d.url} target="_blank" rel="noreferrer">Open</a> : (d.notes ?? '—')}</div>
                </div>
                <Status status={d.status} />
              </div>
            ))}
          </Panel>

          <Panel title="Updates" flush>
            {data.activities.length === 0 ? <div className="table-empty">No updates posted.</div> : (
              <div style={{ padding: '12px 16px' }}>
                <ul className="timeline">
                  {data.activities.map((item: Row) => (
                    <li key={item.id} className="accent">
                      <div className="tl-head"><span className="tl-title">{item.subject}</span><span className="tl-meta">{relTime(item.happened_at)}</span></div>
                      {item.body ? <div className="tl-body">{item.body}</div> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <Panel title="Project details">
            <KV items={[
              ['Status', <Status key="s" status={project.status} />],
              ['Started', fmtDate(project.start_date)],
              ['Target', fmtDate(project.due_date)],
              ['Scope', project.scope ?? '—'],
            ]} />
          </Panel>
          <Panel title="Invoices" flush>
            {data.invoices.length === 0 ? <div className="table-empty">No invoices for this project.</div> : data.invoices.map((invoice: Row) => (
              <div className="list-row" key={invoice.id}>
                <div className="grow"><div className="t mono">{invoice.number}</div><div className="s">Due {fmtDate(invoice.due_date)}</div></div>
                <span className="mono small">{money(invoice.total_cents, currency)}</span>
                <Status status={invoice.status} />
              </div>
            ))}
          </Panel>
          <div className="tiny muted">
            <Icon name="lock" size={11} /> Only records shared with your account are visible here.
          </div>
        </div>
      </div>
    </>
  );
}

// Agreements and invoices with payment verification.

import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, fmtDate, fmtDateTime, money, titleize, useApi, useDebounced, type List, type Row } from '../api';
import { useSession } from '../session';
import { FormModal, type Field } from '../forms';
import {
  Alert, Badge, Dt, KV, Loading, Modal, Money, PageHead, Panel, StatBand, Status, Table, toast,
} from '../ui';

const AGREEMENT_STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'cancelled'];
const INVOICE_STATUSES = ['draft', 'unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled'];

type Lookups = { clients: Row[]; projects: Row[] };

function clientOptions(lookups: Lookups | null) {
  return (lookups?.clients ?? []).map((c) => ({ value: String(c.id), label: `${c.name}${c.company ? ` — ${c.company}` : ''}` }));
}

export function Agreements() {
  const { session } = useSession();
  const currency = session?.settings.currency ?? 'USD';
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const { data, error, loading, reload } = useApi<List>(`/app/api/agreements?status=${status}`);
  const lookups = useApi<Lookups>('/app/api/lookups');

  const fields: Field[] = [
    { name: 'title', label: 'Title', required: true, span: 2 },
    { name: 'client_id', label: 'Client', type: 'select', required: true, options: clientOptions(lookups.data) },
    { name: 'project_id', label: 'Project', type: 'select', options: (lookups.data?.projects ?? []).map((p) => ({ value: String(p.id), label: `${p.name} — ${p.client_name}` })) },
    { name: 'kind', label: 'Kind', type: 'select', options: ['development_contract', 'maintenance_agreement', 'change_order', 'nda'].map((k) => ({ value: k, label: titleize(k) })) },
    { name: 'amount', label: 'Contract value', type: 'money' },
    { name: 'deposit', label: 'Deposit', type: 'money' },
    { name: 'revision_limit', label: 'Revision limit', placeholder: '2 rounds' },
    { name: 'timeline', label: 'Timeline', placeholder: '6 weeks from deposit' },
    { name: 'expires_at', label: 'Expires', type: 'date' },
    { name: 'body', label: 'Agreement text', type: 'textarea', span: 2 },
    { name: 'scope', label: 'Scope', type: 'textarea', span: 2 },
    { name: 'deliverables', label: 'Deliverables', type: 'textarea', span: 2 },
    { name: 'maintenance_terms', label: 'Maintenance terms', type: 'textarea', span: 2 },
    { name: 'support_terms', label: 'Support terms', type: 'textarea', span: 2 },
    { name: 'client_responsibilities', label: 'Client responsibilities', type: 'textarea', span: 2 },
    { name: 'cancellation_terms', label: 'Cancellation terms', type: 'textarea', span: 2 },
  ];

  return (
    <>
      <PageHead
        eyebrow="Business"
        title="Agreements"
        sub="Contracts, acceptance records and the exact content hash each client agreed to."
        actions={<button className="btn accent" onClick={() => setCreating(true)}>New agreement</button>}
      />
      <div className="filters">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {AGREEMENT_STATUSES.map((s) => <option key={s} value={s}>{titleize(s)}</option>)}
        </select>
        <span className="spacer" />
        <span className="tiny muted">{data?.total ?? 0} agreements</span>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <Panel flush>
        {loading ? <Loading /> : (
          <Table
            rows={data?.rows ?? []}
            onRow={(row) => navigate(`/admin/agreements/${row.id}`)}
            empty="No agreements yet."
            columns={[
              { label: 'Agreement', render: (row) => <div><div className="primary-cell">{row.title}</div><div className="sub-cell mono">{row.number}</div></div> },
              { label: 'Client', render: (row) => row.client_name },
              { label: 'Kind', render: (row) => titleize(row.kind) },
              { label: 'Value', num: true, render: (row) => <Money cents={row.amount_cents} currency={currency} /> },
              { label: 'Created', render: (row) => <Dt value={row.created_at} /> },
              { label: 'Accepted', render: (row) => row.accepted_at ? <span className="small">{fmtDate(row.accepted_at)}</span> : <span className="muted small">—</span> },
              { label: 'Status', render: (row) => <Status status={row.status} /> },
            ]}
          />
        )}
      </Panel>
      {creating ? (
        <FormModal
          title="New agreement"
          fields={fields}
          wide
          initial={{ kind: 'development_contract' }}
          submitLabel="Create draft"
          onClose={() => setCreating(false)}
          onSubmit={async (values) => {
            const res = await api<{ id: number }>('/app/api/agreements', { body: values });
            toast('Draft created.');
            reload();
            navigate(`/admin/agreements/${res.id}`);
          }}
        />
      ) : null}
    </>
  );
}

export function AgreementDetail() {
  const { id } = useParams();
  const { session } = useSession();
  const currency = session?.settings.currency ?? 'USD';
  const [editing, setEditing] = useState(false);
  const { data, error, loading, reload } = useApi<any>(id ? `/app/api/agreements/${id}` : null);
  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;
  const agreement = data.agreement;

  const fields: Field[] = [
    { name: 'title', label: 'Title', required: true, span: 2 },
    { name: 'kind', label: 'Kind', type: 'select', options: ['development_contract', 'maintenance_agreement', 'change_order', 'nda'].map((k) => ({ value: k, label: titleize(k) })) },
    { name: 'amount', label: 'Contract value', type: 'money' },
    { name: 'deposit', label: 'Deposit', type: 'money' },
    { name: 'revision_limit', label: 'Revision limit' },
    { name: 'timeline', label: 'Timeline' },
    { name: 'expires_at', label: 'Expires', type: 'date' },
    { name: 'body', label: 'Agreement text', type: 'textarea', span: 2 },
    { name: 'scope', label: 'Scope', type: 'textarea', span: 2 },
    { name: 'deliverables', label: 'Deliverables', type: 'textarea', span: 2 },
    { name: 'maintenance_terms', label: 'Maintenance terms', type: 'textarea', span: 2 },
    { name: 'support_terms', label: 'Support terms', type: 'textarea', span: 2 },
    { name: 'client_responsibilities', label: 'Client responsibilities', type: 'textarea', span: 2 },
    { name: 'cancellation_terms', label: 'Cancellation terms', type: 'textarea', span: 2 },
    { name: 'extra_conditions', label: 'Extra conditions', type: 'textarea', span: 2 },
  ];

  return (
    <>
      <div className="detail-head">
        <div className="grow">
          <div className="eyebrow" style={{ color: 'var(--accent)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 5 }}>Agreement</div>
          <h1>{agreement.title}</h1>
          <div className="meta">
            <Status status={agreement.status} />
            <span className="mono">{agreement.number}</span>
            <Link to={`/admin/clients/${agreement.client_id}`}>{data.client?.name}</Link>
            <span>{titleize(agreement.kind)}</span>
          </div>
        </div>
        <div className="page-actions">
          {['draft', 'sent'].includes(agreement.status) ? (
            <button
              className="btn accent"
              onClick={async () => {
                await api(`/app/api/agreements/${agreement.id}/send`, { body: {} });
                toast('Marked as sent. The client can now accept it in the portal.');
                reload();
              }}
            >
              Mark as sent
            </button>
          ) : null}
          {!agreement.accepted_at ? <button className="btn ghost" onClick={() => setEditing(true)}>Edit</button> : null}
        </div>
      </div>

      <StatBand
        items={[
          { label: 'Contract value', value: money(agreement.amount_cents, currency) },
          { label: 'Deposit', value: money(agreement.deposit_cents, currency) },
          { label: 'Timeline', value: agreement.timeline ?? '—' },
          { label: 'Revisions', value: agreement.revision_limit ?? '—' },
          { label: 'Expires', value: fmtDate(agreement.expires_at) },
        ]}
      />

      <div className="grid grid-detail">
        <Panel title="Terms">
          {agreement.body ? <p style={{ whiteSpace: 'pre-wrap' }}>{agreement.body}</p> : <p className="muted">No agreement text yet.</p>}
          {[
            ['Scope', agreement.scope], ['Deliverables', agreement.deliverables],
            ['Maintenance', agreement.maintenance_terms], ['Support', agreement.support_terms],
            ['Client responsibilities', agreement.client_responsibilities],
            ['Cancellation', agreement.cancellation_terms], ['Extra conditions', agreement.extra_conditions],
          ].filter(([, value]) => value).map(([label, value]) => (
            <div key={String(label)} className="mt-2">
              <div className="fieldset-title">{label}</div>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{value}</p>
            </div>
          ))}
        </Panel>

        <div className="stack" style={{ gap: 16 }}>
          <Panel title="Acceptance record">
            {agreement.accepted_at ? (
              <>
                <KV items={[
                  ['Accepted by', agreement.accepted_by ?? '—'],
                  ['Accepted at', fmtDateTime(agreement.accepted_at)],
                  ['IP address', <span className="mono tiny" key="ip">{agreement.accepted_ip ?? '—'}</span>],
                  ['Content hash', <span className="mono tiny" style={{ wordBreak: 'break-all' }} key="hash">{agreement.accepted_hash ?? '—'}</span>],
                ]} />
                <div className="callout info mt-2">
                  Recorded as typed-name acceptance with the signer's IP and a SHA-256 digest of the exact terms.
                  This is an audit record, not a qualified electronic signature.
                </div>
              </>
            ) : (
              <div className="muted small">
                Not accepted. Sending marks the agreement available in the client portal, where the client can
                accept it by typing their name; that action records name, IP, timestamp and content hash.
              </div>
            )}
          </Panel>
          <Panel title="Lifecycle">
            <KV items={[
              ['Created', fmtDateTime(agreement.created_at)],
              ['Sent', agreement.sent_at ? fmtDateTime(agreement.sent_at) : '—'],
              ['Viewed', agreement.viewed_at ? fmtDateTime(agreement.viewed_at) : '—'],
              ['Declined', agreement.declined_at ? fmtDateTime(agreement.declined_at) : '—'],
              ['Portal visible', agreement.portal_visible ? 'Yes' : 'No'],
              ['Project', data.project ? <Link key="p" to={`/admin/projects/${data.project.id}`}>{data.project.name}</Link> : '—'],
            ]} />
          </Panel>
        </div>
      </div>

      {editing ? (
        <FormModal
          title="Edit agreement"
          fields={fields}
          initial={{
            ...agreement,
            amount: agreement.amount_cents ? (agreement.amount_cents / 100).toFixed(2) : '',
            deposit: agreement.deposit_cents ? (agreement.deposit_cents / 100).toFixed(2) : '',
          }}
          wide
          onClose={() => setEditing(false)}
          onSubmit={async (values) => {
            await api(`/app/api/agreements/${agreement.id}`, { method: 'PATCH', body: values });
            toast('Agreement updated.');
            reload();
          }}
        />
      ) : null}
      <div className="mt-3"><Link className="link-action" to="/admin/agreements">← All agreements</Link></div>
    </>
  );
}

export function Invoices() {
  const { session } = useSession();
  const currency = session?.settings.currency ?? 'USD';
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(params.get('new') === '1');
  const debouncedQ = useDebounced(q);
  const { data, error, loading, reload } = useApi<{ totals: Row } & List>(`/app/api/invoices?q=${encodeURIComponent(debouncedQ)}&status=${status}`);
  const lookups = useApi<Lookups>('/app/api/lookups');
  const [created, setCreated] = useState<number | null>(null);

  const fields: Field[] = [
    { name: 'client_id', label: 'Client', type: 'select', required: true, options: clientOptions(lookups.data) },
    { name: 'project_id', label: 'Project', type: 'select', options: (lookups.data?.projects ?? []).map((p) => ({ value: String(p.id), label: `${p.name} — ${p.client_name}` })) },
    { name: 'kind', label: 'Kind', type: 'select', options: ['development', 'maintenance', 'deposit', 'change_order', 'hosting'].map((k) => ({ value: k, label: titleize(k) })) },
    { name: 'discount', label: 'Discount', type: 'money' },
    { name: 'description', label: 'Description', span: 2 },
    { name: 'notes', label: 'Notes for the client', type: 'textarea', span: 2 },
  ];

  return (
    <>
      <PageHead
        eyebrow="Business"
        title="Invoices"
        sub="Issued, collected and outstanding money — collected only ever counts confirmed payments."
        actions={<button className="btn accent" onClick={() => setCreating(true)}>New invoice</button>}
      />
      <StatBand
        items={[
          { label: 'Invoiced (all issued)', value: money(data?.totals?.invoiced_cents, currency) },
          { label: 'Collected', value: money(data?.totals?.collected_cents, currency), tone: 'ok' },
          { label: 'Outstanding', value: money(data?.totals?.outstanding_cents, currency), tone: Number(data?.totals?.outstanding_cents) > 0 ? 'warn' : undefined },
        ]}
      />
      <div className="filters">
        <input className="input" type="search" placeholder="Search number or client" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{titleize(s)}</option>)}
        </select>
        <span className="spacer" />
        <span className="tiny muted">{data?.total ?? 0} invoices</span>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <Panel flush>
        {loading ? <Loading /> : (
          <Table
            rows={data?.rows ?? []}
            onRow={(row) => navigate(`/admin/invoices/${row.id}`)}
            empty="No invoices yet."
            columns={[
              { label: 'Invoice', render: (row) => <div><div className="primary-cell mono">{row.number}</div><div className="sub-cell">{row.description ?? titleize(row.kind)}</div></div> },
              { label: 'Client', render: (row) => row.client_name },
              { label: 'Issued', render: (row) => <Dt value={row.issue_date} /> },
              { label: 'Due', render: (row) => <Dt value={row.due_date} /> },
              { label: 'Total', num: true, render: (row) => <Money cents={row.total_cents} currency={currency} /> },
              { label: 'Paid', num: true, render: (row) => <Money cents={row.paid_cents} currency={currency} /> },
              { label: 'Status', render: (row) => <Status status={row.status} /> },
            ]}
          />
        )}
      </Panel>

      {creating ? (
        <FormModal
          title="New invoice"
          fields={fields}
          initial={{ client_id: params.get('client_id') ?? '', project_id: params.get('project_id') ?? '', kind: 'development' }}
          submitLabel="Create draft"
          onClose={() => setCreating(false)}
          footnote="Line items are added on the invoice. Nothing is sent or charged automatically."
          onSubmit={async (values) => {
            const res = await api<{ id: number; number: string }>('/app/api/invoices', { body: values });
            toast(`Draft ${res.number} created.`);
            setCreated(res.id);
            reload();
            navigate(`/admin/invoices/${res.id}`);
          }}
        >
          {created ? <div className="hint">Created invoice #{created}.</div> : null}
        </FormModal>
      ) : null}
    </>
  );
}

export function InvoiceDetail() {
  const { id } = useParams();
  const { session } = useSession();
  const currency = session?.settings.currency ?? 'USD';
  const [itemOpen, setItemOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const { data, error, loading, reload } = useApi<any>(id ? `/app/api/invoices/${id}` : null);
  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;
  const invoice = data.invoice;
  const pending = data.payments.filter((p: Row) => p.status === 'pending');

  return (
    <>
      <div className="detail-head">
        <div className="grow">
          <div className="eyebrow" style={{ color: 'var(--accent)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', marginBottom: 5 }}>Invoice</div>
          <h1 className="mono" style={{ fontFamily: 'var(--mono)', fontSize: 24 }}>{invoice.number}</h1>
          <div className="meta">
            <Status status={invoice.status} />
            <Link to={`/admin/clients/${invoice.client_id}`}>{data.client?.name}</Link>
            <span>Issued {fmtDate(invoice.issue_date)}</span>
            <span>Due {fmtDate(invoice.due_date)}</span>
          </div>
        </div>
        <div className="page-actions">
          {['draft', 'unpaid'].includes(invoice.status) ? (
            <button
              className="btn ghost"
              onClick={async () => {
                await api(`/app/api/invoices/${invoice.id}/send`, { body: {} });
                toast('Invoice issued.');
                reload();
              }}
            >
              {invoice.status === 'draft' ? 'Issue invoice' : 'Resend'}
            </button>
          ) : null}
          {invoice.status !== 'paid' ? <button className="btn ghost" onClick={() => setEditing(true)}>Edit</button> : null}
          <button className="btn accent" onClick={() => setPaymentOpen(true)}>Record payment</button>
        </div>
      </div>

      <StatBand
        items={[
          { label: 'Total', value: money(invoice.total_cents, currency) },
          { label: 'Paid (confirmed)', value: money(invoice.paid_cents, currency), tone: 'ok' },
          { label: 'Balance', value: money(invoice.total_cents - invoice.paid_cents, currency), tone: invoice.total_cents - invoice.paid_cents > 0 ? 'warn' : 'ok' },
          { label: 'Tax', value: money(invoice.tax_cents, currency) },
          { label: 'Pending claims', value: String(pending.length), tone: pending.length ? 'warn' : undefined },
        ]}
      />

      {pending.length ? (
        <div className="flash warn">
          {pending.length} payment {pending.length === 1 ? 'claim is' : 'claims are'} awaiting verification. They are shown
          below but do not count as money received until confirmed.
        </div>
      ) : null}

      <div className="grid grid-detail">
        <div className="stack" style={{ gap: 16 }}>
          <Panel title="Line items" right={<button className="btn ghost sm" onClick={() => setItemOpen(true)}>Add line</button>} flush>
            {data.items.length === 0 ? <div className="table-empty">No line items.</div> : (
              <Table
                rows={data.items}
                columns={[
                  { label: 'Description', render: (row) => row.description },
                  { label: 'Qty', num: true, render: (row) => row.qty },
                  { label: 'Unit', num: true, render: (row) => <Money cents={row.unit_price_cents} currency={currency} /> },
                  { label: 'Amount', num: true, render: (row) => <Money cents={row.amount_cents} currency={currency} /> },
                  {
                    label: '',
                    render: (row) => (
                      <button
                        className="link-action link-danger"
                        onClick={async () => {
                          await api(`/app/api/invoice-items/${row.id}`, { method: 'DELETE' });
                          toast('Line removed.');
                          reload();
                        }}
                      >
                        Remove
                      </button>
                    ),
                  },
                ]}
              />
            )}
            <div className="panel-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 18 }}>
              <span className="small muted">Subtotal {money(invoice.subtotal_cents, currency)}</span>
              <span className="small muted">Tax {money(invoice.tax_cents, currency)}</span>
              <span className="small"><strong>Total {money(invoice.total_cents, currency)}</strong></span>
            </div>
          </Panel>

          <Panel title="Payments" flush foot="Only confirmed payments reduce the balance. A client claim stays pending until verified here.">
            {data.payments.length === 0 ? <div className="table-empty">No payments recorded.</div> : (
              <Table
                rows={data.payments}
                columns={[
                  { label: 'Date', render: (row) => <Dt value={row.paid_at} /> },
                  { label: 'Amount', num: true, render: (row) => <Money cents={row.amount_cents} currency={currency} /> },
                  { label: 'Method', render: (row) => titleize(row.method) },
                  { label: 'Reference', render: (row) => <span className="tiny mono">{row.reference ?? '—'}</span> },
                  { label: 'Source', render: (row) => <Badge tone={row.source === 'portal' ? 'info' : 'neutral'}>{row.source === 'portal' ? 'Client claim' : 'Recorded'}</Badge> },
                  { label: 'Status', render: (row) => <Status status={row.status} /> },
                  {
                    label: '',
                    render: (row) => row.status === 'pending' ? (
                      <button
                        className="link-action"
                        onClick={async () => {
                          await api(`/app/api/payments/${row.id}/confirm`, { body: {} });
                          toast('Payment confirmed.');
                          reload();
                        }}
                      >
                        Confirm
                      </button>
                    ) : null,
                  },
                ]}
              />
            )}
          </Panel>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <Panel title="Invoice detail">
            <KV items={[
              ['Client', <Link key="c" to={`/admin/clients/${invoice.client_id}`}>{data.client?.name}</Link>],
              ['Project', data.project ? <Link key="p" to={`/admin/projects/${data.project.id}`}>{data.project.name}</Link> : '—'],
              ['Kind', titleize(invoice.kind)],
              ['Description', invoice.description ?? '—'],
              ['Discount', money(invoice.discount_cents, currency)],
              ['Notes', invoice.notes ?? '—'],
              ['Portal visible', invoice.portal_visible ? 'Yes' : 'No'],
            ]} />
          </Panel>
          <Panel title="Billing address">
            <div className="small" style={{ whiteSpace: 'pre-wrap' }}>
              {data.client?.company ?? data.client?.name}
              {'\n'}{data.client?.address ?? 'No address on file'}
              {'\n'}{data.client?.email ?? ''}
            </div>
          </Panel>
        </div>
      </div>

      {itemOpen ? (
        <FormModal
          title="Add line item"
          fields={[
            { name: 'description', label: 'Description', required: true, span: 2 },
            { name: 'qty', label: 'Quantity', type: 'number', step: '0.01' },
            { name: 'unit_price', label: 'Unit price', type: 'money' },
          ]}
          initial={{ qty: 1 }}
          onClose={() => setItemOpen(false)}
          onSubmit={async (values) => {
            await api(`/app/api/invoices/${invoice.id}/items`, { body: values });
            toast('Line added.');
            reload();
          }}
        />
      ) : null}

      {paymentOpen ? (
        <FormModal
          title="Record payment"
          fields={[
            { name: 'amount', label: 'Amount', type: 'money', required: true },
            { name: 'paid_at', label: 'Paid on', type: 'date' },
            { name: 'method', label: 'Method', type: 'select', options: ['bank_transfer', 'card', 'cash', 'paypal', 'stripe', 'other'].map((m) => ({ value: m, label: titleize(m) })) },
            { name: 'reference', label: 'Reference' },
            { name: 'status', label: 'Status', type: 'select', options: [{ value: 'confirmed', label: 'Confirmed (money received)' }, { value: 'pending', label: 'Pending (claim only)' }] },
            { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
          ]}
          initial={{ method: 'bank_transfer', status: 'confirmed', amount: ((invoice.total_cents - invoice.paid_cents) / 100).toFixed(2) }}
          submitLabel="Save payment"
          onClose={() => setPaymentOpen(false)}
          footnote="Confirm only money you have actually received. Pending entries are claims and do not change the balance."
          onSubmit={async (values) => {
            await api(`/app/api/invoices/${invoice.id}/payments`, { body: values });
            toast('Payment saved.');
            reload();
          }}
        />
      ) : null}

      {editing ? (
        <FormModal
          title="Edit invoice"
          fields={[
            { name: 'status', label: 'Status', type: 'select', options: INVOICE_STATUSES.map((s) => ({ value: s, label: titleize(s) })) },
            { name: 'discount', label: 'Discount', type: 'money' },
            { name: 'issue_date', label: 'Issue date', type: 'date' },
            { name: 'due_date', label: 'Due date', type: 'date' },
            { name: 'description', label: 'Description', span: 2 },
            { name: 'notes', label: 'Notes', type: 'textarea', span: 2 },
          ]}
          initial={{ ...invoice, discount: invoice.discount_cents ? (invoice.discount_cents / 100).toFixed(2) : '' }}
          onClose={() => setEditing(false)}
          onSubmit={async (values) => {
            await api(`/app/api/invoices/${invoice.id}`, { method: 'PATCH', body: values });
            toast('Invoice updated.');
            reload();
          }}
        />
      ) : null}
      <div className="mt-3"><Link className="link-action" to="/admin/invoices">← All invoices</Link></div>
    </>
  );
}

export function InvoicePaymentsSummary({ payments, currency }: { payments: Row[]; currency: string }) {
  const confirmed = payments.filter((p) => p.status === 'confirmed').reduce((s, p) => s + Number(p.amount_cents), 0);
  const claimed = payments.filter((p) => p.status === 'pending').reduce((s, p) => s + Number(p.amount_cents), 0);
  return (
    <Modal title="Payments" onClose={() => {}}>
      <p>Confirmed {money(confirmed, currency)} · Pending {money(claimed, currency)}</p>
    </Modal>
  );
}

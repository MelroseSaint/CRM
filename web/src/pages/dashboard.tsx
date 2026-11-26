// Studio overview: real aggregates only, no decorative counters.

import { Link } from 'react-router-dom';
import { fmtDateShort, money, relTime, titleize, useApi } from '../api';
import { useSession } from '../session';
import { Alert, Badge, Dt, Empty, HealthDot, Icon, Loading, PageHead, Panel, Progress, StatBand, Status } from '../ui';

type DashboardData = {
  kpis: Record<string, number> & { health: Record<string, number> };
  revenue: { month: string; invoiced: number; collected: number }[];
  pipeline: { stage: string; count: number; value: number; weighted: number }[];
  renewals: { kind: string; id: number; label: string; date: string }[];
  invoices: any[];
  tasks: any[];
  activity: any[];
  projects: any[];
};

export function Dashboard() {
  const { session } = useSession();
  const currency = session?.settings.currency ?? 'USD';
  const { data, error, loading } = useApi<DashboardData>('/app/api/dashboard');

  if (loading) return <Loading label="Building the overview…" />;
  if (error) return <Alert>{error}</Alert>;
  if (!data) return null;
  const { kpis, revenue, pipeline, renewals, invoices, tasks, activity, projects } = data;
  const max = Math.max(1, ...revenue.flatMap((row) => [row.invoiced, row.collected]));
  const healthTotal = Object.values(kpis.health ?? {}).reduce((sum, n) => sum + Number(n), 0);
  const pipelineTotal = pipeline.reduce((sum, row) => sum + row.count, 0);

  return (
    <>
      <PageHead
        eyebrow={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        title="Studio overview"
        sub="Collected money, delivery pressure and site health across every client."
        actions={<>
          <Link className="btn ghost" to="/admin/invoices">Invoices</Link>
          <Link className="btn accent" to="/admin/clients"><Icon name="plus" size={14} /> New client</Link>
        </>}
      />

      <StatBand
        items={[
          { label: 'Collected this month', value: money(kpis.collected_month_cents, currency), tone: 'ok', sub: 'Only confirmed payments' },
          { label: 'Outstanding', value: money(kpis.outstanding_cents, currency), tone: kpis.overdue_invoices ? 'danger' : undefined, sub: `${kpis.overdue_invoices} overdue invoice${kpis.overdue_invoices === 1 ? '' : 's'}` },
          { label: 'Retainers / month', value: money(kpis.mrr_cents, currency), sub: 'Active maintenance plans' },
          { label: 'Weighted pipeline', value: money(kpis.weighted_pipeline_cents, currency), sub: `${money(kpis.pipeline_value_cents, currency)} across ${kpis.open_leads} leads` },
          { label: 'Active projects', value: String(kpis.active_projects), sub: `${kpis.open_requests} open maintenance requests` },
        ]}
      />

      <div className="grid grid-main">
        <div className="stack" style={{ gap: 16 }}>
          <Panel
            title="Invoiced against collected"
            right={<span className="legend"><span><i style={{ background: '#cddfd8' }} />Invoiced</span><span><i style={{ background: 'var(--accent)' }} />Collected</span></span>}
            foot="Collected counts confirmed payments by paid date; invoiced counts issued invoices by issue date."
          >
            <div className="rev-chart">
              {revenue.map((row) => (
                <div className="rev-col" key={row.month} title={`${row.month}: invoiced ${money(row.invoiced, currency)}, collected ${money(row.collected, currency)}`}>
                  <div className="rev-bars">
                    <div className="b1" style={{ height: `${Math.round((row.invoiced / max) * 100)}%` }} />
                    <div className="b2" style={{ height: `${Math.round((row.collected / max) * 100)}%` }} />
                  </div>
                  <div className="rev-x">{row.month.slice(5)}</div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Projects in flight" right={<Link to="/admin/projects" className="link-action">All projects</Link>} flush>
            {projects.length === 0 ? (
              <div className="table-empty">No projects are currently in flight.</div>
            ) : (
              <div>
                {projects.map((project) => (
                  <Link
                    key={project.id}
                    to={`/admin/projects/${project.id}`}
                    className="list-row"
                    style={{ textDecoration: 'none' }}
                  >
                    <div className="grow">
                      <div className="t">{project.name}</div>
                      <div className="s">{project.client_name}{project.due_date ? ` · due ${fmtDateShort(project.due_date)}` : ''}</div>
                    </div>
                    <div style={{ width: 120 }}>
                      <Progress value={Number(project.done)} total={Number(project.total)} />
                    </div>
                    <Status status={project.status} />
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Due invoices" right={<Link to="/admin/invoices?status=overdue" className="link-action">Overdue</Link>} flush>
            {invoices.length === 0 ? (
              <div className="table-empty">Nothing outstanding — every issued invoice is settled.</div>
            ) : (
              <div>
                {invoices.map((invoice) => (
                  <Link key={invoice.id} to={`/admin/invoices/${invoice.id}`} className="list-row" style={{ textDecoration: 'none' }}>
                    <div className="grow">
                      <div className="t mono">{invoice.number}</div>
                      <div className="s">{invoice.client_name}</div>
                    </div>
                    <div className="mono small">{money(Number(invoice.total_cents) - Number(invoice.paid_cents), currency)}</div>
                    <div className="tiny muted nowrap"><Dt value={invoice.due_date} /></div>
                    <Status status={invoice.status} />
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <Panel title="Site health" right={<Link to="/admin/websites" className="link-action">Websites</Link>}>
            {healthTotal === 0 ? (
              <Empty title="No monitored sites" body="Add a website and enable monitoring to record availability." />
            ) : (
              <div className="stack" style={{ gap: 4 }}>
                {(['ok', 'warn', 'fail', 'unknown', 'unchecked'] as const).map((key) => (
                  <div className="dist-row" key={key}>
                    <span className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {key === 'unchecked' ? <span className="health-dot unknown" /> : <HealthDot status={key} />}
                      {titleize(key)}
                    </span>
                    <div className="bar"><span style={{ width: `${healthTotal ? Math.round((Number(kpis.health[key] ?? 0) / healthTotal) * 100) : 0}%`, background: key === 'fail' ? 'var(--danger)' : key === 'warn' ? 'var(--gold)' : 'var(--accent)' }} /></div>
                    <span className="n">{Number(kpis.health[key] ?? 0)}</span>
                  </div>
                ))}
                <div className="hint mt-1">Measured by the platform, or never measured — reported status from a site is shown separately.</div>
              </div>
            )}
          </Panel>

          <Panel title="Pipeline" right={<Link to="/admin/pipeline" className="link-action">Open</Link>}>
            {pipelineTotal === 0 ? (
              <div className="muted small">No open leads.</div>
            ) : (
              <div className="stack" style={{ gap: 4 }}>
                {pipeline.slice(0, 6).map((row) => (
                  <div className="dist-row" key={row.stage}>
                    <span className="small">{titleize(row.stage)}</span>
                    <div className="bar"><span style={{ width: `${Math.round((row.count / pipelineTotal) * 100)}%` }} /></div>
                    <span className="n">{row.count}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Renewals & service dates" right={<span className="tiny muted">Next 60 days</span>} flush>
            {renewals.length === 0 ? (
              <div className="table-empty">No renewals due in the next 60 days.</div>
            ) : (
              <div>
                {renewals.map((item) => (
                  <div className="list-row" key={`${item.kind}-${item.id}`}>
                    <div className="grow">
                      <div className="t">{item.label}</div>
                      <div className="s">{item.kind === 'plan' ? 'Maintenance service' : 'Domain or hosting renewal'}</div>
                    </div>
                    <Badge tone={new Date(item.date) < new Date() ? 'danger' : 'warn'}>{fmtDateShort(item.date)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Tasks due" right={<Link to="/admin/tasks" className="link-action">All tasks</Link>} flush>
            {tasks.length === 0 ? (
              <div className="table-empty">No scheduled tasks.</div>
            ) : (
              <div>
                {tasks.map((task) => (
                  <Link key={task.id} to="/admin/tasks" className="list-row" style={{ textDecoration: 'none' }}>
                    <div className="grow">
                      <div className="t">{task.title}</div>
                      <div className="s">{task.client_name ?? 'General'}</div>
                    </div>
                    <Badge tone={task.priority === 'urgent' ? 'danger' : task.priority === 'high' ? 'warn' : 'neutral'}>{task.priority}</Badge>
                    <span className="tiny muted nowrap"><Dt value={task.due_date} /></span>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Recent activity" right={<Link to="/admin/activity" className="link-action">Audit log</Link>} flush>
            {activity.length === 0 ? (
              <div className="table-empty">No recorded activity yet.</div>
            ) : (
              <div style={{ padding: '14px 16px' }}>
                <ul className="timeline">
                  {activity.map((item) => (
                    <li key={item.id}>
                      <div className="tl-head">
                        <span className="tl-title">{item.subject}</span>
                        <span className="tl-meta">{relTime(item.happened_at)}</span>
                      </div>
                      <div className="tl-body muted small">
                        {titleize(item.type)}{item.client_name ? ` · ${item.client_name}` : ''}
                        {item.visibility === 'client' ? ' · visible to client' : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

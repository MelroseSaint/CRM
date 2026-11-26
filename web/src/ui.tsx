// Shared presentation components. Class names come from the design-system stylesheet.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Row } from './api';
import { fmtDate, fmtDateTime, money, titleize } from './api';

const PATHS: Record<string, string> = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  funnel: 'M3 4h18l-7 8v6l-4 2v-8z',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
  receipt: 'M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2zM8 8h8M8 12h8M8 16h5',
  wrench: 'M14.7 6.3a4 4 0 1 0 5 5L21 21l-3 0-9.7-9.7a4 4 0 0 1-5-5z',
  check: 'M20 6 9 17l-5-5',
  calendar: 'M4 5h16v16H4zM8 3v4M16 3v4M4 10h16',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M9 13h6M9 17h6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.4 2.6a7 7 0 0 0-1.7 1L5 5.6 3 9l2 1.6a7 7 0 0 0 0 2L3 14.2l2 3.4 2.4-1a7 7 0 0 0 1.7 1L9.5 21h5l.4-2.6a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6c.1-.3.1-.7.1-1z',
  key: 'M15 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8M11.5 12.5 3 21M6 18l2 2M3 21l-1-1',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6 6 18',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l-5-5 5-5M5 12h11',
  alert: 'M12 3 2 21h20zM12 9v6M12 18h.01',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l4 2',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  refresh: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  lock: 'M6 11h12v10H6zM9 11V7a3 3 0 0 1 6 0v4',
};

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? PATHS.grid} />
    </svg>
  );
}

const TONES: Record<string, string> = {
  paid: 'ok', accepted: 'ok', active: 'ok', active_client: 'ok', live: 'ok', done: 'ok',
  completed: 'ok', ok: 'ok', converted: 'ok', confirmed: 'ok', connected: 'ok',
  pending: 'warn', awaiting_client: 'warn', sent: 'warn', in_progress: 'warn', review: 'warn',
  submitted: 'warn', planning: 'warn', partially_paid: 'warn', warn: 'warn', unknown: 'warn',
  trialing: 'warn', on_hold: 'warn', viewed: 'warn',
  failed: 'danger', fail: 'danger', cancelled: 'danger', declined: 'danger', lost: 'danger',
  blocked: 'danger', expired: 'danger', overdue: 'danger', disabled: 'danger',
  draft: 'info', new: 'info', new_lead: 'info', new_inquiry: 'info', paused: 'neutral',
  maintenance: 'info', archived: 'neutral', none: 'neutral',
};

export function statusTone(status: string | null | undefined): string {
  return TONES[(status ?? '').toLowerCase()] ?? 'neutral';
}

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const label = typeof children === 'string' ? children : '';
  return <span className={`badge ${tone ?? statusTone(label)}`}>{children}</span>;
}

export function Status({ status }: { status: string | null | undefined }) {
  return <Badge>{titleize(status)}</Badge>;
}

export function HealthDot({ status }: { status: string | null | undefined }) {
  const key = status && ['ok', 'warn', 'fail', 'unknown'].includes(status) ? status : 'unknown';
  return <span className={`health-dot ${key}`} title={status ?? 'never checked'} />;
}

export function Money({ cents, currency }: { cents: number | null | undefined; currency?: string }) {
  return <span className="mono">{money(cents, currency)}</span>;
}

export function Dt({ value, mode = 'date' }: { value: string | null | undefined; mode?: 'date' | 'datetime' | 'short' }) {
  if (!value) return <span className="muted">—</span>;
  return <span className="nowrap">{mode === 'datetime' ? fmtDateTime(value) : fmtDate(value)}</span>;
}

export function PageHead({
  eyebrow, title, sub, actions,
}: { eyebrow?: string; title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {sub ? <div className="sub">{sub}</div> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function StatBand({ items }: { items: { label: string; value: ReactNode; sub?: string; tone?: string }[] }) {
  return (
    <div className="stat-band">
      {items.map((item) => (
        <div className="stat" key={item.label}>
          <div className="stat-label">{item.label}</div>
          <div className={`stat-value ${item.tone ? `is-${item.tone}` : ''}`}>{item.value}</div>
          {item.sub ? <div className="stat-sub">{item.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function Panel({
  title, right, children, foot, flush, id,
}: { title?: ReactNode; right?: ReactNode; children: ReactNode; foot?: ReactNode; flush?: boolean; id?: string }) {
  return (
    <section className="panel" id={id}>
      {title ? (
        <div className="panel-head">
          <h2>{title}</h2>
          {right ? <div className="right">{right}</div> : null}
        </div>
      ) : null}
      {flush ? children : <div className="panel-body">{children}</div>}
      {foot ? <div className="panel-foot">{foot}</div> : null}
    </section>
  );
}

export type Column<T = Row> = {
  label: string;
  render: (row: T) => ReactNode;
  num?: boolean;
  width?: string;
};

export function Table<T extends Row>({
  columns, rows, onRow, empty = 'Nothing here yet.',
}: { columns: Column<T>[]; rows: T[]; onRow?: (row: T) => void; empty?: string }) {
  if (!rows.length) return <div className="table-empty">{empty}</div>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.label} className={col.num ? 'num' : ''} style={col.width ? { width: col.width } : undefined}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={String(row.id ?? index)}
              onClick={onRow ? () => onRow(row) : undefined}
              style={onRow ? { cursor: 'pointer' } : undefined}
            >
              {columns.map((col) => (
                <td key={col.label} className={col.num ? 'num' : ''}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="icon-wrap"><Icon name="folder" size={26} /></div>
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

export function Progress({ value, total }: { value: number; total: number }) {
  const p = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="progress-row">
      <div className="bar"><span style={{ width: `${p}%` }} /></div>
      <span className="pct">{p}%</span>
    </div>
  );
}

export function Alert({ kind = 'err', children }: { kind?: 'ok' | 'err' | 'warn' | 'info'; children: ReactNode }) {
  return <div className={`flash ${kind}`}>{children}</div>;
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="table-empty">{label}</div>;
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([label, value]) => (
        <div key={label} style={{ display: 'contents' }}>
          <dt>{label}</dt>
          <dd>{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Modal({
  title, children, onClose, footer, wide,
}: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="modal-x" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

type ToastItem = { id: number; message: string; kind: 'ok' | 'err' };

export function toast(message: string, kind: 'ok' | 'err' = 'ok'): void {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, kind } }));
}

export function Toasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    let seq = 0;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; kind: 'ok' | 'err' }>).detail;
      const id = ++seq;
      setItems((prev) => [...prev, { id, ...detail }]);
      window.setTimeout(() => setItems((prev) => prev.filter((item) => item.id !== id)), 4200);
    };
    window.addEventListener('app-toast', handler);
    return () => window.removeEventListener('app-toast', handler);
  }, []);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={`toast ${item.kind}`}>{item.message}</div>
      ))}
    </div>
  );
}

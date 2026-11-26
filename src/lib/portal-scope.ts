// Row-level security for the client-facing surface.
//
// D1 (SQLite) has no row-level security policies, so ownership is enforced in
// one place: every portal read or write of a client-owned row goes through
// these helpers, which always bind `client_id` and refuse unknown tables.
// Endpoint code therefore cannot forget the `client_id = ?` predicate.

import type { AppContext } from './auth';
import type { Param } from './db';
import { all, one, run } from './db';

const CLIENT_OWNED_TABLES = [
  'projects',
  'websites',
  'invoices',
  'agreements',
  'documents',
  'maintenance_requests',
  'maintenance_plans',
  'activities',
  'tasks',
  'calendar_events',
  'payments',
] as const;

const PROJECT_CHILD_TABLES = ['project_milestones', 'project_deliverables', 'invoices', 'activities'] as const;

export type ClientOwnedTable = (typeof CLIENT_OWNED_TABLES)[number];
export type ProjectChildTable = (typeof PROJECT_CHILD_TABLES)[number];

const ownedTables = new Set<string>(CLIENT_OWNED_TABLES);
const childTables = new Set<string>(PROJECT_CHILD_TABLES);
const COLUMNS_PATTERN = /^[A-Za-z0-9_*, ]+$/;

function assertTable(table: string, allowed: Set<string>, kind: string): void {
  if (!allowed.has(table)) throw new Error(`Refusing ${kind} scope for "${table}": not a portal table.`);
}

function where(options: ScopeOptions): string {
  return options.where ? ` ${options.where}` : '';
}

function select(options: ScopeOptions): string {
  const columns = options.columns?.trim() || '*';
  if (columns !== '*' && !COLUMNS_PATTERN.test(columns)) {
    throw new Error(`Refusing to select unsafe column list "${columns}".`);
  }
  return columns;
}

export interface ScopeOptions {
  columns?: string;
  /** Extra predicate appended with AND, written by server code only. */
  where?: string;
  orderBy?: string;
  params?: Param[];
}

/** A single row that must belong to the signed-in client. */
export async function ownedRow<T>(
  c: AppContext,
  table: ClientOwnedTable,
  id: number,
  clientId: number,
  options: ScopeOptions = {},
): Promise<T | null> {
  assertTable(table, ownedTables, 'row');
  return one<T>(
    c.env.DB,
    `SELECT ${select(options)} FROM ${table} WHERE id = ? AND client_id = ?${where(options)}`,
    id,
    clientId,
    ...(options.params ?? []),
  );
}

/** Rows filtered by client ownership, with no way to omit the scope. */
export async function ownedRows<T>(
  c: AppContext,
  table: ClientOwnedTable,
  clientId: number,
  options: ScopeOptions = {},
): Promise<T[]> {
  assertTable(table, ownedTables, 'list');
  return all<T>(
    c.env.DB,
    `SELECT ${select(options)} FROM ${table} WHERE client_id = ?${where(options)} ${options.orderBy ?? ''}`,
    clientId,
    ...(options.params ?? []),
  );
}

/** Update guarded by client ownership; returns whether a row changed. */
export async function ownedUpdate(
  c: AppContext,
  table: ClientOwnedTable,
  id: number,
  clientId: number,
  values: Record<string, Param>,
): Promise<boolean> {
  assertTable(table, ownedTables, 'write');
  const keys = Object.keys(values);
  if (keys.length === 0) return false;
  const assignments = keys.map((key) => `${key} = ?`).join(', ');
  const result = await run(
    c.env.DB,
    `UPDATE ${table} SET ${assignments} WHERE id = ? AND client_id = ?`,
    ...keys.map((key) => values[key]),
    id,
    clientId,
  );
  return Number(result.meta.changes ?? 0) > 0;
}

/**
 * Rows of a project-scoped child table. Ownership is proved by joining the
 * parent project, so a client can never read another project's milestones,
 * deliverables, invoices or activity.
 */
export async function projectChildRows<T>(
  c: AppContext,
  table: ProjectChildTable,
  projectId: number,
  clientId: number,
  options: ScopeOptions = {},
): Promise<T[]> {
  assertTable(table, childTables, 'project child');
  return all<T>(
    c.env.DB,
    `SELECT x.* FROM ${table} x JOIN projects p ON p.id = x.project_id
      WHERE p.client_id = ? AND x.project_id = ?${where(options)}
      ${options.orderBy ?? ''}`,
    clientId,
    projectId,
    ...(options.params ?? []),
  );
}

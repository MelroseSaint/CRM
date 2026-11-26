-- Anvil Ops — relational schema (Cloudflare D1 / SQLite)
-- All monetary values are integer minor units (cents). All timestamps are ISO-8601 UTC strings.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ---------------------------------------------------------------- clients
CREATE TABLE IF NOT EXISTS clients (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  company           TEXT,
  email             TEXT,
  phone             TEXT,
  address           TEXT,
  category          TEXT,
  socials           TEXT,                       -- JSON object
  preferred_contact TEXT DEFAULT 'email',
  acquired_at       TEXT,
  status            TEXT NOT NULL DEFAULT 'new_lead',
  notes             TEXT,
  lead_source       TEXT,
  inquiry_date      TEXT,
  services_discussed TEXT,
  tags              TEXT,                       -- comma separated
  archived          INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);

CREATE TABLE IF NOT EXISTS client_tags (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tag       TEXT NOT NULL,
  UNIQUE(client_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_client_tags_tag ON client_tags(tag);

-- ---------------------------------------------------------------- leads
CREATE TABLE IF NOT EXISTS leads (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id        INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  converted_client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  company          TEXT,
  email            TEXT,
  phone            TEXT,
  source           TEXT,
  services         TEXT,
  est_value_cents  INTEGER NOT NULL DEFAULT 0,
  recurring_cents  INTEGER NOT NULL DEFAULT 0,
  stage            TEXT NOT NULL DEFAULT 'new_inquiry',
  probability      INTEGER NOT NULL DEFAULT 10,
  notes            TEXT,
  next_follow_up   TEXT,
  lost_reason      TEXT,
  owner_id         INTEGER,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_followup ON leads(next_follow_up);

-- ---------------------------------------------------------------- projects
CREATE TABLE IF NOT EXISTS projects (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  code              TEXT,
  name              TEXT NOT NULL,
  client_id         INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  category          TEXT NOT NULL DEFAULT 'business_website',
  description       TEXT,
  scope             TEXT,
  start_date        TEXT,
  due_date          TEXT,
  budget_cents      INTEGER NOT NULL DEFAULT 0,
  payment_structure TEXT,
  priority          TEXT NOT NULL DEFAULT 'medium',
  status            TEXT NOT NULL DEFAULT 'planning',
  notes             TEXT,
  portal_visible    INTEGER NOT NULL DEFAULT 1,
  archived          INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_due ON projects(due_date);

CREATE TABLE IF NOT EXISTS project_milestones (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  due_date     TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'pending',
  requires_approval INTEGER NOT NULL DEFAULT 0,
  approved_at  TEXT,
  approved_note TEXT,
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON project_milestones(project_id);

CREATE TABLE IF NOT EXISTS project_deliverables (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  url         TEXT,
  notes       TEXT,
  status      TEXT NOT NULL DEFAULT 'in_progress',
  portal_visible INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deliverables_project ON project_deliverables(project_id);

-- ---------------------------------------------------------------- tasks
CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  description  TEXT,
  priority     TEXT NOT NULL DEFAULT 'medium',
  category     TEXT NOT NULL DEFAULT 'operations',
  due_date     TEXT,
  status       TEXT NOT NULL DEFAULT 'open',
  client_id    INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  website_id   INTEGER REFERENCES websites(id) ON DELETE SET NULL,
  assignee_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  recurrence   TEXT,
  notes        TEXT,
  completed_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_client ON tasks(client_id);

-- ---------------------------------------------------------------- websites
CREATE TABLE IF NOT EXISTS websites (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id             INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id            INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  name                  TEXT NOT NULL,
  domain                TEXT,
  production_url        TEXT,
  staging_url           TEXT,
  category              TEXT,
  stack                 TEXT,
  hosting_provider      TEXT,
  domain_registrar      TEXT,
  deploy_platform       TEXT,
  repo_url              TEXT,
  backend_provider      TEXT,
  db_provider           TEXT,
  media_provider        TEXT,
  status                TEXT NOT NULL DEFAULT 'in_development',
  deployed_at           TEXT,
  domain_renewal_date   TEXT,
  hosting_renewal_date  TEXT,
  ssl_expires_at        TEXT,
  monitoring_enabled    INTEGER NOT NULL DEFAULT 1,
  monitor_interval_minutes INTEGER NOT NULL DEFAULT 60,
  last_check_at         TEXT,
  last_http_status      INTEGER,
  last_latency_ms       INTEGER,
  last_health           TEXT,
  integration_id        TEXT,
  integration_status    TEXT NOT NULL DEFAULT 'not_connected',
  integration_version   TEXT,
  last_sync_at          TEXT,
  last_api_activity_at  TEXT,
  portal_visible        INTEGER NOT NULL DEFAULT 1,
  notes                 TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_websites_client ON websites(client_id);
CREATE INDEX IF NOT EXISTS idx_websites_status ON websites(status);
CREATE INDEX IF NOT EXISTS idx_websites_domain ON websites(domain);

CREATE TABLE IF NOT EXISTS website_checks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id  INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  source      TEXT NOT NULL DEFAULT 'manual',     -- automated | manual
  kind        TEXT NOT NULL,                      -- uptime | ssl | performance | accessibility | security | backup | broken_links | mobile
  status      TEXT NOT NULL DEFAULT 'unknown',    -- ok | warn | fail | unknown
  latency_ms  INTEGER,
  http_status INTEGER,
  detail      TEXT,
  checked_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  checked_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checks_website ON website_checks(website_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS website_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,           -- update | content | design | feature | bugfix | security | performance | deployment | maintenance | integration | monitoring
  title      TEXT NOT NULL,
  detail     TEXT,
  source     TEXT NOT NULL DEFAULT 'admin',  -- admin | integration | monitoring | portal
  event_key  TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_website_events_key ON website_events(website_id, event_key) WHERE event_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_website ON website_events(website_id, created_at DESC);

-- ------------------------------------------------- maintenance agreements / requests
CREATE TABLE IF NOT EXISTS maintenance_plans (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id      INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  website_id     INTEGER REFERENCES websites(id) ON DELETE SET NULL,
  name           TEXT NOT NULL,
  monthly_cents  INTEGER NOT NULL DEFAULT 0,
  hours_included REAL,
  services       TEXT,
  start_date     TEXT,
  next_service_date TEXT,
  end_date       TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  notes          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_plans_client ON maintenance_plans(client_id);

CREATE TABLE IF NOT EXISTS maintenance_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  website_id    INTEGER REFERENCES websites(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  priority      TEXT NOT NULL DEFAULT 'medium',
  status        TEXT NOT NULL DEFAULT 'submitted',
  assignee_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  submitted_at  TEXT NOT NULL,
  target_date   TEXT,
  work_performed TEXT,
  completed_at  TEXT,
  notes         TEXT,
  source        TEXT NOT NULL DEFAULT 'admin',
  request_key   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_maint_key ON maintenance_requests(client_id, request_key) WHERE request_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_maint_status ON maintenance_requests(status);

-- ---------------------------------------------------------------- agreements
CREATE TABLE IF NOT EXISTS agreements (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  number            TEXT NOT NULL UNIQUE,
  client_id         INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id        INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  kind              TEXT NOT NULL DEFAULT 'development_contract',
  title             TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'draft',
  body              TEXT,
  scope             TEXT,
  deliverables      TEXT,
  amount_cents      INTEGER NOT NULL DEFAULT 0,
  deposit_cents     INTEGER NOT NULL DEFAULT 0,
  revision_limit    TEXT,
  timeline          TEXT,
  maintenance_terms TEXT,
  support_terms     TEXT,
  client_responsibilities TEXT,
  cancellation_terms TEXT,
  extra_conditions  TEXT,
  expires_at        TEXT,
  sent_at           TEXT,
  viewed_at         TEXT,
  accepted_at       TEXT,
  accepted_by       TEXT,
  accepted_ip       TEXT,
  accepted_hash     TEXT,
  declined_at       TEXT,
  decline_reason    TEXT,
  portal_visible    INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agreements_client ON agreements(client_id);
CREATE INDEX IF NOT EXISTS idx_agreements_status ON agreements(status);

-- ---------------------------------------------------------------- invoices
CREATE TABLE IF NOT EXISTS invoices (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  number           TEXT NOT NULL UNIQUE,
  client_id        INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  project_id       INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  kind             TEXT NOT NULL DEFAULT 'development',
  description      TEXT,
  subtotal_cents   INTEGER NOT NULL DEFAULT 0,
  tax_cents        INTEGER NOT NULL DEFAULT 0,
  discount_cents   INTEGER NOT NULL DEFAULT 0,
  total_cents      INTEGER NOT NULL DEFAULT 0,
  paid_cents       INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'draft',
  issue_date       TEXT,
  due_date         TEXT,
  notes            TEXT,
  portal_visible   INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due ON invoices(due_date);

CREATE TABLE IF NOT EXISTS invoice_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id   INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description  TEXT NOT NULL,
  qty          REAL NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  sort         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_items_invoice ON invoice_items(invoice_id);

CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id   INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  paid_at      TEXT NOT NULL,
  method       TEXT NOT NULL DEFAULT 'bank_transfer',
  reference    TEXT,
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'confirmed',
  source       TEXT NOT NULL DEFAULT 'manual',
  recorded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at);

-- ---------------------------------------------------------------- activity / calendar / documents
CREATE TABLE IF NOT EXISTS activities (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  lead_id    INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  website_id INTEGER REFERENCES websites(id) ON DELETE SET NULL,
  type       TEXT NOT NULL DEFAULT 'note',
  subject    TEXT NOT NULL,
  body       TEXT,
  happened_at TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'internal',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_client ON activities(client_id, happened_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_lead ON activities(lead_id, happened_at DESC);

CREATE TABLE IF NOT EXISTS calendar_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'meeting',
  client_id   INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  project_id  INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  website_id  INTEGER REFERENCES websites(id) ON DELETE SET NULL,
  starts_at   TEXT NOT NULL,
  ends_at     TEXT,
  all_day     INTEGER NOT NULL DEFAULT 0,
  location    TEXT,
  notes       TEXT,
  visibility  TEXT NOT NULL DEFAULT 'internal',
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_start ON calendar_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_events_client ON calendar_events(client_id);

CREATE TABLE IF NOT EXISTS documents (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id    INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  website_id   INTEGER REFERENCES websites(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'general',
  content_type TEXT,
  size_bytes   INTEGER NOT NULL DEFAULT 0,
  r2_key       TEXT NOT NULL,
  visibility   TEXT NOT NULL DEFAULT 'internal',
  uploaded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_id);

-- ---------------------------------------------------------------- auth & audit (after clients for FK)
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin','staff','client')),
  client_id     INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  iterations    INTEGER NOT NULL DEFAULT 210000,
  status        TEXT NOT NULL DEFAULT 'active',
  last_login_at TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_client ON users(client_id);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  actor_email   TEXT,
  actor_role    TEXT,
  action        TEXT NOT NULL,
  entity_type   TEXT,
  entity_id     TEXT,
  detail        TEXT,
  ip            TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL,
  ip         TEXT,
  success    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_email ON login_attempts(email, created_at DESC);

-- ---------------------------------------------------------------- API layer
CREATE TABLE IF NOT EXISTS api_credentials (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id    INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  key_id        TEXT NOT NULL UNIQUE,
  secret_hash   TEXT NOT NULL,
  secret_hint   TEXT,
  scopes        TEXT NOT NULL DEFAULT 'website:read,website:sync',
  status        TEXT NOT NULL DEFAULT 'active',
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL,
  last_used_at  TEXT,
  revoked_at    TEXT,
  rotated_from  TEXT
);
CREATE INDEX IF NOT EXISTS idx_creds_website ON api_credentials(website_id);

CREATE TABLE IF NOT EXISTS registration_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS api_request_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  credential_id INTEGER,
  website_id    INTEGER,
  method        TEXT NOT NULL,
  path          TEXT NOT NULL,
  status        INTEGER NOT NULL,
  duration_ms   INTEGER,
  ip            TEXT,
  note          TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_logs_created ON api_request_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_website ON api_request_logs(website_id);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket       TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id    INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  credential_id INTEGER,
  direction     TEXT NOT NULL DEFAULT 'inbound',
  kind          TEXT NOT NULL,
  status        TEXT NOT NULL,
  message       TEXT,
  payload       TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_website ON sync_logs(website_id, created_at DESC);

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id       INTEGER NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
  url              TEXT NOT NULL,
  secret           TEXT NOT NULL,
  events           TEXT NOT NULL DEFAULT '*',
  status           TEXT NOT NULL DEFAULT 'active',
  last_delivery_at TEXT,
  failure_count    INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webhooks_website ON webhook_endpoints(website_id);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint_id     INTEGER NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  website_id      INTEGER NOT NULL,
  event           TEXT NOT NULL,
  payload         TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INTEGER NOT NULL DEFAULT 0,
  response_status INTEGER,
  last_error      TEXT,
  next_attempt_at TEXT,
  created_at      TEXT NOT NULL,
  delivered_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON webhook_deliveries(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_deliveries_endpoint ON webhook_deliveries(endpoint_id, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

INSERT OR IGNORE INTO settings(key, value) VALUES
  ('business_name', 'Anvil Web Studio'),
  ('business_email', ''),
  ('currency', 'USD'),
  ('tax_rate', '0'),
  ('invoice_prefix', 'INV'),
  ('agreement_prefix', 'AGR'),
  ('payment_terms_days', '14'),
  ('overdue_grace_days', '0'),
  ('api_rate_limit_per_minute', '120'),
  ('portal_welcome', 'Welcome to your project portal.');

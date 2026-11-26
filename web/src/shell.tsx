// Application shells: staff workspace and client portal.

import { useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useSession, type User } from './session';
import { Icon, Toasts, Badge } from './ui';
import { Dashboard } from './pages/dashboard';
import { Clients, ClientDetail, Pipeline } from './pages/people';
import { Projects, ProjectDetail, Websites, WebsiteDetail } from './pages/work';
import { Agreements, AgreementDetail, Invoices, InvoiceDetail } from './pages/money';
import { Maintenance, Tasks, CalendarPage, Documents } from './pages/ops';
import { Reports, SearchPage, SettingsPage, ApiConsole, ApiDocs, ActivityPage, NotFound } from './pages/system';
import { PortalHome, PortalProject } from './pages/portal';

type NavItem = { to: string; label: string; icon: string; end?: boolean; countKey?: string };
type NavGroup = { label: string; items: NavItem[] };

const ADMIN_NAV: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { to: '/admin', label: 'Dashboard', icon: 'grid', end: true },
      { to: '/admin/clients', label: 'Clients', icon: 'users', countKey: 'clients' },
      { to: '/admin/pipeline', label: 'Pipeline', icon: 'funnel', countKey: 'leads' },
    ],
  },
  {
    label: 'Delivery',
    items: [
      { to: '/admin/projects', label: 'Projects', icon: 'folder', countKey: 'projects' },
      { to: '/admin/websites', label: 'Websites', icon: 'globe' },
      { to: '/admin/maintenance', label: 'Maintenance', icon: 'wrench', countKey: 'maintenance' },
    ],
  },
  {
    label: 'Business',
    items: [
      { to: '/admin/agreements', label: 'Agreements', icon: 'file' },
      { to: '/admin/invoices', label: 'Invoices', icon: 'receipt', countKey: 'overdue' },
      { to: '/admin/reports', label: 'Reports', icon: 'chart' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/admin/tasks', label: 'Tasks', icon: 'check', countKey: 'tasks' },
      { to: '/admin/calendar', label: 'Calendar', icon: 'calendar' },
      { to: '/admin/documents', label: 'Documents', icon: 'doc' },
      { to: '/admin/activity', label: 'Audit log', icon: 'clock' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/admin/api', label: 'API & webhooks', icon: 'key' },
      { to: '/admin/settings', label: 'Settings', icon: 'settings' },
    ],
  },
];

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function Brand() {
  const { session } = useSession();
  return (
    <Link to="/admin" className="brand" style={{ color: '#fff', textDecoration: 'none' }}>
      <span className="brand-mark" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
          <path d="M5 19 12 4l7 15M8.6 13.5h6.8" />
        </svg>
      </span>
      <span>
        <span className="brand-name">Anvil Ops</span>
        <span className="brand-sub">{session?.settings.business_name ?? 'Studio operations'}</span>
      </span>
    </Link>
  );
}

function Sidebar({ groups }: { groups: NavGroup[] }) {
  const { session, logout } = useSession();
  const user = session?.user;
  return (
    <aside className="sidebar">
      <Brand />
      <nav className="nav" aria-label="Main navigation">
        {groups.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {item.countKey && session?.nav?.[item.countKey] ? (
                  <span className="nav-count">{session.nav[item.countKey]}</span>
                ) : null}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      {user ? (
        <div className="sidebar-foot">
          <div className="who">
            <span className="avatar">{initials(user.name)}</span>
            <span style={{ minWidth: 0 }}>
              <span className="who-name" style={{ display: 'block' }}>{user.name}</span>
              <span className="who-role">{user.role === 'admin' ? 'Administrator' : 'Staff'}</span>
            </span>
          </div>
          <button
            className="link-action"
            style={{ color: '#9aa0a6', marginTop: 10, fontSize: 11.5 }}
            onClick={() => void logout()}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function Topbar({ title }: { title: string }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  return (
    <header className="topbar">
      <label className="nav-toggle-label" htmlFor="nav-toggle" aria-label="Toggle navigation">
        <Icon name="menu" />
      </label>
      <div className="crumbs">
        <Link to="/admin">Workspace</Link>
        <span className="sep">/</span>
        <strong>{title}</strong>
      </div>
      <form
        className="topbar-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          if (term.trim().length > 1) navigate(`/admin/search?q=${encodeURIComponent(term.trim())}`);
        }}
      >
        <input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search clients, projects, invoices…"
          aria-label="Search the workspace"
        />
        <button type="submit" aria-label="Search"><Icon name="search" size={14} /></button>
      </form>
    </header>
  );
}

function currentTitle(pathname: string): string {
  const all = ADMIN_NAV.flatMap((group) => group.items);
  const exact = all.find((item) => item.to === pathname);
  if (exact) return exact.label;
  const prefix = all
    .filter((item) => item.to !== '/admin' && pathname.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];
  if (prefix) return prefix.label;
  if (pathname.startsWith('/admin/api/docs')) return 'API reference';
  if (pathname.startsWith('/admin/search')) return 'Search';
  return 'Workspace';
}

function Guard({ children }: { children: ReactNode }) {
  const { session, loading, error } = useSession();
  if (loading) return <div className="app-loading">Loading workspace…</div>;
  if (error) return <div className="app-loading">{error}</div>;
  if (!session?.user) return <Navigate to="/login" replace />;
  if (session.user.role === 'client') return <Navigate to="/portal" replace />;
  return <>{children}</>;
}

export function AdminShell() {
  const location = useLocation();
  return (
    <Guard>
      <div className="app">
        <input type="checkbox" id="nav-toggle" className="nav-toggle" aria-hidden="true" />
        <Sidebar groups={ADMIN_NAV} />
        <div className="main">
          <Topbar title={currentTitle(location.pathname)} />
          <main className="content">
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="clients" element={<Clients />} />
              <Route path="clients/:id" element={<ClientDetail />} />
              <Route path="pipeline" element={<Pipeline />} />
              <Route path="projects" element={<Projects />} />
              <Route path="projects/:id" element={<ProjectDetail />} />
              <Route path="websites" element={<Websites />} />
              <Route path="websites/:id" element={<WebsiteDetail />} />
              <Route path="agreements" element={<Agreements />} />
              <Route path="agreements/:id" element={<AgreementDetail />} />
              <Route path="invoices" element={<Invoices />} />
              <Route path="invoices/:id" element={<InvoiceDetail />} />
              <Route path="maintenance" element={<Maintenance />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="documents" element={<Documents />} />
              <Route path="reports" element={<Reports />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="api" element={<ApiConsole />} />
              <Route path="api/docs" element={<ApiDocs />} />
              <Route path="activity" element={<ActivityPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
        <Toasts />
      </div>
    </Guard>
  );
}

function portalInitials(user: User): string {
  return initials(user.client_name || user.name);
}

export function PortalShell() {
  const { session, loading, logout } = useSession();
  const location = useLocation();
  if (loading) return <div className="app-loading">Loading portal…</div>;
  if (!session?.user) return <Navigate to="/login" replace />;
  if (session.user.role !== 'client') return <Navigate to="/admin" replace />;
  const user = session.user;
  return (
    <div className="app">
      <input type="checkbox" id="nav-toggle" className="nav-toggle" aria-hidden="true" />
      <aside className="sidebar">
        <Brand />
        <nav className="nav" aria-label="Portal navigation">
          <div className="nav-group">
            <div className="nav-label">Your workspace</div>
            <NavLink to="/portal" end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <Icon name="grid" /><span>Overview</span>
            </NavLink>
            <NavLink to="/portal#projects" className="nav-item">
              <Icon name="folder" /><span>Projects</span>
            </NavLink>
            <NavLink to="/portal#invoices" className="nav-item">
              <Icon name="receipt" /><span>Invoices</span>
            </NavLink>
            <NavLink to="/portal#documents" className="nav-item">
              <Icon name="doc" /><span>Documents</span>
            </NavLink>
            <NavLink to="/portal#support" className="nav-item">
              <Icon name="wrench" /><span>Support</span>
            </NavLink>
          </div>
        </nav>
        <div className="sidebar-foot">
          <div className="who">
            <span className="avatar">{portalInitials(user)}</span>
            <span style={{ minWidth: 0 }}>
              <span className="who-name" style={{ display: 'block' }}>{user.client_name || user.name}</span>
              <span className="who-role">Client</span>
            </span>
          </div>
          <button className="link-action" style={{ color: '#9aa0a6', marginTop: 10, fontSize: 11.5 }} onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <label className="nav-toggle-label" htmlFor="nav-toggle" aria-label="Toggle navigation">
            <Icon name="menu" />
          </label>
          <div className="crumbs">
            <span>Client portal</span>
            <span className="sep">/</span>
            <strong>{location.pathname === '/portal' ? 'Overview' : 'Project'}</strong>
          </div>
          <div className="topbar-search" style={{ marginLeft: 'auto' }}>
            <Badge tone="ok">{session.settings.business_name || 'Anvil Ops'}</Badge>
          </div>
        </header>
        <main className="content">
          <Routes>
            <Route index element={<PortalHome />} />
            <Route path="projects/:id" element={<PortalProject />} />
            <Route path="*" element={<PortalHome />} />
          </Routes>
        </main>
      </div>
      <Toasts />
    </div>
  );
}

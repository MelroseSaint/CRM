// Application shells: staff workspace and client portal.

import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useSession, type User } from './session';
import { Icon, Toasts, Badge } from './ui';

const Dashboard = lazy(() => import('./pages/dashboard').then((m) => ({ default: m.Dashboard })));
const Clients = lazy(() => import('./pages/people').then((m) => ({ default: m.Clients })));
const ClientDetail = lazy(() => import('./pages/people').then((m) => ({ default: m.ClientDetail })));
const Pipeline = lazy(() => import('./pages/people').then((m) => ({ default: m.Pipeline })));
const Projects = lazy(() => import('./pages/work').then((m) => ({ default: m.Projects })));
const ProjectDetail = lazy(() => import('./pages/work').then((m) => ({ default: m.ProjectDetail })));
const Websites = lazy(() => import('./pages/work').then((m) => ({ default: m.Websites })));
const WebsiteDetail = lazy(() => import('./pages/work').then((m) => ({ default: m.WebsiteDetail })));
const Agreements = lazy(() => import('./pages/money').then((m) => ({ default: m.Agreements })));
const AgreementDetail = lazy(() => import('./pages/money').then((m) => ({ default: m.AgreementDetail })));
const Invoices = lazy(() => import('./pages/money').then((m) => ({ default: m.Invoices })));
const InvoiceDetail = lazy(() => import('./pages/money').then((m) => ({ default: m.InvoiceDetail })));
const Maintenance = lazy(() => import('./pages/ops').then((m) => ({ default: m.Maintenance })));
const Tasks = lazy(() => import('./pages/ops').then((m) => ({ default: m.Tasks })));
const CalendarPage = lazy(() => import('./pages/ops').then((m) => ({ default: m.CalendarPage })));
const Documents = lazy(() => import('./pages/ops').then((m) => ({ default: m.Documents })));
const Reports = lazy(() => import('./pages/system').then((m) => ({ default: m.Reports })));
const SearchPage = lazy(() => import('./pages/system').then((m) => ({ default: m.SearchPage })));
const SettingsPage = lazy(() => import('./pages/system').then((m) => ({ default: m.SettingsPage })));
const ApiConsole = lazy(() => import('./pages/system').then((m) => ({ default: m.ApiConsole })));
const ApiDocs = lazy(() => import('./pages/system').then((m) => ({ default: m.ApiDocs })));
const ActivityPage = lazy(() => import('./pages/system').then((m) => ({ default: m.ActivityPage })));
const NotFound = lazy(() => import('./pages/system').then((m) => ({ default: m.NotFound })));
const PortalHome = lazy(() => import('./pages/portal').then((m) => ({ default: m.PortalHome })));
const PortalProject = lazy(() => import('./pages/portal').then((m) => ({ default: m.PortalProject })));

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

const PORTAL_NAV: NavGroup[] = [
  {
    label: 'Your workspace',
    items: [
      { to: '/portal', label: 'Overview', icon: 'grid', end: true },
      { to: '/portal#projects', label: 'Projects', icon: 'folder' },
      { to: '/portal#invoices', label: 'Invoices', icon: 'receipt' },
      { to: '/portal#documents', label: 'Documents', icon: 'doc' },
      { to: '/portal#support', label: 'Support', icon: 'wrench' },
    ],
  },
];

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function Brand({ to }: { to: string }) {
  const { session } = useSession();
  return (
    <Link to={to} className="brand" style={{ color: '#fff', textDecoration: 'none' }}>
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

function Sidebar({
  groups, open, home, footerName, footerRole, onNavigate,
}: {
  groups: NavGroup[];
  open: boolean;
  home: string;
  footerName: string;
  footerRole: string;
  onNavigate: () => void;
}) {
  const { session, logout } = useSession();
  return (
    <aside className={`sidebar${open ? ' open' : ''}`} id="app-nav" aria-label="Navigation">
      <Brand to={home} />
      <nav className="nav">
        {groups.map((group) => (
          <div className="nav-group" key={group.label}>
            <div className="nav-label">{group.label}</div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                onClick={onNavigate}
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
      <div className="sidebar-foot">
        <div className="who">
          <span className="avatar">{initials(footerName)}</span>
          <span style={{ minWidth: 0 }}>
            <span className="who-name" style={{ display: 'block' }}>{footerName}</span>
            <span className="who-role">{footerRole}</span>
          </span>
        </div>
        <button
          className="link-action signout"
          onClick={() => void logout()}
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

function Topbar({ title, onMenu, onSearch }: { title: string; onMenu: () => void; onSearch?: () => void }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  return (
    <header className="topbar">
      <button className="menu-btn" onClick={onMenu} aria-label="Open navigation" aria-controls="app-nav">
        <Icon name="menu" size={18} />
      </button>
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
      {onSearch ? (
        <button className="menu-btn" onClick={onSearch} aria-label="Search">
          <Icon name="search" size={17} />
        </button>
      ) : null}
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

function PageFallback() {
  return <div className="table-empty">Loading…</div>;
}

export function AdminShell() {
  const { session } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);

  // Close the drawer whenever the route changes (link taps included).
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!navOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [navOpen]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  return (
    <Guard>
      <div className="app">
        {navOpen ? (
          <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setNavOpen(false)} />
        ) : null}
        <Sidebar
          groups={ADMIN_NAV}
          open={navOpen}
          home="/admin"
          footerName={session?.user?.name ?? 'Staff'}
          footerRole={session?.user?.role === 'admin' ? 'Administrator' : 'Staff'}
          onNavigate={() => setNavOpen(false)}
        />
        <div className="main">
          <Topbar
            title={currentTitle(location.pathname)}
            onMenu={() => setNavOpen(true)}
            onSearch={() => navigate('/admin/search')}
          />
          <main className="content">
            <Suspense fallback={<PageFallback />}>
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
            </Suspense>
          </main>
        </div>
        <Toasts />
      </div>
    </Guard>
  );
}

function portalLabel(user: User): string {
  return user.client_name || user.name;
}

export function PortalShell() {
  const { session, loading } = useSession();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!navOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [navOpen]);

  if (loading) return <div className="app-loading">Loading portal…</div>;
  if (!session?.user) return <Navigate to="/login" replace />;
  if (session.user.role !== 'client') return <Navigate to="/admin" replace />;
  const user = session.user;

  return (
    <div className="app">
      {navOpen ? (
        <button className="nav-backdrop" aria-label="Close navigation" onClick={() => setNavOpen(false)} />
      ) : null}
      <Sidebar
        groups={PORTAL_NAV}
        open={navOpen}
        home="/portal"
        footerName={portalLabel(user)}
        footerRole="Client"
        onNavigate={() => setNavOpen(false)}
      />
      <div className="main">
        <header className="topbar">
          <button className="menu-btn" onClick={() => setNavOpen(true)} aria-label="Open navigation" aria-controls="app-nav">
            <Icon name="menu" size={18} />
          </button>
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
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route index element={<PortalHome />} />
              <Route path="projects/:id" element={<PortalProject />} />
              <Route path="*" element={<PortalHome />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <Toasts />
    </div>
  );
}

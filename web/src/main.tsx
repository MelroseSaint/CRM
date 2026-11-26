import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import { CSS as DESIGN_CSS } from '../../src/ui/styles';
import './app.css';

// The design system ships with the SPA rather than as a Worker route: on Vercel
// /assets/* is served by the static web service, where a Worker-only stylesheet
// would 404 and leave the app unstyled.
const design = document.createElement('style');
design.setAttribute('data-anvil-design', '');
design.textContent = DESIGN_CSS;
document.head.appendChild(design);
import { SessionProvider, useSession } from './session';
import { AdminShell, PortalShell } from './shell';
const Login = lazy(() => import('./pages/auth').then((m) => ({ default: m.Login })));
const Setup = lazy(() => import('./pages/auth').then((m) => ({ default: m.Setup })));

function Home() {
  const { session, loading } = useSession();
  if (loading) return <div className="app-loading">Loading…</div>;
  if (!session?.user) return <Navigate to={session?.setup_needed ? '/setup' : '/login'} replace />;
  return <Navigate to={session.user.role === 'client' ? '/portal' : '/admin'} replace />;
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <Suspense fallback={<div className="app-loading">Loading…</div>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/admin/*" element={<AdminShell />} />
          <Route path="/portal/*" element={<PortalShell />} />
          <Route path="*" element={<Home />} />
        </Routes>
        </Suspense>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);

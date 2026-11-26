import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './app.css';
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

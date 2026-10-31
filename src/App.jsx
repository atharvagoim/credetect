import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useAuth } from './hooks/useAuth.jsx';
import MarketingLayout, { AuthLayout } from './layouts/MarketingLayout.jsx';
import AppLayout from './layouts/AppLayout.jsx';
import Landing from './pages/Landing.jsx';
import { Login, Register, VerifyEmail, ForgotPassword, ResetPassword } from './pages/Auth.jsx';
import { SkeletonRows } from './components/ui.jsx';

const Onboarding = lazy(() => import('./pages/Onboarding.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Findings = lazy(() => import('./pages/Findings.jsx'));
const FindingDetail = lazy(() => import('./pages/FindingDetail.jsx'));
const Removals = lazy(() => import('./pages/Removals.jsx'));
const RemovalDetail = lazy(() => import('./pages/RemovalDetail.jsx'));
const Scans = lazy(() => import('./pages/Scans.jsx'));
const Monitoring = lazy(() => import('./pages/Monitoring.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Plans = lazy(() => import('./pages/Plans.jsx'));
const Admin = lazy(() => import('./pages/Admin.jsx'));
const Legal = lazy(() => import('./pages/Legal.jsx'));

function Loading() {
  return (
    <div style={{ padding: 32 }}>
      <SkeletonRows rows={3} />
    </div>
  );
}

function RequireAuth({ children, admin, onboarding }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/app" replace />;
  if (!onboarding && !user.onboardingCompleted) return <Navigate to="/onboarding" replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function NotFound() {
  return (
    <div className="container" style={{ padding: '96px 24px' }}>
      <div className="label">404</div>
      <h1 style={{ marginTop: 12 }}>Page not found</h1>
      <p className="muted" style={{ marginTop: 12 }}>
        <a href="/">Return home</a>
      </p>
    </div>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<MarketingLayout />}>
            <Route index element={<Landing />} />
            <Route path="privacy" element={<Legal page="privacy" />} />
            <Route path="terms" element={<Legal page="terms" />} />
            <Route path="unsubscribed" element={<Legal page="unsubscribed" />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route element={<AuthLayout />}>
            <Route path="login" element={<GuestOnly><Login /></GuestOnly>} />
            <Route path="register" element={<GuestOnly><Register /></GuestOnly>} />
            <Route path="verify-email" element={<VerifyEmail />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />
          </Route>
          <Route path="onboarding" element={<RequireAuth onboarding><Onboarding /></RequireAuth>} />
          <Route path="app" element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="findings" element={<Findings />} />
            <Route path="findings/:id" element={<FindingDetail />} />
            <Route path="removals" element={<Removals />} />
            <Route path="removals/:id" element={<RemovalDetail />} />
            <Route path="scans" element={<Scans />} />
            <Route path="monitoring" element={<Monitoring />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="settings" element={<Settings />} />
            <Route path="plans" element={<Plans />} />
            <Route path="admin" element={<RequireAuth admin><Admin /></RequireAuth>} />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}

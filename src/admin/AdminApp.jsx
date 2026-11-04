import AdminLayout from './components/AdminLayout.jsx';
import { ToastProvider } from './components/ui.jsx';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { useHashRoute } from './lib/router.js';
import { MODE } from './lib/supabase.js';
import Overview from './pages/Overview.jsx';
import ComingSoon, { COMING_SOON_ROUTES } from './pages/ComingSoon.jsx';
import ExpensesPage from './pages/expenses/ExpensesPage.jsx';
import {
  AuthError, Forbidden, Loading, MfaEnroll, MfaVerify, NotConfigured, SetNewPassword, SignIn, UnsafeKey,
} from './pages/auth/AuthScreens.jsx';

function Page({ route }) {
  if (route.startsWith('/expenses')) return <ExpensesPage route={route} />;
  if (COMING_SOON_ROUTES.includes(route)) return <ComingSoon route={route} />;
  return <Overview />;
}

function Gate() {
  const { stage } = useAuth();
  const route = useHashRoute();
  switch (stage) {
    case 'loading':
      return <Loading />;
    case 'signed_out':
      return <SignIn />;
    case 'forbidden':
      return <Forbidden />;
    case 'mfa_enroll':
      return <MfaEnroll />;
    case 'mfa_verify':
      return <MfaVerify />;
    case 'set_password':
      return <SetNewPassword />;
    case 'error':
      return <AuthError />;
    default:
      return (
        <AdminLayout route={route}>
          <Page route={route} />
        </AdminLayout>
      );
  }
}

export default function AdminApp() {
  if (MODE === 'unsafe') return <UnsafeKey />;
  if (MODE === 'unconfigured') return <NotConfigured />;
  return (
    <AuthProvider>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </AuthProvider>
  );
}

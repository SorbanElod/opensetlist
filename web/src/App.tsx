import type { ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { AuthProvider, useAuth } from './auth/AuthContext';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ThemeProvider } from './theme/ThemeContext';

function LoadingScreen() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-bg text-muted">
      Loading…
    </main>
  );
}

// Session gate: every route except /login and /register sits behind this.
// A deep link while logged out lands here first and bounces to /login.
function RequireAuth({ children }: { children: ReactElement }) {
  const auth = useAuth();
  if (auth.status === 'loading') return <LoadingScreen />;
  if (auth.status === 'unauthenticated')
    return <Navigate to="/login" replace />;
  return children;
}

// Logged-in users have no business on the auth pages.
function RedirectIfAuthenticated({ children }: { children: ReactElement }) {
  const auth = useAuth();
  if (auth.status === 'loading') return <LoadingScreen />;
  if (auth.status === 'authenticated') return <Navigate to="/" replace />;
  return children;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthenticated>
            <LoginPage />
          </RedirectIfAuthenticated>
        }
      />
      <Route
        path="/register"
        element={
          <RedirectIfAuthenticated>
            <RegisterPage />
          </RedirectIfAuthenticated>
        }
      />
      {/* Catch-all: deep links to not-yet-built routes still pass the gate. */}
      <Route
        path="*"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
    </Routes>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

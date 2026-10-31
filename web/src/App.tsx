import type { ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { AuthProvider, useAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { ArrangementEditorPage } from './pages/ArrangementEditorPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { SongDetailPage } from './pages/SongDetailPage';
import { SongFormPage } from './pages/SongFormPage';
import { SongsPage } from './pages/SongsPage';
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
      {/* Everything else lives in the app shell behind the session gate. */}
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="songs" element={<SongsPage />} />
        <Route path="songs/new" element={<SongFormPage />} />
        <Route path="songs/:id" element={<SongDetailPage />} />
        <Route path="songs/:id/edit" element={<SongFormPage />} />
        <Route
          path="songs/:songId/arrangements/new"
          element={<ArrangementEditorPage />}
        />
        <Route
          path="arrangements/:id/edit"
          element={<ArrangementEditorPage />}
        />
        {/* Unknown deep links land on home (still gated). */}
        <Route path="*" element={<HomePage />} />
      </Route>
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

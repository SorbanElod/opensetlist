import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

import { AppRoutes } from '../App';
import { AuthProvider } from '../auth/AuthContext';
import { ThemeProvider } from '../theme/ThemeContext';

// Renders the real route tree with a memory history (BrowserRouter needs a
// real browser history; MemoryRouter is the test double).
export function renderApp(initialPath = '/') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

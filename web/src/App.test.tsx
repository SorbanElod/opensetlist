// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderApp } from './test/renderApp';
import { stubFetch } from './test/fetchMock';

const USER = {
  id: 'u1',
  email: 'elod@example.com',
  name: 'Előd',
  isSuperadmin: false,
  defaultView: 'chords',
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.dataset.theme = 'dark';
});

describe('session gate', () => {
  it('redirects a deep link to /login when there is no session', async () => {
    stubFetch((path) =>
      path === '/api/auth/me'
        ? { status: 401, body: { message: 'Not authenticated' } }
        : { status: 404, body: {} },
    );

    renderApp('/some-future-route');

    expect(await screen.findByText('Welcome back')).toBeTruthy();
  });

  it('lands in the app shell when the session cookie is valid (refresh keeps the session)', async () => {
    stubFetch((path) =>
      path === '/api/auth/me'
        ? {
            status: 200,
            body: {
              user: USER,
              memberships: [{ groupId: 'g1', role: 'group_manager' }],
            },
          }
        : { status: 404, body: {} },
    );

    renderApp('/');

    expect(await screen.findByText('Előd')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy();
  });
});

describe('login flow', () => {
  it('logs in through the form and lands on the shell', async () => {
    stubFetch((path) => {
      if (path === '/api/auth/me')
        return { status: 401, body: { message: 'Not authenticated' } };
      if (path === '/api/auth/login')
        return {
          status: 200,
          body: {
            user: USER,
            memberships: [{ groupId: 'g1', role: 'group_manager' }],
          },
        };
      return { status: 404, body: {} };
    });

    renderApp('/login');
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'elod@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'hunter2hunter2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Előd')).toBeTruthy();
  });

  it('shows the API error message on a failed login', async () => {
    stubFetch((path) =>
      path === '/api/auth/me'
        ? { status: 401, body: { message: 'Not authenticated' } }
        : { status: 401, body: { message: 'Invalid email or password' } },
    );

    renderApp('/login');
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'elod@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrongwrongwrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Invalid email or password');
  });
});

describe('logout flow', () => {
  it('logs out and returns to /login', async () => {
    stubFetch((path) => {
      if (path === '/api/auth/me')
        return {
          status: 200,
          body: {
            user: USER,
            memberships: [{ groupId: 'g1', role: 'group_manager' }],
          },
        };
      if (path === '/api/auth/logout')
        return { status: 200, body: { status: 'ok' } };
      return { status: 404, body: {} };
    });

    renderApp('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(await screen.findByText('Welcome back')).toBeTruthy();
  });
});

describe('theme', () => {
  it('toggles data-theme on <html> and persists the choice', async () => {
    stubFetch((path) =>
      path === '/api/auth/me'
        ? {
            status: 200,
            body: {
              user: USER,
              memberships: [{ groupId: 'g1', role: 'group_manager' }],
            },
          }
        : { status: 404, body: {} },
    );

    renderApp('/');
    await screen.findByText('Előd');
    fireEvent.click(
      screen.getByRole('button', { name: /switch to light mode/i }),
    );

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('opensetlist-theme')).toBe('light');
  });
});

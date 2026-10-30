// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderApp } from '../test/renderApp';
import { stubFetch } from '../test/fetchMock';

const USER = {
  id: 'u1',
  email: 'elod@example.com',
  name: 'Előd',
  isSuperadmin: false,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function fillValidForm() {
  // Wait for the async session boot to finish and the form to render.
  fireEvent.change(await screen.findByLabelText('Name'), {
    target: { value: 'Előd' },
  });
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'elod@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'hunter2hunter2' },
  });
  fireEvent.change(screen.getByLabelText('Confirm password'), {
    target: { value: 'hunter2hunter2' },
  });
}

describe('register page', () => {
  it('blocks submit with client-side errors and never calls the API when invalid', async () => {
    const fn = stubFetch((path) =>
      path === '/api/auth/me'
        ? { status: 401, body: { message: 'Not authenticated' } }
        : { status: 500, body: {} },
    );

    renderApp('/register');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Create account' }),
    );

    expect(await screen.findByText('Name is required')).toBeTruthy();
    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    expect(
      screen.getByText('Password must be at least 10 characters'),
    ).toBeTruthy();
    expect(
      fn.mock.calls.filter(([p]) => String(p) === '/api/auth/register'),
    ).toHaveLength(0);
  });

  it('maps a 409 onto the email field', async () => {
    stubFetch((path) => {
      if (path === '/api/auth/me')
        return { status: 401, body: { message: 'Not authenticated' } };
      if (path === '/api/auth/register')
        return { status: 409, body: { message: 'Email already registered' } };
      return { status: 404, body: {} };
    });

    renderApp('/register');
    await fillValidForm();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Create account' }),
    );

    expect(await screen.findByText('Email already registered')).toBeTruthy();
  });

  it('maps 400 validation issues onto their fields', async () => {
    stubFetch((path) => {
      if (path === '/api/auth/me')
        return { status: 401, body: { message: 'Not authenticated' } };
      if (path === '/api/auth/register')
        return {
          status: 400,
          body: {
            message: 'Invalid input',
            issues: [{ path: 'email', message: 'Invalid email' }],
          },
        };
      return { status: 404, body: {} };
    });

    renderApp('/register');
    await fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Invalid email')).toBeTruthy();
  });

  it('registers, auto-logs in, and lands on the shell', async () => {
    stubFetch((path) => {
      if (path === '/api/auth/me')
        return { status: 401, body: { message: 'Not authenticated' } };
      if (path === '/api/auth/register')
        return { status: 201, body: { user: USER } };
      return { status: 404, body: {} };
    });

    renderApp('/register');
    await fillValidForm();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Create account' }),
    );

    expect(await screen.findByText('Előd')).toBeTruthy();
  });
});

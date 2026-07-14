// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';

describe('App', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the sign-in screen when there is no session', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 401, headers: { 'content-type': 'application/json' } }),
    );
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument(),
    );
    expect(screen.getByText(/Etsy access is not enabled/i)).toBeInTheDocument();
  });
});

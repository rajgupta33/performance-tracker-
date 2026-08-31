import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Setup from './Setup';

// App.tsx renders <Setup /> whenever isSupabaseConfigured() is false. This file
// used to be a leftover PocketBase connection form whose save handler flipped
// isConfigured to true regardless, letting a visitor walk into an app with no
// backend. These tests pin the replacement's contract.

describe('Setup (backend not configured screen)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports which Supabase variable is missing', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'present-key');
    render(<Setup />);

    expect(screen.getByText('Backend not configured')).toBeInTheDocument();

    const url = screen.getByText('VITE_SUPABASE_URL').closest('li');
    const key = screen.getByText('VITE_SUPABASE_ANON_KEY').closest('li');
    expect(url).toHaveTextContent(/missing/i);
    expect(key).toHaveTextContent(/set/i);
  });

  it('reports both as missing when neither is provided', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    render(<Setup />);

    expect(
      screen.getByText('VITE_SUPABASE_URL').closest('li'),
    ).toHaveTextContent(/missing/i);
    expect(
      screen.getByText('VITE_SUPABASE_ANON_KEY').closest('li'),
    ).toHaveTextContent(/missing/i);
  });

  it('offers no control that would let a visitor past a broken backend', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    render(<Setup />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('does not mention the retired PocketBase backend', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const { container } = render(<Setup />);

    expect(container.textContent).not.toMatch(/pocketbase/i);
    expect(container.textContent).not.toMatch(/openhr/i);
  });
});

import '@testing-library/jest-dom';
import { vi } from 'vitest';

// supabase-js validates these at module initialization. Tests use inert values;
// no request is made unless a test explicitly mocks and invokes the client.
vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

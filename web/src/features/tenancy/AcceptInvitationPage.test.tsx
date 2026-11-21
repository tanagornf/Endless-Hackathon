import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AcceptInvitationPage from './AcceptInvitationPage';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

vi.mock('../../core', () => ({
  EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
  LanguageSwitch: () => null,
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  SectionCard: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  formatDateTime: (value: string) => value,
  useSession: () => ({ status: 'anonymous', businesses: [], selectBusiness: vi.fn(), refresh: vi.fn() }),
  useApiMutation: () => ({ running: false, run: vi.fn() }),
  useApiQuery: (path: string | null) => ({
    loading: !path, error: null, reload: vi.fn(),
    data: path ? {
      businessName: 'Invitation test shop', emailMasked: 'ab**@example.test', role: 'staff',
      expiresAt: '2026-11-30T00:00:00.000Z', permissionsCount: 1,
    } : undefined,
  }),
}));

afterEach(() => {
  cleanup();
  sessionStorage.removeItem('nless.invite');
  window.history.replaceState(null, '', '/');
});

describe('public invitation acceptance', () => {
  it('scrubs the URL and offers sign-in and signup without putting the token in either link', () => {
    const token = 'a'.repeat(43);
    window.history.replaceState({ marker: true }, '', '/invitations/accept?token=' + token);
    render(<MemoryRouter><AcceptInvitationPage /></MemoryRouter>);

    expect(window.location.pathname).toBe('/invitations/accept');
    expect(window.location.search).toBe('');
    expect(window.history.state).toEqual({ marker: true });
    expect(sessionStorage.getItem('nless.invite')).toBe(token);
    const signIn = screen.getByRole('link', { name: 'accept.signIn' });
    expect(signIn.getAttribute('href')).toBe('/login?next=/invitations/accept');
    const signUp = screen.getByRole('link', { name: 'accept.signUp' });
    expect(signUp.getAttribute('href')).toBe('/signup?invite=1');
    expect(screen.getByRole('button', { name: 'accept.decline' })).toBeDefined();
  });
});

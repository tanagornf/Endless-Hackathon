import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import OnboardingPage from './OnboardingPage';

const state = vi.hoisted(() => ({ id: 'shop-a', flags: vi.fn() }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../core', () => ({
  EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  SectionCard: ({ title, children }: { title: string; children: ReactNode }) => <section aria-label={title}>{children}</section>,
  useSession: () => ({ currentBusiness: { id: state.id }, permissions: ['business.read', 'product.read', 'business.channels'] }),
  useApiQuery: (path: string, options: unknown) => {
    state.flags(path, options);
    return { loading: false, error: null, data: { items: [
      { featureId: 'F04', visible: true, placeholder: false },
      { featureId: 'F05', visible: false, placeholder: false },
      { featureId: 'F08', visible: true, placeholder: true },
      { featureId: 'F17', visible: true, placeholder: false },
      { featureId: 'F09', visible: true, placeholder: false },
    ] } };
  },
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  state.id = 'shop-a';
  state.flags.mockClear();
});

it('shows available steps and remembers checklist progress per business', () => {
  const page = () => <MemoryRouter><OnboardingPage /></MemoryRouter>;
  const { rerender } = render(page());
  const businessStep = screen.getByRole('region', { name: 'onboarding.step.business' });
  const checkbox = within(businessStep).getByRole<HTMLInputElement>('checkbox');
  expect(within(businessStep).getByRole('link').getAttribute('href')).toBe('/business');
  expect(screen.queryByRole('region', { name: 'onboarding.step.knowledge' })).toBeNull();
  expect(screen.queryByRole('region', { name: 'onboarding.step.catalog' })).toBeNull();
  expect(screen.queryByRole('region', { name: 'onboarding.step.chat' })).toBeNull();
  expect(state.flags).toHaveBeenCalledWith('/features', { businessScoped: false });
  fireEvent.click(checkbox);
  expect(checkbox.checked).toBe(true);
  expect(localStorage.getItem('nless.onboarding.shop-a')).toBe('["business"]');

  state.id = 'shop-b';
  rerender(page());
  const newShop = screen.getByRole('region', { name: 'onboarding.step.business' });
  expect(within(newShop).getByRole<HTMLInputElement>('checkbox').checked).toBe(false);

  state.id = 'shop-a';
  rerender(page());
  const originalShop = screen.getByRole('region', { name: 'onboarding.step.business' });
  expect(within(originalShop).getByRole<HTMLInputElement>('checkbox').checked).toBe(true);
});

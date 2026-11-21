import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import BusinessPage from './BusinessPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../../core', () => ({
  EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  useSession: () => ({ currentBusiness: { id: 'fixture-business' } }),
  useSlot: (name: string) => name === 'businessTabs' ? [{
    id: 'external-settings',
    labelKey: 'External settings',
    load: async () => ({
      default: ({ businessId }: { businessId: string }) => <p>{'Loaded for ' + businessId}</p>,
    }),
  }] : [],
}));

vi.mock('./HoursPanel', () => ({ default: () => <p>Hours</p> }));
vi.mock('./ProfilePanel', () => ({ default: () => <p>Profile</p> }));

it('renders a registered settings tab with the current business ID', async () => {
  render(<BusinessPage />);
  expect(screen.getByText('Profile')).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: 'External settings' }));
  expect(await screen.findByText('Loaded for fixture-business')).toBeTruthy();
});

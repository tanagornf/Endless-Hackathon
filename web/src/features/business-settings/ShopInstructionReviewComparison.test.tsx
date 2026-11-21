import { render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ShopInstructionReviewComparison from './ShopInstructionReviewComparison';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: { id: string }) => values ? `${key} ${values.id}` : key }),
}));

it('shows both exact texts and identifiers with preserved line breaks', () => {
  render(<ShopInstructionReviewComparison
    current={{ versionLabel: 'version 12', instruction: 'Ask for a receipt.' }}
    proposed={{ versionLabel: 'candidate 13', instruction: 'Ask for an order number.\nตรวจเลขคำสั่งซื้อ' }}
  />);

  const current = within(screen.getByRole('region', { name: 'shopInstructions.current' }));
  const proposed = within(screen.getByRole('region', { name: 'shopInstructions.proposed' }));
  expect(current.getByText('version 12')).toBeTruthy();
  expect(proposed.getByText('candidate 13')).toBeTruthy();
  expect(current.getByText('Ask for a receipt.')).toBeTruthy();
  expect(proposed.getByText(/Ask for an order number/).textContent).toBe('Ask for an order number.\nตรวจเลขคำสั่งซื้อ');
  expect(proposed.getByText('shopInstructions.changed')).toBeTruthy();
});

it('shows an empty current instruction when a proposed version is the first one', () => {
  render(<ShopInstructionReviewComparison current={null}
    proposed={{ versionLabel: 'candidate 1', instruction: 'Check the order number.' }} />);

  const current = within(screen.getByRole('region', { name: 'shopInstructions.current' }));
  expect(current.getByText('shopInstructions.noCurrent')).toBeTruthy();
  expect(screen.getByText('Check the order number.')).toBeTruthy();
});

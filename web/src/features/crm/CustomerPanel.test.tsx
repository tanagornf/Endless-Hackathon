import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { CustomerPanelData } from '@nless/shared/features/crm/types';
import i18n, { i18nReady } from '../../core/i18n';
import CustomerPanel from './CustomerPanel';

const mocks = vi.hoisted(() => ({ run: vi.fn().mockResolvedValue({}), reload: vi.fn(), read: vi.fn(), mutation: vi.fn() }));
vi.mock('../../core', async () => ({
  ...await import('../../core/ui'), ...await import('../../core/format'),
  useApiQuery: (path: string) => mocks.read(path),
  useApiMutation: (method: string, path: unknown) => { mocks.mutation(method, path); return { run: mocks.run, running: false }; },
  useRealtime: vi.fn(),
}));

const record: CustomerPanelData = {
  customerId: 'customer-a', canEditTags: true, canCreateTags: true,
  availableTags: [{ id: 'vip', name: 'VIP', color: 'amber' }, { id: 'regular', name: 'Regular', color: 'grey' }], mergeCandidateCount: 0,
  detail: {
    id: 'customer-a', displayName: 'A Customer One', channel: 'line', externalIdMasked: '…0001',
    tags: [{ id: 'vip', name: 'VIP', source: 'manual', color: 'amber' }], lastSeenAt: null, firstSeenAt: null, phone: null,
    marketingConsent: 'granted', memberCount: 1, contact: { phone: null, email: null, address: null }, note: null, profileVersion: 1,
    members: [], consent: { status: 'granted', source: 'seed', updatedAt: null, history: [] }, lastConversationId: null
},
};
beforeEach(async () => { await i18nReady; await i18n.changeLanguage('en'); vi.clearAllMocks(); });
afterEach(cleanup);
function show(data: CustomerPanelData) {
  mocks.read.mockReturnValue({ data, error: null, reload: mocks.reload });
  return render(<MemoryRouter><CustomerPanel conversationId="conversation-a" /></MemoryRouter>);
}
test('staff can select an existing tag and cannot create one without management permission', async () => {
  show({ ...record, canCreateTags: false });
  expect(mocks.read).toHaveBeenCalledWith('/crm/conversations/conversation-a/panel');
  expect(screen.getByTestId('crm-consent-chip').textContent).toBe('Opted in');
  const input = screen.getByTestId('crm-tag-add');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'New tag' } });
  expect(screen.queryByRole('option', { name: /Create/ })).toBeNull();
  fireEvent.change(input, { target: { value: 'Reg' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Regular' }));
  await waitFor(() => expect(mocks.run).toHaveBeenCalledWith({ tagId: 'regular' }));
});
test('Thai owner can create a tag from the selected conversation', async () => {
  await i18n.changeLanguage('th');
  show(record);
  expect(screen.getByTestId('crm-consent-chip').textContent).toBe('ยินยอมรับข่าวสาร');
  const input = screen.getByTestId('crm-tag-add');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'ลูกค้าประจำ' } });
  fireEvent.click(await screen.findByRole('option', { name: /สร้างแท็ก.*ลูกค้าประจำ/ }));
  await waitFor(() => expect(mocks.run).toHaveBeenCalledWith({ name: 'ลูกค้าประจำ' }));
});
test('read-only staff see the profile without tag actions', async () => {
  show({ ...record, canEditTags: false, canCreateTags: false });
  expect(screen.getByTestId('crm-tag-chip').textContent).toBe('VIP');
  expect(screen.queryByTestId('crm-tag-add')).toBeNull();
});

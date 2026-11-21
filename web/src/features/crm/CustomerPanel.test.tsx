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
  useSession: () => ({ user: { id: 'staff' }, currentBusiness: { id: 'shop' } }),
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
  for (const field of ['phone', 'email', 'note']) expect(screen.getByTestId('crm-' + field).hasAttribute('readonly')).toBe(true);
});

test.each(['th', 'en'] as const)('contact blurs save in order and survive reload in %s', async locale => {
  await i18n.changeLanguage(locale);
  let detail = record.detail;
  mocks.run.mockImplementation(async (patch: { expectedVersion: number; phone?: string; email?: string; note?: string }) => {
    expect(patch.expectedVersion).toBe(detail.profileVersion);
    detail = {
      ...detail, profileVersion: detail.profileVersion + 1, note: patch.note ?? detail.note,
      contact: { ...detail.contact, phone: patch.phone ?? detail.contact.phone, email: patch.email ?? detail.contact.email },
    };
    return detail;
  });
  const panel = show(record);
  const fields = { phone: '0800000001', email: 'synthetic@example.test', note: 'Synthetic contact note' };
  for (const [field, value] of Object.entries(fields)) {
    const input = screen.getByTestId('crm-' + field);
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
  }
  await waitFor(() => expect(mocks.run).toHaveBeenCalledTimes(3));
  expect(mocks.mutation).toHaveBeenCalledWith('PATCH', '/crm/customers/customer-a/profile');
  expect(mocks.run.mock.calls.map(call => call[0])).toEqual([
    { expectedVersion: 1, phone: fields.phone }, { expectedVersion: 2, email: fields.email }, { expectedVersion: 3, note: fields.note },
  ]);
  panel.unmount();
  show({ ...record, detail });
  expect(screen.getByLabelText(locale === 'en' ? 'Staff note' : 'บันทึกของพนักงาน').getAttribute('aria-busy')).toBe('false');
  for (const [field, value] of Object.entries(fields)) {
    expect((screen.getByTestId('crm-' + field) as HTMLInputElement).value).toBe(value);
  }
});

test('realtime reload preserves an unfinished draft only within its own conversation', async () => {
  const view = show(record);
  fireEvent.change(screen.getByTestId('crm-phone'), { target: { value: '0800000002' } });
  mocks.read.mockReturnValue({ data: undefined, error: null, reload: mocks.reload });
  view.rerender(<MemoryRouter><CustomerPanel conversationId="conversation-a" /></MemoryRouter>);
  expect((screen.getByTestId('crm-phone') as HTMLInputElement).value).toBe('0800000002');
  view.rerender(<MemoryRouter><CustomerPanel conversationId="conversation-b" /></MemoryRouter>);
  expect(screen.queryByTestId('crm-phone')).toBeNull();
  expect(mocks.run).not.toHaveBeenCalled();
});

test('a version conflict reloads the profile and asks staff to review it in Thai', async () => {
  await i18n.changeLanguage('th');
  mocks.run.mockRejectedValueOnce(Object.assign(new Error('Conflict'), { code: 'VERSION_CONFLICT' }));
  show(record);
  const input = screen.getByTestId('crm-email');
  fireEvent.change(input, { target: { value: 'synthetic@example.test' } });
  fireEvent.blur(input);
  await waitFor(() => expect(mocks.reload).toHaveBeenCalledOnce());
  expect(screen.getByRole('alert').textContent).toContain('ตรวจสอบข้อมูลล่าสุด');
  expect((input as HTMLInputElement).value).toBe('');
});

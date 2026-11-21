import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import ShopInstructionReviewPanel from './ShopInstructionReviewPanel';

const api = vi.hoisted(() => ({ query: vi.fn(), publish: vi.fn(), rollback: vi.fn(), reload: vi.fn(), role: 'owner' }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, values?: { id: string }) => values ? `${key} ${values.id}` : key }),
}));

vi.mock('../../core', () => ({
  useSession: () => ({
    currentBusiness: { id: 'shop-a' },
    businesses: [{ business: { id: 'shop-a' }, role: api.role }],
  }),
  useApiQuery: (path: string) => api.query(path),
  useApiMutation: (_method: string, path: string) => ({
    run: (input: { expectedActiveVersionId: string | null }) =>
      (path.endsWith('/publish') ? api.publish : api.rollback)(path, input),
    running: false,
  }),
  formatDateTime: (date: string) => date,
  SectionCard: ({ title, children }: { title: string; children: ReactNode }) => <section aria-label={title}>{children}</section>,
  EmptyState: ({ title, action }: { title: string; action?: ReactNode }) => <div>{title}{action}</div>,
  ConfirmDialog: ({ open, title, message, confirmLabel, onConfirm, onClose }: {
    open: boolean; title: string; message: ReactNode; confirmLabel: string;
    onConfirm: () => Promise<void>; onClose: () => void;
  }) => open && <div role="dialog" aria-label={title}>
    {message}
    <button onClick={() => { void onConfirm().then(onClose, () => {}); }}>{confirmLabel}</button>
    <button onClick={onClose}>Cancel</button>
  </div>,
}));

const createdAt = '2026-11-21T08:00:00Z';
const active = { id: 'revision-two', parentVersionId: 'revision-one', instruction: 'Use the order number.', createdAt };
const previous = { id: 'revision-one', parentVersionId: null, instruction: 'ใช้เลขใบเสร็จ', createdAt };
const candidate = { id: 'candidate-one', baseVersionId: active.id, instruction: 'Check the order number first.', reason: 'Owner correction', createdAt };
const view = { activeVersionId: active.id, candidates: [candidate], versions: [active, previous] };

function query(data = view) {
  api.query.mockReturnValue({ data, loading: false, error: null, reload: api.reload });
}

function click(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

beforeEach(() => {
  vi.resetAllMocks();
  api.role = 'owner';
  query();
  api.publish.mockResolvedValue(active);
  api.rollback.mockResolvedValue(active);
});

afterEach(cleanup);

it('does not query instruction data for staff', () => {
  api.role = 'staff';
  render(<ShopInstructionReviewPanel />);
  expect(api.query).not.toHaveBeenCalled();
});

it('shows loading, retry, and empty states', () => {
  api.query.mockReturnValue({ loading: true, error: null, reload: api.reload });
  const { rerender } = render(<ShopInstructionReviewPanel />);
  expect(screen.getByRole('status', { name: 'shopInstructions.loading' })).toBeTruthy();

  api.query.mockReturnValue({ loading: false, error: { error: { code: 'INTERNAL_ERROR' } }, reload: api.reload });
  rerender(<ShopInstructionReviewPanel />);
  expect(screen.getByText('shopInstructions.loadError')).toBeTruthy();
  click('settings.retry');
  expect(api.reload).toHaveBeenCalledOnce();

  query({ activeVersionId: 'revision-two', candidates: [], versions: [active] });
  rerender(<ShopInstructionReviewPanel />);
  expect(screen.getByText('shopInstructions.noCandidates')).toBeTruthy();
});

it('requires explicit confirmation and publishes only the candidate and base shown to the owner', async () => {
  render(<ShopInstructionReviewPanel />);
  const proposed = screen.getByRole('region', { name: 'shopInstructions.proposed' });
  expect(within(proposed).getByText(candidate.instruction)).toBeTruthy();
  expect(api.publish).not.toHaveBeenCalled();

  click('shopInstructions.publish');
  const dialog = screen.getByRole('dialog', { name: 'shopInstructions.confirmPublishTitle' });
  expect(within(dialog).getByText(`shopInstructions.confirmPublishMessage ${candidate.id}`)).toBeTruthy();
  expect(api.publish).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'shopInstructions.confirmPublish' }));
  await waitFor(() => expect(api.publish).toHaveBeenCalledExactlyOnceWith(
    `/settings/shop-instructions/candidates/${candidate.id}/publish`,
    { expectedActiveVersionId: active.id },
  ));
  expect(api.reload).toHaveBeenCalledOnce();
  expect(screen.getByText('shopInstructions.published')).toBeTruthy();
});

it('disables an outdated candidate and refreshes a conflict without resubmitting it', async () => {
  query({ ...view, candidates: [{ ...candidate, baseVersionId: previous.id }] });
  const { rerender } = render(<ShopInstructionReviewPanel />);
  expect((screen.getByRole('button', { name: 'shopInstructions.publish' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('shopInstructions.staleCandidate')).toBeTruthy();

  query();
  rerender(<ShopInstructionReviewPanel />);
  api.publish.mockRejectedValue(Object.assign(new Error('Version conflict'), { failure: { error: { code: 'VERSION_CONFLICT' } } }));
  click('shopInstructions.publish');
  click('shopInstructions.confirmPublish');
  await waitFor(() => expect(screen.getByText('shopInstructions.conflict')).toBeTruthy());
  expect(api.reload).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(api.publish).toHaveBeenCalledOnce();
});

it('shows history and confirms rollback to the selected earlier version', async () => {
  render(<ShopInstructionReviewPanel />);
  const history = screen.getByRole('button', { name: new RegExp(`shopInstructions.versionId ${previous.id}`) });
  fireEvent.click(history);
  expect(screen.getByText(previous.instruction)).toBeTruthy();
  click('shopInstructions.rollback');
  const dialog = screen.getByRole('dialog', { name: 'shopInstructions.confirmRollbackTitle' });
  expect(within(dialog).getByText(`shopInstructions.confirmRollbackMessage ${previous.id}`)).toBeTruthy();
  expect(api.rollback).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'shopInstructions.confirmRollback' }));
  await waitFor(() => expect(api.rollback).toHaveBeenCalledExactlyOnceWith(
    `/settings/shop-instructions/versions/${previous.id}/rollback`,
    { expectedActiveVersionId: active.id },
  ));
  expect(screen.getByText('shopInstructions.rolledBack')).toBeTruthy();
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OwnerConsultPanel from './OwnerConsultPanel';

const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../core', () => ({
  SectionCard: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
  useApiQuery: () => ({
    data: { actionStepId: 'initial', version: 1, state: 'pending', question: 'Do we replace missing parts?' },
    error: null,
  }),
  useApiMutation: () => ({ run: mocks.run, running: false }),
}));

afterEach(() => {
  cleanup();
  mocks.run.mockReset();
});

describe('owner consultation panel', () => {
  it('defaults to case-only and reuses the request ID for an identical retry', async () => {
    mocks.run.mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({ state: 'answered', reuse: 'case_only' });
    render(<OwnerConsultPanel caseId="case-id" />);
    expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(false);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'We replace missing parts.' } });
    fireEvent.click(screen.getByRole('button', { name: 'consult.submit' }));
    await screen.findByText('consult.saveError');
    fireEvent.click(screen.getByRole('button', { name: 'consult.submit' }));
    await screen.findByText('consult.saved');
    expect(mocks.run).toHaveBeenCalledTimes(2);
    expect(mocks.run.mock.calls[0][0]).toEqual(mocks.run.mock.calls[1][0]);
    expect(mocks.run.mock.calls[0][0]).toMatchObject({ reuse: 'case_only', expectedVersion: 1, actionStepId: 'initial' });
  });

  it('sends draft permission only after the owner explicitly selects it', async () => {
    mocks.run.mockResolvedValue({ state: 'answered', reuse: 'propose_draft' });
    render(<OwnerConsultPanel caseId="case-id" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'We replace missing parts.' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'consult.submit' }));
    await waitFor(() => expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ reuse: 'propose_draft' })));
    await screen.findByText('consult.savedDraftPermission');
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OwnerConsultPanel from './OwnerConsultPanel';

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  view: { actionStepId: 'initial', version: 1, state: 'pending', language: 'en',
    question: 'Do we replace missing parts?', answerPrompts: ['Do we replace missing parts?'] },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../core', () => ({
  SectionCard: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  EmptyState: ({ title }: { title: string }) => <p>{title}</p>,
  useApiQuery: () => ({ data: mocks.view, error: null }),
  useApiMutation: () => ({ run: mocks.run, running: false }),
}));

afterEach(() => {
  cleanup();
  mocks.run.mockReset();
  mocks.view.answerPrompts = ['Do we replace missing parts?'];
});

describe('owner consultation panel', () => {
  it('defaults to case-only, keeps private rationale separate, and reuses the request ID on retry', async () => {
    mocks.run.mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({ state: 'answered', reuse: 'case_only' });
    render(<OwnerConsultPanel caseId="case-id" />);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'consult.allowDraft' }).checked).toBe(false);
    fireEvent.change(screen.getByRole('textbox', { name: 'consult.answer' }), { target: { value: 'We replace missing parts.' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'consult.privateRationale' }), { target: { value: 'One-time exception.' } });
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'consult.submit' });
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'consult.customerReady' }));
    fireEvent.click(submit);
    await screen.findByText('consult.saveError');
    fireEvent.click(submit);
    await screen.findByText('consult.saved');
    expect(mocks.run).toHaveBeenCalledTimes(2);
    expect(mocks.run.mock.calls[0][0]).toEqual(mocks.run.mock.calls[1][0]);
    expect(mocks.run.mock.calls[0][0]).toMatchObject({
      answer: 'We replace missing parts.', privateRationale: 'One-time exception.', customerReady: true,
      reuse: 'case_only', expectedVersion: 1, actionStepId: 'initial',
    });
  });

  it('sends draft permission only after the owner explicitly selects it', async () => {
    mocks.run.mockResolvedValue({ state: 'answered', reuse: 'propose_draft' });
    render(<OwnerConsultPanel caseId="case-id" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'consult.answer' }), { target: { value: 'We replace missing parts.' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'consult.customerReady' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'consult.allowDraft' }));
    fireEvent.click(screen.getByRole('button', { name: 'consult.submit' }));
    await waitFor(() => expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ reuse: 'propose_draft' })));
    await screen.findByText('consult.savedDraftPermission');
  });

  it('keeps a two-part reply pending even with review checked until both parts are filled', () => {
    mocks.view.answerPrompts = ['Can I replace it?', 'Who pays shipping?'];
    render(<OwnerConsultPanel caseId="case-id" />);
    const [first] = screen.getAllByRole('textbox', { name: 'consult.answerPart' });
    fireEvent.change(first!, { target: { value: 'We replace it.' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'consult.customerReady' }));
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'consult.submit' });
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(mocks.run).not.toHaveBeenCalled();
  });
});

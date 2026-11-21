import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it, vi } from 'vitest';
import SavedRetrievalCases from './SavedRetrievalCases';
import en from './i18n/en.json';
import th from './i18n/th.json';

const mocked = vi.hoisted(() => ({ canWrite: true, create: vi.fn(), remove: vi.fn(), reload: vi.fn(), success: vi.fn() }));
const item = { id: 'synthetic-knowledge', title: 'Demo hours' };
const existing = { id: 'synthetic-case', query: 'Existing test question', expectNone: true, expectTitles: [], expectItemIds: [] };

vi.mock('../../core', async (load) => ({
  ...await load<typeof import('../../core')>(),
  useApiQuery: (url: string | null) => ({ data: { items: url?.startsWith('/knowledge/items') ? [item] : [existing] },
    loading: false, error: null, reload: mocked.reload }),
  useApiMutation: (method: string) => ({ run: method === 'POST' ? mocked.create : mocked.remove, running: false, error: null }),
  useCan: () => mocked.canWrite,
  useToast: () => ({ success: mocked.success }),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); mocked.canWrite = true; });

async function show(lang: 'en' | 'th') {
  const i18n = createInstance();
  const labels = lang === 'en' ? en : th;
  await i18n.init({ lng: lang, fallbackLng: false, resources: { [lang]: { 'knowledge-search': labels } } });
  render(<I18nextProvider i18n={i18n}><SavedRetrievalCases query="Current question" /></I18nextProvider>);
  return labels;
}

it('saves an English question with selected knowledge and confirms deletion', async () => {
  const labels = await show('en');
  fireEvent.click(screen.getByRole('button', { name: labels.cases.saveAs }));
  const dialog = within(screen.getByRole('dialog', { name: labels.cases.saveAs }));
  const question = dialog.getByRole<HTMLInputElement>('textbox', { name: labels.search.question });
  expect(question.value).toBe('Current question');
  fireEvent.click(dialog.getByRole('button', { name: labels.cases.save }));
  expect(await dialog.findByText(labels.cases.expectationRequired)).toBeTruthy();
  fireEvent.mouseDown(dialog.getByRole('combobox', { name: labels.cases.expected }));
  fireEvent.click(await screen.findByRole('option', { name: item.title }));
  fireEvent.click(dialog.getByRole('button', { name: labels.cases.save }));
  await waitFor(() => expect(mocked.create).toHaveBeenCalledWith({ query: 'Current question', expectNone: false, expectItemIds: [item.id] }));
  await waitFor(() => expect(mocked.success).toHaveBeenCalledWith(labels.cases.saved));
  fireEvent.click(await screen.findByRole('button', { name: labels.cases.delete }));
  const confirmation = within(await screen.findByRole('dialog', { name: labels.cases.deleteTitle }));
  fireEvent.click(confirmation.getByRole('button', { name: labels.cases.delete }));
  await waitFor(() => expect(mocked.remove).toHaveBeenCalledWith(existing.id));
  await waitFor(() => expect(mocked.reload).toHaveBeenCalledTimes(2));
});

it('saves a Thai no-result case with a localized confirmation', async () => {
  const labels = await show('th');
  fireEvent.click(screen.getByRole('button', { name: labels.cases.saveAs }));
  const dialog = within(screen.getByRole('dialog', { name: labels.cases.saveAs }));
  fireEvent.change(dialog.getByRole('textbox', { name: labels.search.question }), { target: { value: 'คำถามทดสอบ' } });
  fireEvent.click(dialog.getByRole('checkbox', { name: labels.cases.none }));
  expect(dialog.queryByRole('combobox')).toBeNull();
  fireEvent.click(dialog.getByRole('button', { name: labels.cases.save }));
  await waitFor(() => expect(mocked.create).toHaveBeenCalledWith({ query: 'คำถามทดสอบ', expectNone: true, expectItemIds: [] }));
  await waitFor(() => expect(mocked.success).toHaveBeenCalledWith(labels.cases.saved));
});

it('keeps read-only staff able to see cases without the write controls', async () => {
  mocked.canWrite = false;
  const labels = await show('th');
  expect(screen.getByText(existing.query)).toBeTruthy();
  expect(screen.queryByRole('button', { name: labels.cases.saveAs })).toBeNull();
  expect(screen.queryByRole('button', { name: labels.cases.delete })).toBeNull();
});

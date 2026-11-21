import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import KnowledgeEditPage from './KnowledgeEditPage';
import en from './i18n/en.json';
import th from './i18n/th.json';

const mocked = vi.hoisted(() => ({ role: 'owner', activate: vi.fn(), reload: vi.fn(), revise: vi.fn() }));
const shop = { id: 'synthetic-shop' };
const pending = {
  id: 'synthetic-consult-draft', source: 'owner-consult', kind: 'faq', status: 'draft', indexState: 'not_started',
  revision: 1, title: 'Synthetic general question', body: 'Reusable material', folderId: null,
  mutable: true, warnings: [], webSuggestion: null,
};

vi.mock('../../core', async (load) => ({
  ...await load<typeof import('../../core')>(),
  useSession: () => ({ currentBusiness: shop, businesses: [{ business: shop, role: mocked.role }] }),
  useCan: () => true,
  useApiQuery: (path: string) => ({ data: path.includes('/items/') ? mocked.revise() : { items: [] },
    error: null, loading: false, reload: mocked.reload }),
  useApiMutation: (_method: string, path: string) => ({ run: path.endsWith('/activate') ? mocked.activate : vi.fn(), running: false }),
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
  useRealtime: () => {},
}));

afterEach(() => { cleanup(); vi.resetAllMocks(); mocked.role = 'owner'; });

async function present(lang: 'en' | 'th') {
  const i18n = createInstance();
  const labels = lang === 'en' ? en : th;
  await i18n.init({ lng: lang, fallbackLng: false, resources: { [lang]: { knowledge: labels } } });
  function view() {
    return <I18nextProvider i18n={i18n}><MemoryRouter initialEntries={['/knowledge/' + pending.id]}>
      <Routes><Route path="/knowledge/:itemId" element={<KnowledgeEditPage />} /></Routes>
    </MemoryRouter></I18nextProvider>;
  }
  mocked.revise.mockReturnValue(pending);
  const rendered = render(view());
  return { labels, rerender: () => rendered.rerender(view()) };
}

it.each(['en', 'th'] as const)('pins the revision the shop owner actually reviewed in %s', async (lang) => {
  const { labels, rerender } = await present(lang);
  fireEvent.click(await screen.findByRole('button', { name: labels.ownerConsult.approve }));
  const dialog = within(screen.getByRole('dialog', { name: labels.ownerConsult.approveTitle }));
  expect(dialog.getByText(labels.ownerConsult.approveMessage.replace('{{revision}}', '1'))).toBeTruthy();
  const changed = { ...pending, revision: 2 };
  mocked.revise.mockReturnValue(changed);
  rerender();
  mocked.activate.mockRejectedValue({ code: 'VERSION_CONFLICT' });
  fireEvent.click(dialog.getByRole('button', { name: labels.ownerConsult.approve }));
  await waitFor(() => expect(mocked.activate).toHaveBeenCalledWith({ expectedRevision: 1, acknowledgeModeration: false }));
});

it('conceals owner approval even from staff who can edit the draft', async () => {
  mocked.role = 'staff';
  const { labels } = await present('en');
  expect(await screen.findByText(labels.ownerConsult.pending)).toBeTruthy();
  expect(screen.queryByRole('button', { name: labels.ownerConsult.approve })).toBeNull();
  expect(screen.getByRole('button', { name: labels.actions.save })).toBeTruthy();
});

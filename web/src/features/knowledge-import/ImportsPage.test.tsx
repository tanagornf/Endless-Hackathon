import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import ImportsPage from './ImportsPage';
import en from './i18n/en.json';
import th from './i18n/th.json';

const state = vi.hoisted(() => ({
  loading: false, failed: false, write: true, reload: vi.fn(), upload: vi.fn(),
}));

vi.mock('../../core', async importOriginal => {
  const core = await importOriginal<typeof import('../../core')>();
  return {
    ...core,
    api: { ...core.api, upload: state.upload, biz: (path: string) => '/businesses/shop-a' + path },
    useCan: () => state.write,
    useSession: () => ({ currentBusiness: { id: 'shop-a' } }),
    useApiQuery: () => ({
      data: state.loading || state.failed ? undefined : { items: [], nextCursor: null },
      loading: state.loading, error: state.failed ? { error: { code: 'INTERNAL' } } : null, reload: state.reload,
    }),
  };
});

afterEach(() => {
  cleanup();
  state.loading = state.failed = false;
  state.write = true;
  state.reload.mockReset();
  state.upload.mockReset();
});

async function screenIn(language: 'en' | 'th') {
  const i18n = createInstance();
  await i18n.init({
    lng: language, fallbackLng: false,
    resources: { en: { 'knowledge-import': en }, th: { 'knowledge-import': th } },
  });
  return render(<I18nextProvider i18n={i18n}><MemoryRouter initialEntries={['/imports']}>
    <Routes>
      <Route path="/imports" element={<ImportsPage />} />
      <Route path="/imports/:id" element={<p>Preview destination</p>} />
    </Routes>
  </MemoryRouter></I18nextProvider>);
}

it('renders the English empty state and uploads an actual File in multipart form', async () => {
  await screenIn('en');
  expect(screen.getByText('No imports yet')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'New import' }));
  const file = new File(['SKU,Name,Price\nF06-TEST,Demo,50'], 'sample.csv', { type: 'text/csv' });
  fireEvent.change(screen.getByTestId('import-file'), { target: { files: [file] } });
  state.upload.mockResolvedValue({ id: 'fixture-import' });
  fireEvent.click(screen.getByRole('button', { name: 'Upload' }));
  await waitFor(() => expect(state.upload).toHaveBeenCalledTimes(1));
  const [url, form] = state.upload.mock.calls[0] as [string, FormData];
  expect(url).toBe('/businesses/shop-a/imports/file');
  expect(form.get('file')).toMatchObject({ name: 'sample.csv' });
  expect(await screen.findByText('Preview destination')).toBeTruthy();
});

it('renders Thai labels without an upload action for read-only staff', async () => {
  state.write = false;
  await screenIn('th');
  expect(screen.getByRole('heading', { name: 'นำเข้าข้อมูล' })).toBeTruthy();
  expect(screen.getByText('ยังไม่เคยนำเข้า')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'นำเข้าใหม่' })).toBeNull();
});

it('renders loading without treating it as an empty result', async () => {
  state.loading = true;
  await screenIn('en');
  expect(screen.getByRole('progressbar')).toBeTruthy();
  expect(screen.queryByText('No imports yet')).toBeNull();
});

it('renders the retry action when the history request fails', async () => {
  state.failed = true;
  await screenIn('en');
  expect(screen.getByText('Could not load import data.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(state.reload).toHaveBeenCalledOnce();
});

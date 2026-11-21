import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n, { i18nReady } from '../i18n';
import { ToastProvider } from '../ui';
import OpsPage from './OpsPage';
import en from './i18n/en.json';
import th from './i18n/th.json';

vi.mock('../session', () => ({ useSession: () => ({ currentBusiness: null }) }));

const job = {
  id: 'job-synthetic', type: 'test.sleep', state: 'dead', businessId: null, attempts: 3, maxAttempts: 3,
  runAt: '2026-11-21T03:00:00Z', createdAt: '2026-11-21T03:00:00Z', lastError: 'Synthetic timeout',
};
const summary = {
  counts: { queued: 0, running: 0, dead: 1 }, byType24h: [], oldestQueuedAgeSeconds: null,
  worker: { enabled: true, running: true, inFlight: 0, concurrency: 4 },
  demoResetting: false,
  scheduler: { enabled: true, holdsLock: true }, deliveriesNeedingAttention: 0,
};
const build = {
  sha: 'abcdef0123456789', shortSha: 'abcdef0', env: 'test', schema: '1', node: '24',
  uptimeSeconds: 5, startedAt: '2026-11-21T03:00:00Z', modelMode: 'fake',
  providerModes: {}, featuresLoaded: 3, db: { ok: true, latencyMs: 2, poolTotal: 2, poolIdle: 1, poolWaiting: 0 },
  memoryMb: { rss: 80, heapUsed: 30 }, uploadDirWritable: true, devLoginEnabled: false, mcpEnabled: false,
};
const response = (data: unknown) => Response.json({ data });
const show = (tab = 'jobs') => render(<MemoryRouter initialEntries={['/ops?tab=' + tab]}>
  <ToastProvider><OpsPage /></ToastProvider>
</MemoryRouter>);

beforeEach(async () => { await i18nReady; await i18n.changeLanguage('en'); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('operations console', () => {
  it('keeps both translation bundles complete', () => {
    expect(Object.keys(th).sort()).toEqual(Object.keys(en).sort());
  });

  it('requires confirmation before retrying a job through the platform endpoint', async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/ops/summary')) return response(summary);
      if (init?.method === 'POST') return response(job);
      return response({ items: [job], nextCursor: null });
    });
    vi.stubGlobal('fetch', request);
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    const dialog = screen.getByRole('dialog');
    expect(request.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(request.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/v1/ops/jobs/job-synthetic/retry', expect.objectContaining({ method: 'POST' })));
  });

  it('offers a retry after failure and shows the Thai empty state on recovery', async () => {
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (path: string) => {
      if (path.endsWith('/ops/summary')) return response(summary);
      if (!attempts++) return new Response(null, { status: 500 });
      return response({ items: [], nextCursor: null });
    }));
    await i18n.changeLanguage('th');
    show();
    expect(await screen.findByRole('heading', { name: 'เครื่องมือผู้ดูแลระบบ' })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'ลองใหม่' }));
    expect(await screen.findByText('ไม่มีงานตามตัวกรอง')).toBeTruthy();
  });

  it('shows the reason when the environment disables demo reset', async () => {
    vi.stubGlobal('fetch', vi.fn(async (path: string) => path.endsWith('/ops/build')
      ? response({ ...build, demoResetEnabled: false }) : response({ items: [] })));
    show('system');
    const reset = await screen.findByRole('button', { name: 'Reset and re-seed' }) as HTMLButtonElement;
    expect(reset.disabled).toBe(true);
    expect(screen.getByText(/set DEMO_RESET_ENABLED/)).toBeTruthy();
  });

  it('requires exact demo confirmation and keeps Cancel and Escape available when submit is disabled', async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/ops/build')) return response({ ...build, demoResetEnabled: true });
      if (path.endsWith('/ops/summary')) return response(summary);
      if (init?.method === 'POST') return response({
        ok: true, durationMs: 18, steps: [{ name: 'Synthetic seed', ms: 17, ok: true }],
      });
      return response({ items: [], nextCursor: null });
    });
    vi.stubGlobal('fetch', request);
    show('system');
    const openReset = await screen.findByRole('button', { name: 'Reset and re-seed' });
    fireEvent.click(openReset);
    let dialog = screen.getByRole('dialog');
    let submit = within(dialog).getByRole('button', { name: 'Reset and re-seed' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    expect((within(dialog).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(openReset);
    dialog = screen.getByRole('dialog');
    submit = within(dialog).getByRole('button', { name: 'Reset and re-seed' }) as HTMLButtonElement;
    const input = within(dialog).getByRole('textbox', { name: 'Type RESET DEMO to confirm' });
    fireEvent.change(input, { target: { value: 'RESET DEMO ' } });
    fireEvent.submit(submit.form!);
    expect(submit.disabled).toBe(true);
    expect(request.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    fireEvent.change(input, { target: { value: 'RESET DEMO' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(await screen.findByText('Reset finished in 18 ms')).toBeTruthy();
    expect(request).toHaveBeenCalledWith('/api/v1/ops/demo/reset', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ confirm: 'RESET DEMO' }),
    }));
  });

  it('gates feature flag PUT on confirmation and excludes the core feature switch', async () => {
    const feature = { featureId: 'F12', slug: 'message-templates', hidden: false, visible: true, placeholder: false, tier: 'P2' };
    const request = vi.fn(async (_path: string, init?: RequestInit) => init?.method === 'PUT' ? response(feature)
      : response({ items: [feature, { ...feature, featureId: 'F35', slug: 'core/jobs' }] }));
    vi.stubGlobal('fetch', request);
    show('features');
    const toggle = await screen.findByRole('switch', { name: 'Allow F12 in menu' });
    expect(screen.queryByRole('switch', { name: 'Allow F35 in menu' })).toBeNull();
    fireEvent.click(toggle);
    expect(request.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Reason' }), { target: { value: 'Synthetic fixture' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hide' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/v1/ops/features/F12', expect.objectContaining({
      method: 'PUT', body: JSON.stringify({ hidden: true, reason: 'Synthetic fixture' }),
    })));
  });

  it('keeps reset locked until the API reports that the other reset finished', async () => {
    let resetting = false;
    let summaryReads = 0;
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path.endsWith('/ops/build')) return response({ ...build, demoResetEnabled: true });
      if (path.endsWith('/ops/summary')) {
        summaryReads++;
        return response({ ...summary, demoResetting: resetting });
      }
      if (init?.method === 'POST') {
        resetting = true;
        return Response.json({
          error: { code: 'POLICY_BLOCKED', message: 'Synthetic conflict', retryable: false, details: { reason: 'reset_in_progress' } },
          meta: { requestId: 'fixture' },
        }, { status: 422 });
      }
      return response({ items: [], nextCursor: null });
    });
    vi.stubGlobal('fetch', request);
    show('system');
    const reset = await screen.findByRole('button', { name: 'Reset and re-seed' }) as HTMLButtonElement;
    await waitFor(() => expect(summaryReads).toBe(1));
    fireEvent.click(reset);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Type RESET DEMO to confirm' }), { target: { value: 'RESET DEMO' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset and re-seed' }));
    await waitFor(() => {
      expect(summaryReads).toBeGreaterThanOrEqual(2);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(reset.disabled).toBe(true);
    });
    resetting = false;
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(reset.disabled).toBe(false));
    expect(request.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('confirms resending an uncertain delivery and sends only the resolution and note', async () => {
    const row = { messageId: 'msg-fixture', deliveryState: 'unknown', channel: 'facebook', businessId: 'shop-fixture', createdAt: job.createdAt };
    const request = vi.fn(async (_path: string, init?: RequestInit) => init?.method === 'POST'
      ? response({ ...row, deliveryState: 'pending' }) : response({
        items: [row, { ...row, messageId: 'msg-failed', deliveryState: 'failed' }], nextCursor: null,
      }));
    vi.stubGlobal('fetch', request);
    show('deliveries');
    const resend = await screen.findByRole('button', { name: 'Resend' });
    fireEvent.click(resend);
    const dialog = screen.getByRole('dialog');
    expect(request.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Note (no customer data)' }), { target: { value: 'Fixture check' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resend' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/v1/ops/deliveries/msg-fixture/resolve', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ resolution: 'resend', note: 'Fixture check' }),
    })));
  });

  it('keeps both outcome actions available for an uncertain LINE delivery and explains the resend restriction', async () => {
    const row = {
      messageId: 'line-fixture', deliveryState: 'unknown', channel: 'line', businessId: 'shop-fixture', createdAt: job.createdAt,
    };
    const request = vi.fn(async (_path: string, init?: RequestInit) => init?.method === 'POST'
      ? response({ ...row, deliveryState: 'failed' }) : response({ items: [row], nextCursor: null }));
    vi.stubGlobal('fetch', request);
    show('deliveries');
    expect(await screen.findByRole('button', { name: 'Mark as sent' })).toBeTruthy();
    const fail = screen.getByRole('button', { name: 'Mark as failed' });
    expect(screen.queryByRole('button', { name: 'Resend' })).toBeNull();
    expect(screen.getByText('Resend is unavailable for LINE.')).toBeTruthy();
    fireEvent.click(fail);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as failed' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/v1/ops/deliveries/line-fixture/resolve', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ resolution: 'failed' }),
    })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await act(async () => { await i18n.changeLanguage('th'); });
    expect(screen.getByText('ยังส่งข้อความ LINE ซ้ำจากหน้านี้ไม่ได้')).toBeTruthy();
  });
});

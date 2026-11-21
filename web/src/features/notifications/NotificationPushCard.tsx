import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime, SectionCard, useApiMutation, useApiQuery, useSession } from '../../core';

const api = '/notifications/push';
const workerScope = '/api/v1/notifications/';
const userScope = { businessScoped: false, toastOnError: false };

type PushStatus = {
  configured: boolean;
  publicKey: string | null;
  subscriptions: number;
  enrolledOnDevice: boolean;
  lastAckAt: string | null;
  lastAckRef: string | null;
};
type TestResult = { accepted: number; gone: number; failed: number };

function canUsePush(): boolean {
  return window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function storedDevice(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function saveDevice(key: string, device: string | null): void {
  try {
    if (device) localStorage.setItem(key, device);
    else localStorage.removeItem(key);
  } catch { /* Optional persistence for the current device identifier. */ }
}

function vapidApplicationKey(value: string): ArrayBuffer {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const decoded = atob(base64);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
  return bytes.buffer;
}

async function waitForPushWorker() {
  const registration = await navigator.serviceWorker.register(workerScope + 'sw.js', { scope: workerScope });
  const worker = registration.active ?? registration.installing ?? registration.waiting;
  if (!worker) throw new Error('Push worker missing after registration');
  if (worker.state === 'activated') return registration;
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => complete(false), 15000);
    function complete(ready: boolean) {
      window.clearTimeout(timer);
      worker!.removeEventListener('statechange', changed);
      if (ready) resolve();
      else reject(new Error('Push worker did not activate'));
    }
    function changed() {
      if (worker!.state === 'activated') complete(true);
      else if (worker!.state === 'redundant') complete(false);
    }
    worker.addEventListener('statechange', changed);
    changed();
  });
  return registration;
}

export default function NotificationPushCard() {
  const { user } = useSession();
  return user && <DevicePushCard key={user.id} userId={user.id} />;
}

function DevicePushCard({ userId }: { userId: string }) {
  const { t } = useTranslation('notifications');
  const supported = canUsePush();
  const storageKey = 'nless.pushDevice.' + userId;
  const [device, setDevice] = useState(() => storedDevice(storageKey));
  const [permission, setPermission] = useState(supported ? Notification.permission : 'default');
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [setupFailure, setSetupFailure] = useState(false);
  const [error, setError] = useState<string>();
  const [testResult, setTestResult] = useState<TestResult>();
  const [awaitingAckFrom, setAwaitingAckFrom] = useState<string | null>();

  const view = useApiQuery<PushStatus>(supported ? api + '/status' + (device ? '?device=' + encodeURIComponent(device) : '') : null, userScope);
  const enroll = useApiMutation<{ endpoint: string; keys: { p256dh: string; auth: string } }, { ok: true; deviceId: string }>(
    'POST', api + '/subscribe', userScope,
  );
  const remove = useApiMutation<{ endpoint: string }, { ok: true }>('POST', api + '/unsubscribe', userScope);
  const test = useApiMutation<{ device: string }, TestResult>('POST', api + '/test', userScope);
  const configured = view.data?.configured;
  const reload = view.reload;

  useEffect(() => {
    if (!supported || !configured || registration || setupFailure || permission === 'denied') return;
    let active = true;
    void waitForPushWorker().then(async (ready) => {
      const existing = await ready.pushManager.getSubscription();
      if (active) {
        setSubscription(existing);
        setRegistration(ready);
      }
    }).catch(() => { if (active) setSetupFailure(true); });
    return () => { active = false; };
  }, [configured, permission, registration, setupFailure, supported]);

  useEffect(() => {
    if (!supported) return;
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        setPermission(Notification.permission);
        reload();
      }
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [reload, supported]);

  useEffect(() => {
    if (awaitingAckFrom === undefined) return;
    const poll = window.setInterval(reload, 3000);
    const end = window.setTimeout(() => setAwaitingAckFrom(undefined), 30000);
    return () => { window.clearInterval(poll); window.clearTimeout(end); };
  }, [awaitingAckFrom, reload]);

  useEffect(() => {
    const ref = view.data?.lastAckRef;
    if (ref && ref !== awaitingAckFrom) setAwaitingAckFrom(undefined);
  }, [awaitingAckFrom, view.data?.lastAckRef]);

  async function enable() {
    if (!registration || !view.data?.publicKey || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      // Invoke subscribe from the click itself. WebKit requires the active user gesture to show permission.
      const latest = subscription ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidApplicationKey(view.data.publicKey),
      });
      const { keys } = latest.toJSON();
      if (!keys?.p256dh || !keys.auth) throw new Error('Missing browser push keys');
      setSubscription(latest);
      const result = await enroll.run({ endpoint: latest.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } });
      saveDevice(storageKey, result.deviceId);
      setDevice(result.deviceId);
      reload();
    } catch (cause) {
      const reason = (cause as { failure?: { error?: { details?: { reason?: string } } } })?.failure?.error?.details?.reason;
      if (Notification.permission !== 'denied') setError(reason === 'endpoint_not_allowed' ? 'push.endpointNotAllowed' : 'push.setupError');
    } finally {
      setPermission(Notification.permission);
      setBusy(false);
    }
  }

  async function disable() {
    if (!subscription || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await remove.run({ endpoint: subscription.endpoint });
      await subscription.unsubscribe();
      saveDevice(storageKey, null);
      setDevice(null);
      setSubscription(null);
      setTestResult(undefined);
      setAwaitingAckFrom(undefined);
      reload();
    } catch {
      setError('push.setupError');
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    if (!device || test.running) return;
    setError(undefined);
    try {
      setAwaitingAckFrom(view.data?.lastAckRef ?? null);
      setTestResult(await test.run({ device }));
      reload();
    } catch (cause) {
      setAwaitingAckFrom(undefined);
      const reason = (cause as { failure?: { error?: { details?: { reason?: string } } } })?.failure?.error?.details?.reason;
      setError(reason === 'no_subscription' ? 'push.noSubscription' : 'push.setupError');
    }
  }

  const enrolled = Boolean(subscription && view.data?.enrolledOnDevice);
  return <SectionCard title={t('push.title')}>
    <Stack spacing={2}>
      {!supported ? <Alert severity="info">{t('push.unsupported')}</Alert>
        : view.error ? <Alert severity="error" action={<Button onClick={reload}>{t('common:actions.retry')}</Button>}>{t('push.setupError')}</Alert>
          : !view.data ? <CircularProgress size={24} aria-label={t('common:pages.loading')} />
            : !view.data.configured ? <Alert severity="info">{t('push.notConfigured')}</Alert>
              : permission === 'denied' ? <Alert severity="warning">{t('push.denied')}</Alert>
                : setupFailure ? <Alert severity="error" action={<Button onClick={() => setSetupFailure(false)}>{t('common:actions.retry')}</Button>}>{t('push.setupError')}</Alert>
                  : enrolled ? <>
                    <Typography>{t('push.on', { count: view.data.subscriptions })}</Typography>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                      <Button disabled={test.running || busy} onClick={() => void sendTest()}>{t('push.test')}</Button>
                      <Button disabled={busy || test.running} onClick={() => void disable()}>{t('push.disable')}</Button>
                    </Stack>
                    <Typography role="status">{view.data.lastAckAt
                      ? t('push.acked', { when: formatDateTime(view.data.lastAckAt) })
                      : t('push.notAcked')}</Typography>
                  </>
                    : <>
                      <Typography>{t('push.off')}</Typography>
                      <Button variant="contained" disabled={!registration || busy} onClick={() => void enable()}>{t('push.enable')}</Button>
                    </>}
      {error && <Alert severity="error">{t(error)}</Alert>}
      {testResult && <Alert severity="info">{t('push.testResult', testResult)}</Alert>}
    </Stack>
  </SectionCard>;
}

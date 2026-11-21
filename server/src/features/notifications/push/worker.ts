export const pushWorkerScript = String.raw`'use strict';
const opaqueId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const isOpaqueId = (value) => typeof value === 'string' && opaqueId.test(value);

function readPush(event) {
  try {
    return event.data?.json() ?? {};
  } catch {
    return {};
  }
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const payload = readPush(event);
    const noticeId = isOpaqueId(payload.noticeId) ? payload.noticeId : null;
    const ref = isOpaqueId(payload.ref) ? payload.ref : null;
    const body = payload.language === 'en'
      ? 'Open Endless to view your notification.'
      : 'เปิด Endless เพื่อดูการแจ้งเตือน';
    await self.registration.showNotification('Endless', {
      body,
      tag: noticeId ?? ref ?? 'endless-notification',
      data: { noticeId },
    });
    if (ref) {
      await fetch('/api/v1/notifications/push/ack', {
        method: 'POST',
        credentials: 'include',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'nless' },
        body: JSON.stringify({ ref }),
      }).catch(() => {});
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const id = event.notification.data?.noticeId;
    const path = isOpaqueId(id) ? '/notifications/open/' + id : '/notifications';
    const target = new URL(path, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const current = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (current) {
      try {
        const navigated = await current.navigate(target);
        if (navigated) {
          await navigated.focus();
          return;
        }
      } catch {
        // A stale window can be closed while handling the notification.
      }
    }
    await self.clients.openWindow(target);
  })());
});
`;

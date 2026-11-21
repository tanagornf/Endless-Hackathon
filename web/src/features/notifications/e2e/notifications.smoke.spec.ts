import { SEED } from '@nless/shared/core/fixtures';
import type { NotificationFeed, PreferenceRow, UnreadCount } from '@nless/shared/features/notifications/types';
import { expect, setUiLanguage, test } from '../../../../../tests/e2e/fixtures';

const shopA = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!;
const shopB = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!;
const root = '/api/v1/businesses/' + shopA.id + '/notifications';
const headers = { 'X-Requested-With': 'nless' };

for (const locale of ['th', 'en'] as const) {
  test('notification bell publishes and persists a read in ' + locale, async ({ ownerPage, api }) => {
    await setUiLanguage(ownerPage, locale);
    await ownerPage.addInitScript((id) => localStorage.setItem('nless.businessId', id), shopA.id);
    await ownerPage.goto('/notifications');
    await expect(ownerPage.getByRole('heading', { name: locale === 'th' ? 'การแจ้งเตือน' : 'Notifications' })).toBeVisible();
    const bell = ownerPage.getByTestId('notif-bell');
    await expect(bell).toBeVisible();

    const current = await api.get(root + '/unread-count');
    expect(current.ok()).toBe(true);
    const before: UnreadCount = (await current.json()).data;
    const response = ownerPage.waitForResponse((value) => value.url().endsWith(root + '/test') && value.request().method() === 'POST');
    await ownerPage.getByRole('button', {
      name: locale === 'th' ? 'ส่งแจ้งเตือนทดสอบถึงตัวเอง' : 'Send myself a test notification',
    }).click();
    const created = await response;
    expect(created.ok()).toBe(true);
    const { notificationId } = (await created.json()).data as { notificationId: string };
    expect(notificationId).toBeTruthy();

    try {
      await expect(ownerPage.getByTestId('notif-badge')).toHaveText(before.count >= 99 ? '99+' : String(before.count + 1));
      await bell.click();
      await ownerPage.getByTestId('notification-' + notificationId).click();
      await expect.poll(async () => {
        const result = await api.get(root);
        expect(result.ok()).toBe(true);
        const data: NotificationFeed = (await result.json()).data;
        return data.items.find(({ id }) => id === notificationId)?.read;
      }).toBe(true);
      await ownerPage.reload();
      await expect(ownerPage.getByRole('heading', { name: locale === 'th' ? 'การแจ้งเตือน' : 'Notifications' })).toBeVisible();
      const result = await api.get(root);
      const data: NotificationFeed = (await result.json()).data;
      expect(data.items.find(({ id }) => id === notificationId)?.read).toBe(true);
    } finally {
      await api.post(root + '/read', { headers, data: { ids: [notificationId] } });
    }
  });
}

test('notification preferences persist and another shop remains private', async ({ ownerPage, api }) => {
  const path = '/api/v1/notification-preferences';
  const status = async () => {
    const response = await api.get(path);
    expect(response.ok()).toBe(true);
    const items: PreferenceRow[] = (await response.json()).data.items;
    return items.find(({ type }) => type === 'report')!;
  };
  const initial = await status();
  await setUiLanguage(ownerPage, 'en');
  await ownerPage.addInitScript((id) => localStorage.setItem('nless.businessId', id), shopA.id);
  await ownerPage.goto('/notifications');
  await ownerPage.getByRole('tab', { name: 'Settings' }).click();
  const preference = ownerPage.getByLabel('Show Reports in the app');
  try {
    await preference.setChecked(!initial.inApp);
    await expect.poll(async () => (await status()).inApp).toBe(!initial.inApp);
    await ownerPage.reload();
    await ownerPage.getByRole('tab', { name: 'Settings' }).click();
    await expect(preference).toBeChecked({ checked: !initial.inApp });
    expect((await api.get('/api/v1/businesses/' + shopB.id + '/notifications')).status()).toBe(404);
  } finally {
    const { type, inApp, push } = initial;
    expect((await api.put(path, { headers, data: { items: [{ type, inApp, push }] } })).ok()).toBe(true);
  }
});

test('blocked device permission leaves the notification bell usable', async ({ ownerPage }) => {
  await setUiLanguage(ownerPage, 'en');
  await ownerPage.addInitScript((id) => {
    localStorage.setItem('nless.businessId', id);
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'denied' });
  }, shopA.id);
  await ownerPage.goto('/notifications');
  await ownerPage.getByRole('tab', { name: 'Settings' }).click();
  await expect(ownerPage.getByText('Notifications are blocked for Endless on this device.', { exact: false })).toBeVisible();
  await ownerPage.getByTestId('notif-bell').click();
  await expect(ownerPage.getByRole('button', { name: 'View all' })).toBeVisible();
});

import { describe, expect, it, vi } from 'vitest';
import webPush from 'web-push';
import { normalizePushEndpoint, readPushCredentials, sendPrivatePush } from './transport';

const appleEndpoint = 'https://web.push.apple.com/test-subscription';
const noticeId = '6f4f637d-4909-4d33-8a25-78e5748a4e14';
const ref = '99bb9603-452f-4ae9-8a9c-01a1c76dc4f5';
const message = { noticeId, ref, language: 'th' as const, title: 'customer name', body: 'private chat', url: '/raw-conversation' };
const subscription = { endpoint: appleEndpoint, keys: { p256dh: 'test-public', auth: 'test-auth' } };
const keyPair = webPush.generateVAPIDKeys();
const credentials = { ...keyPair, subject: 'mailto:push@example.test' };

describe('notification Web Push transport', () => {
  it('accepts known provider endpoints over HTTPS', () => {
    expect(normalizePushEndpoint(appleEndpoint)).toBe(appleEndpoint);
    expect(normalizePushEndpoint('https://fcm.googleapis.com/fcm/send/example')).toBe('https://fcm.googleapis.com/fcm/send/example');
    expect(normalizePushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/example')).not.toBeNull();
  });

  it.each([
    'http://web.push.apple.com/test',
    'https://web.push.apple.com.evil.example/test',
    'https://evilpush.apple.com/test',
    'https://web.push.apple.com@127.0.0.1/test',
    'https://user@web.push.apple.com/test',
    'https://web.push.apple.com:5443/test',
    'https://storage.googleapis.com/test',
    'https://web.push.apple.com/test#part',
    '//web.push.apple.com/test',
  ])('rejects an unapproved enrollment or delivery endpoint', (endpoint) => {
    expect(normalizePushEndpoint(endpoint)).toBeNull();
  });

  it('requires a matching VAPID key pair and valid contact subject', () => {
    expect(readPushCredentials(credentials)).toEqual(credentials);
    expect(readPushCredentials({ ...credentials, privateKey: '' })).toBeNull();
    expect(readPushCredentials({ ...credentials, publicKey: webPush.generateVAPIDKeys().publicKey })).toBeNull();
    expect(readPushCredentials({ ...credentials, subject: 'http://localhost' })).toBeNull();
  });

  it('sends opaque identifiers and a language only, and classifies provider acceptance separately', async () => {
    const send = vi.fn<typeof webPush.sendNotification>().mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    await expect(sendPrivatePush(subscription, message, credentials, send)).resolves.toEqual({ state: 'accepted', status: 201 });
    const [, payload, options] = send.mock.calls[0]!;
    expect(JSON.parse(payload as string)).toEqual({ noticeId, ref, language: 'th' });
    expect(options).toMatchObject({ TTL: 3600, timeout: 8000, topic: noticeId.replaceAll('-', ''), vapidDetails: credentials });
  });

  it('reuses the Apple authorization token across sends to the same provider origin', async () => {
    const send = vi.spyOn(webPush, 'sendNotification').mockResolvedValue({ statusCode: 201, body: '', headers: {} });
    try {
      await sendPrivatePush(subscription, message, credentials);
      await sendPrivatePush(subscription, { ...message, ref: noticeId }, credentials);
      const first = send.mock.calls[0]?.[2];
      const second = send.mock.calls[1]?.[2];
      expect(first?.headers?.Authorization).toEqual(expect.stringMatching(/^vapid /));
      expect(second?.headers?.Authorization).toBe(first?.headers?.Authorization);
      expect(first?.vapidDetails).toBeUndefined();
    } finally {
      send.mockRestore();
    }
  });

  it.each([
    [302, 'failed'],
    [400, 'failed'],
    [401, 'failed'],
    [403, 'failed'],
    [404, 'gone'],
    [410, 'gone'],
    [429, 'retry'],
    [502, 'retry'],
  ])('classifies push-provider status %s without carrying upstream text', async (statusCode, state) => {
    const send = vi.fn<typeof webPush.sendNotification>().mockRejectedValue({ statusCode, body: 'provider-specific details' });
    await expect(sendPrivatePush(subscription, message, credentials, send)).resolves.toEqual({ state, status: statusCode });
  });

  it('does not dispatch on invalid input and retries a transport interruption', async () => {
    const send = vi.fn<typeof webPush.sendNotification>().mockRejectedValue(new Error('provider connection interrupted'));
    await expect(sendPrivatePush({ ...subscription, endpoint: 'https://127.0.0.1/test' }, message, credentials, send))
      .resolves.toEqual({ state: 'failed' });
    await expect(sendPrivatePush(subscription, { ...message, ref: '/untrusted-link' }, credentials, send))
      .resolves.toEqual({ state: 'failed' });
    expect(send).not.toHaveBeenCalled();
    await expect(sendPrivatePush(subscription, message, credentials, send)).resolves.toEqual({ state: 'retry' });
  });
});

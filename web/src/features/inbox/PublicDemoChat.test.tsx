import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import i18n, { i18nReady } from '../../core/i18n';
import PublicDemoChat from './PublicDemoChat';

vi.mock('./demoTransport', () => ({
  chatRequest: vi.fn(async (path: string) => path.endsWith('/session') ? { visitorToken: 'viewport-fixture' } : {
    shopName: 'Demo Shop', language: 'en', welcomeText: null, welcomeTextEn: null,
    suggestedQuestions: [], suggestedQuestionsEn: [], aiEnabled: true, capReached: false,
  }),
  chatTransport: () => ({
    poll: vi.fn(async () => ({ conversationId: null, items: [], cursor: null, pending: null, closed: false })),
  }),
}));

beforeEach(async () => {
  await i18nReady;
  await i18n.changeLanguage('en');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('positions the public chat with visual viewport resize and keyboard scroll', async () => {
  const visual = Object.assign(new EventTarget(), { offsetTop: 0, height: 800, scale: 1 });
  vi.stubGlobal('visualViewport', visual);
  const app = render(<MemoryRouter initialEntries={['/demo-chat/s/demo-boardgame']}>
    <Routes><Route path="/demo-chat/s/:slug" element={<PublicDemoChat />} /></Routes>
  </MemoryRouter>);
  const heading = await screen.findByRole('heading', { name: 'Demo Shop' });
  const chat = heading.closest('header')?.parentElement;
  if (!chat) throw new Error('Public chat frame missing');
  const { style } = document.documentElement;

  expect(getComputedStyle(chat).position).toBe('fixed');
  expect(style.getPropertyValue('--demo-chat-top')).toBe('0px');
  expect(style.getPropertyValue('--demo-chat-height')).toBe('800px');

  act(() => {
    visual.height = 435;
    visual.dispatchEvent(new Event('resize'));
  });
  expect(style.getPropertyValue('--demo-chat-height')).toBe('435px');

  act(() => {
    visual.offsetTop = 55;
    visual.dispatchEvent(new Event('scroll'));
  });
  expect(style.getPropertyValue('--demo-chat-top')).toBe('55px');
  expect(style.getPropertyValue('--demo-chat-height')).toBe('435px');

  app.unmount();
  expect(style.getPropertyValue('--demo-chat-top')).toBe('');
  expect(style.getPropertyValue('--demo-chat-height')).toBe('');
});

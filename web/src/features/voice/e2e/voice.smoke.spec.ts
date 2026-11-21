import { test, expect, setUiLanguage } from '../../../../../tests/e2e/fixtures';

const copy = {
  th: { title: 'คุยกับร้านด้วยเสียง', empty: 'ใช้ลิงก์เชิญนี้ไม่ได้', start: 'เริ่มคุย' },
  en: { title: 'Talk to the shop by voice', empty: 'This invitation is unavailable', start: 'Start call' },
} as const;

for (const language of ['th', 'en'] as const) {
  test('F30 no-invite landing protects private calls in ' + language, async ({ page, request }) => {
    await setUiLanguage(page, language);
    await page.goto('/call');
    await expect(page.getByRole('heading', { name: copy[language].title })).toBeVisible();
    await expect(page.getByText(copy[language].empty)).toBeVisible();
    await expect(page.getByRole('button', { name: copy[language].start })).toHaveCount(0);

    const unverified = await request.get('/api/v1/voice/sessions/00000000-0000-4000-8000-000000000000/history');
    expect(unverified.status()).toBe(404);
  });
}

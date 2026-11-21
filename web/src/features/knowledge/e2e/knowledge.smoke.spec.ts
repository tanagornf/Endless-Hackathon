import { e2eMarker, expect, setUiLanguage, test } from '../../../../../tests/e2e/fixtures';

test('knowledge owner can activate a new FAQ after indexing in English', async ({ ownerPage, api }) => {
  test.setTimeout(90_000);
  const marker = e2eMarker();
  await setUiLanguage(ownerPage, 'en');
  await ownerPage.goto('/knowledge');
  await expect(ownerPage.getByRole('heading', { name: 'Knowledge base' })).toBeVisible();
  const created = ownerPage.waitForResponse((response) =>
    response.request().method() === 'POST' && response.url().endsWith('/knowledge/items'));
  await ownerPage.getByRole('button', { name: 'Add knowledge' }).first().click();
  const response = await created;
  expect(response.status()).toBe(201);
  const { data: { id } } = await response.json() as { data: { id: string } };
  const itemUrl = response.url() + '/' + id;
  try {
    await ownerPage.getByRole('combobox', { name: 'Type' }).click();
    await ownerPage.getByRole('option', { name: 'Q&A' }).click();
    await ownerPage.getByRole('textbox', { name: 'Question' }).fill(marker + ' Where can I park?');
    await ownerPage.getByRole('textbox', { name: 'Answer' }).fill('Three parking spaces are available in front of the shop.');
    await ownerPage.getByRole('button', { name: 'Save', exact: true }).click();
    const submit = ownerPage.getByRole('button', { name: 'Submit for review' });
    await expect(submit).toBeEnabled();
    await submit.click();
    const activate = ownerPage.getByRole('button', { name: 'Activate', exact: true });
    await expect(activate).toBeEnabled({ timeout: 60_000 });
    await activate.click();
    await expect(ownerPage.getByRole('button', { name: 'Deactivate', exact: true })).toBeVisible();
    const current = await api.get(itemUrl);
    expect(current.ok()).toBe(true);
    expect((await current.json()).data).toMatchObject({ title: marker + ' Where can I park?', status: 'active', indexState: 'ready' });
  } finally {
    const deleted = await api.delete(itemUrl, { headers: { 'X-Requested-With': 'nless' } });
    expect(deleted.ok()).toBe(true);
  }
});

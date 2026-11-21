import { e2eMarker, expect, setUiLanguage, test } from '../../../../../tests/e2e/fixtures';

test('catalog owner creates and reprices a product in English', async ({ ownerPage, api }) => {
  const marker = 'CATALOG-' + e2eMarker();
  await setUiLanguage(ownerPage, 'en');
  await ownerPage.goto('/catalog');
  await expect(ownerPage.getByRole('heading', { name: 'Catalog' })).toBeVisible();
  await ownerPage.getByRole('button', { name: 'Add product or service' }).first().click();
  const create = ownerPage.getByRole('dialog');
  await create.getByRole('textbox', { name: 'Name', exact: true }).fill(marker + ' Board Game');
  await create.getByRole('textbox', { name: 'English name' }).fill(marker + ' Board Game');
  await create.getByRole('textbox', { name: 'SKU' }).fill(marker);
  await create.getByRole('textbox', { name: 'Price (baht)' }).fill('1490');
  await create.getByRole('textbox', { name: 'Stock' }).fill('5');
  const created = ownerPage.waitForResponse((response) =>
    response.request().method() === 'POST' && response.url().endsWith('/catalog/items'));
  await create.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await created;
  expect(response.status()).toBe(201);
  const { data } = await response.json();
  const url = response.url() + '/' + data.id;
  try {
    expect(data).toMatchObject({ priceMinor: 149000, stock: 5, version: 1 });
    await expect(ownerPage.getByRole('heading', { name: marker + ' Board Game' })).toBeVisible();
    await ownerPage.getByRole('textbox', { name: 'Price (baht)' }).fill('1590');
    await ownerPage.getByRole('button', { name: 'Save', exact: true }).click();
    const confirm = ownerPage.getByRole('dialog', { name: 'Save the new price?' });
    await confirm.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(ownerPage.getByText('Version 2', { exact: true })).toBeVisible();
    const checked = await api.get(url);
    expect(checked.ok()).toBe(true);
    expect((await checked.json()).data).toMatchObject({ priceMinor: 159000, version: 2 });
  } finally {
    const current = await api.get(url);
    expect(current.ok()).toBe(true);
    const { data: { version } } = await current.json();
    const disabled = await api.patch(url, { data: { expectedVersion: version, active: false }, headers: { 'X-Requested-With': 'nless' } });
    expect(disabled.ok()).toBe(true);
  }
});

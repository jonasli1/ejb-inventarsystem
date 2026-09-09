import { test, expect, login } from './fixtures';

test.describe('Inventar', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Liste lädt und zeigt keine Auswahl-Checkboxen', async ({ page }) => {
    await page.goto('/inventory');
    await expect(page.getByRole('heading', { name: 'Inventar' })).toBeVisible();
    await expect(page.locator('table input[type="checkbox"]')).toHaveCount(0);
    // At least one row rendered from the seeded data.
    await expect(page.getByText('Verfügbar').first()).toBeVisible({ timeout: 10_000 });
  });

  test('Objekt-Detail zeigt Tabs, DGUV-Feld und keinen Objekttyp/Füllstand', async ({ page }) => {
    await page.goto('/inventory');
    await page.getByText('Verfügbar').first().waitFor();
    await page.locator('.max-h-\\[65vh\\] button').first().click();

    await expect(page.getByRole('button', { name: 'Übersicht' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dokumente' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Zubehör/ })).toBeVisible();
    await expect(page.getByText('Nächste DGUV-V3-Prüfung')).toBeVisible();

    const modalText = await page.locator('[role="dialog"]').innerText();
    expect(modalText).not.toContain('Füllstand');
    expect(modalText).not.toMatch(/Objekttyp|Artikeltyp/);
  });

  test('Neues Objekt: Artikel-Auswahl ist ein Suchfeld statt Dropdown', async ({ page }) => {
    await page.goto('/inventory');
    await page.getByRole('button', { name: 'Neues Objekt' }).click();
    await expect(page.getByRole('dialog').getByText('Artikel', { exact: true })).toBeVisible();

    const articleInput = page.locator('input[name="article-picker-search"]');
    await expect(articleInput).toBeVisible();
    await articleInput.fill('a');
    // Server-searched suggestions should appear.
    await expect(page.locator('[role="dialog"] ul li').first()).toBeVisible({ timeout: 5_000 });
  });
});

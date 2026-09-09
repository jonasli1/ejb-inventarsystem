import { test, expect, login } from './fixtures';

test.describe('Artikel', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Liste zeigt keine Typ-Spalte/Filter und keine Auswahl-Checkboxen', async ({ page }) => {
    await page.goto('/articles');
    await expect(page.getByRole('heading', { name: 'Artikel' })).toBeVisible();
    await expect(page.getByText('Name', { exact: true })).toBeVisible({ timeout: 10_000 });

    const pageText = await page.locator('body').innerText();
    expect(pageText).not.toMatch(/Einzelobjekt|Mehrfachobjekt|Verbrauchsobjekt/);
    await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
  });
});

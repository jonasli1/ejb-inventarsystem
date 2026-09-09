import { test, expect, login } from './fixtures';

test.describe('Rollen & Berechtigungen', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Berechtigungen werden mit deutschem Klartext statt Rohschlüssel angezeigt', async ({ page }) => {
    await page.getByText('Einstellungen').click();
    await page.getByRole('link', { name: 'Rollen' }).click();
    await expect(page.getByRole('heading', { name: 'Rollen' })).toBeVisible();

    // Open the first non-protected role in the list.
    await page.getByText(/Berechtigungen$/).first().waitFor();
    await page.locator('ul > li').nth(1).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Berechtigungen', { exact: true })).toBeVisible();
    const dialogText = await dialog.innerText();
    // No raw dotted permission key (e.g. "articles.read") should leak into the UI.
    expect(dialogText).not.toMatch(/\b[a-z_]+\.[a-z_]+\b/);
  });
});

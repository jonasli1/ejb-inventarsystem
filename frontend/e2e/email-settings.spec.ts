import { test, expect, login } from './fixtures';

test.describe('E-Mail-Einstellungen', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Nav zeigt "E-Mail" (nicht mehr "E-Mail-Server") mit Server/Vorlagen/Fußzeile-Tabs', async ({ page }) => {
    await page.getByText('Einstellungen').click();
    const navLink = page.getByRole('link', { name: 'E-Mail', exact: true });
    await expect(navLink).toBeVisible();
    await navLink.click();

    await expect(page.getByRole('heading', { name: 'E-Mail', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Server' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Vorlagen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fußzeile' })).toBeVisible();
  });

  test('Vorlagen-Tab listet die Benachrichtigungstypen und öffnet einen Editor mit Rich-Text-Werkzeugleiste', async ({ page }) => {
    await page.goto('/settings/email');
    await page.getByRole('button', { name: 'Vorlagen' }).click();
    await expect(page.getByText('Passwort zurücksetzen', { exact: true }).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Ausleihe ausgegeben' }).first().click();
    await expect(page.getByRole('dialog').getByText('Betreff', { exact: true })).toBeVisible();
    await expect(page.getByTitle('Fett')).toBeVisible();
    await expect(page.getByTitle('Unterstrichen')).toBeVisible();
    await expect(page.locator('input[type="color"]')).toBeVisible();
    await expect(page.locator('select[aria-label="Schriftgröße"]')).toBeVisible();
  });
});

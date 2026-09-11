import { test, expect, login } from './fixtures';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Inventar-Kachel zeigt eine Zahl statt nur "Bestand ansehen"', async ({ page }) => {
    const inventoryTile = page.locator('main a[href="/inventory"]');
    await expect(inventoryTile).toBeVisible();
    await expect(inventoryTile.getByText('Bestand ansehen')).not.toBeVisible();
    await expect(inventoryTile.locator('p.text-2xl')).toHaveText(/^\d+$/);
  });
});

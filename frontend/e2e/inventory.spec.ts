import { test, expect, login, ADMIN_EMAIL, ADMIN_PASSWORD } from './fixtures';

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

  test('Anschaffungsdatum kann gesetzt und wieder gelöscht werden', async ({ page }) => {
    await page.goto('/inventory');
    await page.getByText('Verfügbar').first().waitFor();
    const openFirstRow = () => page.locator('.max-h-\\[65vh\\] button').first().click();
    await openFirstRow();

    const dialog = page.getByRole('dialog');
    const dateInput = dialog.locator('label:text-is("Anschaffungsdatum") + div input[type="date"]');
    await dateInput.fill('2025-01-15');
    await dialog.getByRole('button', { name: 'Speichern' }).click();
    await expect(dialog).not.toBeVisible();

    await openFirstRow();
    await expect(dateInput).toHaveValue('2025-01-15');

    const clearButton = dialog.locator('label:text-is("Anschaffungsdatum") + div button[aria-label="Datum löschen"]');
    await clearButton.click();
    await expect(dateInput).toHaveValue('');
    await dialog.getByRole('button', { name: 'Speichern' }).click();
    await expect(dialog).not.toBeVisible();

    await openFirstRow();
    await expect(dateInput).toHaveValue('');
  });

  test('Suche nach einem Artikel-Alias findet das Objekt und zeigt den Alias an', async ({ page, request }) => {
    // Self-contained fixture (rather than relying on seed data staying in
    // sync) with an alias that is deliberately NOT a substring of the
    // article's own name - a search hit here can only have come via the
    // alias, not the name/manufacturer/etc. fields already covered by the
    // other search test above.
    const loginRes = await request.post('/api/v1/auth/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    const { accessToken } = await loginRes.json();
    const auth = { Authorization: `Bearer ${accessToken}` };

    const org = await (await request.post('/api/v1/organizations', { headers: auth, data: { name: 'Alias-Test Org' } })).json();
    const unit = await (
      await request.post(`/api/v1/organizations/${org.id}/units`, { headers: auth, data: { name: 'Alias-Test Unit' } })
    ).json();
    const location = await (
      await request.post('/api/v1/locations', { headers: auth, data: { name: 'Alias-Test Location' } })
    ).json();
    const room = await (
      await request.post('/api/v1/rooms', { headers: auth, data: { name: 'Alias-Test Room', locationId: location.id } })
    ).json();
    const article = await (
      await request.post('/api/v1/articles', {
        headers: auth,
        data: { name: 'Funkmikrofon Shure QLXD', aliases: ['Handmikro Blau'] },
      })
    ).json();
    await request.post('/api/v1/inventory', {
      headers: auth,
      data: {
        articleId: article.id,
        locationId: location.id,
        roomId: room.id,
        ownerOrganizationId: org.id,
        ownerUnitId: unit.id,
      },
    });

    await page.goto('/inventory');
    await page.locator('input[name="inventory-search"]').fill('Handmikro Blau');
    await expect(page.getByText('Alias: Handmikro Blau').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Funkmikrofon Shure QLXD').first()).toBeVisible();
  });
});

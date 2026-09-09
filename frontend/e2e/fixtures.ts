import { test as base, expect, type Page } from '@playwright/test';

// Matches backend/prisma/seed.ts's default admin account (overridable via
// the same ADMIN_EMAIL/ADMIN_PASSWORD env vars the seed script reads).
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';

export async function login(page: Page, email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText(/^Willkommen/)).toBeVisible({ timeout: 15_000 });
}

export const test = base;
export { expect };

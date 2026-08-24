import { chromium } from 'playwright';
import fs from 'node:fs';

const STATE_FILE = '/private/tmp/claude-501/-Users-jonas-Documents-Development-ejb-inventarsystem/2f3971fe-3883-40c3-8c3b-495002000d4b/scratchpad/pw-fixture-state.json';
const OUT = '/private/tmp/claude-501/-Users-jonas-Documents-Development-ejb-inventarsystem/2f3971fe-3883-40c3-8c3b-495002000d4b/scratchpad/verify';
fs.mkdirSync(OUT, { recursive: true });
const fx = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

const browser = await chromium.launch();
let stepNum = 0;
function step(name) {
  stepNum++;
  console.log(`\n=== STEP ${stepNum}: ${name} ===`);
}
function assertTrue(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  OK: ${msg}`);
}

async function newPageAs(email, password) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto('http://localhost:5173/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:5173/', { timeout: 10000 });
  return { context, page };
}

const borrowerName = `PWUI Borrower ${fx.suffix}`;
let loanId = null;

// ---------------------------------------------------------------------
step('Creator creates a loan (loans.create only) -> must land as "requested"');
{
  const { context, page } = await newPageAs(fx.creator.email, fx.password);
  await page.goto('http://localhost:5173/loans');
  await page.click('button:has-text("Neue Ausleihe")');
  await page.waitForTimeout(300);
  await page.fill('input[placeholder="Max Mustermann"]', borrowerName);
  const dueDateInput = page.locator('input[type="date"]').nth(1);
  await dueDateInput.fill('2026-12-31');
  const textInputs = page.locator('div[role="dialog"] input[type="text"], .fixed input:not([type])');
  // Fill the remaining required text fields by label proximity
  const fields = await page.locator('label').allTextContents();
  async function fillByLabel(labelText, value) {
    const field = page.locator('label', { hasText: labelText }).locator('..').locator('input');
    await field.fill(value);
  }
  await fillByLabel('Straße, Hausnummer', 'Teststraße 1');
  await fillByLabel('PLZ, Ort', '12345 Teststadt');
  await fillByLabel('E-Mail', 'borrower-pwui@example.com');
  await fillByLabel('Handynummer', '0123456789');

  // Select the object via ItemSearchSelect
  const searchInput = page.locator('input[placeholder*="Suche nach Name, Inventarnummer"]');
  await searchInput.fill(fx.article.name.slice(0, 10));
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/00b-item-search-dropdown.png`, fullPage: true });
  console.log('  dropdown html:', await page.locator('.absolute.z-10, .absolute.mt-1').first().innerHTML().catch(() => '(none found)'));
  await page.locator('button:has-text("' + fx.article.name + '")').first().click();

  await page.screenshot({ path: `${OUT}/01-create-loan-form.png`, fullPage: true });
  await page.click('button:has-text("Ausleihe erstellen")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/02-loan-created.png`, fullPage: true });

  const bodyText = await page.locator('body').innerText();
  assertTrue(bodyText.includes('Beantragt'), 'newly created loan (creator, no manage) shows status "Beantragt"');
  assertTrue(!bodyText.includes('Alle genehmigen'), 'creator does not see "Alle genehmigen" button');
  assertTrue(bodyText.includes('Bearbeiten'), 'creator sees "Bearbeiten" button on own loan');

  const idMatch = bodyText.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
  assertTrue(!!idMatch, 'loan id visible in modal');
  loanId = idMatch[1];
  console.log('  loanId =', loanId);

  await context.close();
}

fs.writeFileSync(STATE_FILE, JSON.stringify({ ...fx, loanId, borrowerName }, null, 2));
console.log('\nDONE STAGE 1');
await browser.close();

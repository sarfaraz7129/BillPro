'use strict';
const { chromium } = require('playwright');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const page = await context.newPage();

  // 1. Visit Login screen and switch to "Buy License / WhatsApp" tab
  await page.goto('http://localhost:4173', { waitUntil: 'networkidle' });
  const buyTab = page.locator('button:has-text("Buy License")').first();
  await buyTab.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/user/demo-pricing-whatsapp.png' });
  console.log('Saved demo-pricing-whatsapp.png');

  // Switch back to Sign in
  await page.locator('button:has-text("Sign in")').first().click();
  await page.waitForTimeout(500);

  // Click 1-Click Demo
  await page.locator('button:has-text("1-Click Demo")').click();
  await page.waitForTimeout(2000);

  // 2. Click Invoices bottom nav
  const invoicesNav = page.locator('.mobile-bottom-nav button:has-text("Invoices"), nav button:has-text("Invoices")');
  await invoicesNav.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/home/user/demo-invoices-list.png' });
  console.log('Saved demo-invoices-list.png');

  // 3. Click Khata bottom nav
  const khataNav = page.locator('.mobile-bottom-nav button:has-text("Khata"), nav button:has-text("Khata")');
  await khataNav.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/home/user/demo-khata-list.png' });
  console.log('Saved demo-khata-list.png');

  // 4. Click Menu -> Products
  const menuNav = page.locator('.mobile-bottom-nav button:has-text("Menu"), nav button:has-text("Menu")');
  await menuNav.click();
  await page.waitForTimeout(1000);
  const productsItem = page.locator('.drawer-nav button:has-text("Products"), button:has-text("Products / Inventory"), button:has-text("Products")').first();
  if (await productsItem.isVisible()) {
    await productsItem.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/home/user/demo-products-inventory.png' });
    console.log('Saved demo-products-inventory.png');
  }

  await browser.close();
  console.log('All demo captures completed successfully!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

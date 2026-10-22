const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36'
  });

  const page = await context.newPage();
  console.log('Testing all options on live server: http://127.0.0.1:4173...');
  await page.goto('http://127.0.0.1:4173');
  await page.waitForLoadState('networkidle');

  // Login
  await page.fill('input[type="email"]', 'demo@billpro.in');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.mobile-bottom-nav', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // 1. Dashboard top & bottom
  await page.screenshot({ path: '/home/user/opt-1-dashboard-top.png' });
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/home/user/opt-1-dashboard-mid.png' });
  await page.evaluate(() => window.scrollBy(0, 700));
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/home/user/opt-1-dashboard-bottom.png' });

  // 2. Billing / Invoices tab
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('.mobile-tab:has-text("Invoices")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/user/opt-2-billing-invoices.png' });

  // 2b. Billing: Quotations tab
  await page.click('button:has-text("Quotations")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/home/user/opt-2-billing-quotations.png' });

  // 2c. Billing: Open New Invoice Editor modal
  await page.click('.mobile-fab');
  await page.waitForSelector('.mobile-action-sheet', { timeout: 5000 });
  await page.click('button:has-text("New Sale Invoice")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/user/opt-2-new-invoice-modal.png' });
  // Close invoice editor modal
  await page.click('.modal-h button[aria-label="Close"], .modal-h .icon-btn');
  await page.waitForTimeout(500);

  // 3. POS Counter Billing
  await page.click('.mobile-tab:has-text("Menu")');
  await page.waitForTimeout(500);
  await page.click('.nav a:has-text("Counter billing (POS)")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/user/opt-3-pos.png' });

  // 4. Khata / Ledgers
  await page.click('.mobile-tab:has-text("Khata")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/user/opt-4-khata-customers.png' });

  // 4b. Khata: Suppliers tab
  await page.click('button:has-text("Suppliers")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/home/user/opt-4-khata-suppliers.png' });

  // 4c. Khata: Open first party ledger
  const firstParty = page.locator('.mobile-trans-item').first();
  if (await firstParty.isVisible()) {
    await firstParty.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/home/user/opt-4-party-ledger-modal.png' });
    await page.click('.modal-h .icon-btn');
    await page.waitForTimeout(500);
  }

  // 5. Inventory
  await page.click('.mobile-tab:has-text("Menu")');
  await page.waitForTimeout(500);
  await page.click('.nav a:has-text("Inventory")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/user/opt-5-inventory.png' });

  // 6. Reports & GST
  await page.click('.mobile-tab:has-text("Menu")');
  await page.waitForTimeout(500);
  await page.click('.nav a:has-text("Reports & GST")');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: '/home/user/opt-6-reports-gstr3b.png' });

  // 6b. Reports: Profit & Loss
  await page.click('.tabs button:has-text("Profit & Loss")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/user/opt-6-reports-pnl.png' });

  // 7. All Businesses / Group Overview
  await page.click('.mobile-tab:has-text("Menu")');
  await page.waitForTimeout(500);
  await page.click('.nav a:has-text("All businesses")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/user/opt-7-all-businesses.png' });

  // 8. Settings
  await page.click('.mobile-tab:has-text("Menu")');
  await page.waitForTimeout(500);
  await page.click('.nav a:has-text("Settings")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/user/opt-8-settings.png' });

  // 9. Client Manager (Super Admin)
  await page.click('.mobile-tab:has-text("Menu")');
  await page.waitForTimeout(500);
  await page.click('.nav a:has-text("Client Manager")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/user/opt-9-superadmin.png' });

  console.log('All option screenshots captured successfully!');
  await browser.close();
})();

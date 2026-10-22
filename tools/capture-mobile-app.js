const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36'
  });

  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Go to app
  console.log('Navigating to http://127.0.0.1:4173...');
  await page.goto('http://127.0.0.1:4173');
  await page.waitForLoadState('networkidle');

  // Fill login
  console.log('Logging in...');
  await page.fill('input[type="email"]', 'demo@billpro.in');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.mobile-bottom-nav', { timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.waitForTimeout(1000);

  // 1. Dashboard screenshot
  console.log('Capturing Dashboard...');
  await page.screenshot({ path: '/home/user/mobile-app-dashboard.png' });

  // 2. Click FAB (+) to open Action Sheet
  console.log('Capturing FAB Action Sheet...');
  await page.click('.mobile-fab');
  await page.waitForSelector('.mobile-action-sheet', { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/user/mobile-app-fab-sheet.png' });

  // Close sheet by clicking Close button
  await page.click('.mobile-action-sheet button:has-text("Close")');
  await page.waitForTimeout(500);

  // 3. Billing / Invoices tab
  console.log('Capturing Invoices Tab...');
  await page.click('.mobile-tab:has-text("Invoices")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/user/mobile-app-invoices.png' });

  // 4. Khata tab
  console.log('Capturing Khata Tab...');
  await page.click('.mobile-tab:has-text("Khata")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/user/mobile-app-khata.png' });

  // 5. Open Drawer Menu
  console.log('Capturing Drawer Menu...');
  await page.click('.mobile-tab:has-text("Menu")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/home/user/mobile-app-drawer.png' });

  // 6. Navigate to Inventory from drawer
  console.log('Capturing Inventory...');
  await page.click('.nav a:has-text("Inventory")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/home/user/mobile-app-inventory.png' });

  // 7. Re-capture updated Dashboard
  console.log('Re-capturing Dashboard with updated moc-top...');
  await page.click('.mobile-tab:has-text("Home")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/home/user/mobile-app-dashboard.png' });

  // Also capture scrolled dashboard to show Recent Documents
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/user/mobile-app-dashboard-scrolled.png' });

  console.log('All screenshots captured successfully!');
  await browser.close();
})();

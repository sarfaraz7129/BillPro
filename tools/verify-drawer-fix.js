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
    hasTouch: true
  });

  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173');
  await page.waitForLoadState('networkidle');

  // Login
  await page.fill('input[type="email"]', 'demo@billpro.in');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.mobile-bottom-nav', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // Open Drawer Menu
  await page.click('.mobile-tab:has-text("Menu")');
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/home/user/mobile-drawer-fixed.png' });
  console.log('Mobile drawer screenshot captured to /home/user/mobile-drawer-fixed.png');

  await browser.close();
})();

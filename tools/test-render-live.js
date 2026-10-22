const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 412, height: 915 }, // Pixel 7 standard resolution
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36'
  });

  const page = await context.newPage();
  console.log('Navigating to Render live: https://billpro-84ay.onrender.com ...');
  await page.goto('https://billpro-84ay.onrender.com');
  await page.waitForLoadState('networkidle');

  // Fill login
  await page.fill('input[type="email"]', 'demo@billpro.in');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.mobile-bottom-nav', { timeout: 15000 });
  await page.waitForTimeout(1500);

  // Capture Dashboard
  await page.screenshot({ path: '/home/user/render-live-dashboard.png' });
  console.log('Captured Render live dashboard!');

  await browser.close();
})();

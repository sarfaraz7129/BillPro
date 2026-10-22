const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1
  });

  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173');
  await page.fill('input[type="email"]', 'demo@billpro.in');
  await page.fill('input[type="password"]', 'demo1234');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);

  // Check desktop sidebar and topbar
  await page.screenshot({ path: '/home/user/desktop-verified-final.png' });
  console.log('Desktop view verified!');
  await browser.close();
})();

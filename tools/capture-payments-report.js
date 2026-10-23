'use strict';
const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });

  // 1. Desktop capture of Cash & UPI Collections Report
  const deskContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const deskPage = await deskContext.newPage();
  await deskPage.goto('http://localhost:4173', { waitUntil: 'networkidle' });
  await deskPage.locator('button:has-text("1-Click Demo")').click();
  await deskPage.waitForTimeout(1500);

  // Navigate to Reports -> Cash & UPI Collections
  await deskPage.locator('text=Reports & GST').first().click();
  await deskPage.waitForTimeout(1500);
  await deskPage.screenshot({ path: '/home/user/desktop-payments-report.png' });
  console.log('Saved desktop-payments-report.png');

  // Click Day book tab
  await deskPage.locator('button:has-text("Day book")').click();
  await deskPage.waitForTimeout(1000);
  await deskPage.screenshot({ path: '/home/user/desktop-daybook-report.png' });
  console.log('Saved desktop-daybook-report.png');

  // 2. Mobile capture of Cash & UPI Collections Report
  const mobContext = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const mobPage = await mobContext.newPage();
  await mobPage.goto('http://localhost:4173', { waitUntil: 'networkidle' });
  await mobPage.locator('button:has-text("1-Click Demo")').click();
  await mobPage.waitForTimeout(1500);

  // Open drawer menu and click Reports
  await mobPage.locator('.mobile-bottom-nav button:has-text("Menu"), nav button:has-text("Menu")').click();
  await mobPage.waitForTimeout(600);
  await mobPage.locator('button:has-text("Reports & GST")').click();
  await mobPage.waitForTimeout(1500);
  await mobPage.screenshot({ path: '/home/user/mobile-payments-report.png' });
  console.log('Saved mobile-payments-report.png');

  await browser.close();
  console.log('Captures completed!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

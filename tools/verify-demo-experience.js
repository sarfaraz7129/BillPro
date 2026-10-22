'use strict';
const { chromium } = require('playwright');
const http = require('http');
const path = require('path');

// Ensure server is running or start it
async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } }); // Mobile viewport
  const page = await context.newPage();

  console.log('Navigating to http://localhost:4173...');
  await page.goto('http://localhost:4173', { waitUntil: 'networkidle' });

  // Capture Login page
  await page.screenshot({ path: '/home/user/demo-1-login-screen.png' });
  console.log('Saved demo-1-login-screen.png');

  // Click 1-Click Demo button
  console.log('Clicking 1-Click Demo button...');
  const demoBtn = page.locator('button:has-text("1-Click Demo")');
  await demoBtn.click();

  await page.waitForNavigation({ waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(2000);

  // Capture Bharat Retail Mart Dashboard
  await page.screenshot({ path: '/home/user/demo-2-bharat-dashboard.png' });
  console.log('Saved demo-2-bharat-dashboard.png');

  // Click Products / Inventory
  const invBtn = page.locator('button:has-text("Products"), a:has-text("Products")').first();
  if (await invBtn.isVisible()) {
    await invBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/home/user/demo-3-bharat-products.png' });
    console.log('Saved demo-3-bharat-products.png');
  }

  // Click Khata
  const khataBtn = page.locator('button:has-text("Khata"), a:has-text("Khata")').first();
  if (await khataBtn.isVisible()) {
    await khataBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/home/user/demo-4-bharat-khata.png' });
    console.log('Saved demo-4-bharat-khata.png');
  }

  await browser.close();
  console.log('Done verify-demo-experience!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

'use strict';
const { chromium } = require('playwright');
const { app } = require('../server/index');

async function testUi() {
  console.log('Starting UI Playwright verification for Dual Billing Mode...');
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', (msg) => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', (err) => console.log('BROWSER ERROR:', err.message));

  // 1. Visit Login page
  await page.goto(url);
  await page.waitForSelector('input[type="email"]');
  await page.fill('input[type="email"]', 'Mohammed.zoheb21@gmail.com');
  await page.fill('input[type="password"]', 'zoheb123');
  await page.click('button[type="submit"]');

  // Wait for dashboard
  await page.waitForSelector('button:has-text("New invoice"), button:has-text("New bill")');
  console.log('Logged in successfully as Sayyad Mohammad zoheb!');

  // 2. Click "New invoice" / "New bill"
  const newBillBtn = await page.locator('button:has-text("New invoice"), button:has-text("New bill")').first();
  await newBillBtn.click();

  // 3. Verify Estimate Bill selector is present and active
  await page.waitForSelector('button:has-text("Estimate Bill")');
  console.log('Document Editor opened with Dual Billing Mode toggle visible!');

  // 4. Fill an item and create Estimate bill
  const partyInput = page.locator('input[placeholder*="party name"]');
  await partyInput.fill('Walk-in Retail Buyer');
  
  const itemInput = page.locator('input[placeholder*="item"]').first();
  await itemInput.fill('Standard Casual Footwear');

  // Fill Rate and Qty
  const qtyInput = page.locator('table.doc-tbl tbody tr td input[type="number"]').first();
  await qtyInput.fill('2');
  const rateInput = page.locator('table.doc-tbl tbody tr td input[type="number"]').nth(1);
  await rateInput.fill('750');

  // Wait a tick for live calculation
  await page.waitForTimeout(300);

  // Take screenshot of Document Editor with Dual Mode switcher
  await page.screenshot({ path: '/home/user/estimate-editor.png' });
  console.log('Captured screenshot of Estimate Editor: /home/user/estimate-editor.png');

  // 5. Save & Generate
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/documents') && r.status() === 201),
    page.click('button:has-text("Save & generate")')
  ]);
  console.log('Save response received!');
  await page.waitForTimeout(600);

  // Take screenshot of DocViewer showing Estimate Bill
  await page.screenshot({ path: '/home/user/estimate-docviewer.png' });
  console.log('Captured screenshot of Estimate DocViewer: /home/user/estimate-docviewer.png');

  // 6. Open Thermal / 6" LQ-50 slip preview from DocViewer
  const printSlipBtn = page.locator('button:has-text("Thermal (58/80mm)")').first();
  await printSlipBtn.click();
  await page.waitForSelector('#thermal-receipt-printable', { timeout: 8000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/home/user/estimate-slip-preview.png' });
  console.log('Captured screenshot of Clean Estimate Slip: /home/user/estimate-slip-preview.png');

  // Close slip modal by clicking Close button inside slip modal header
  const closeBtn = page.locator('.modal-h button:has-text("Close")').last();
  await closeBtn.click();
  await page.waitForTimeout(600);

  // 7. Click "Convert to GST Invoice" in DocViewer
  const convertBtn = page.locator('button:has-text("Convert to GST Invoice")').first();
  await convertBtn.click();
  await page.waitForTimeout(1200);
  console.log('Clicked Convert to GST Invoice!');

  // Take screenshot after conversion
  await page.screenshot({ path: '/home/user/converted-gst-invoice.png' });
  console.log('Captured screenshot of Converted GST Invoice: /home/user/converted-gst-invoice.png');

  await browser.close();
  server.close();
  console.log('UI verification completed successfully!');
}

testUi().catch((err) => {
  console.error('Playwright UI error:', err);
  process.exit(1);
});

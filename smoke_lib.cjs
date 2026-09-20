const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[PAGEERROR]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[CONSOLE]', m.text().slice(0, 200)); });
  await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.toolbar', { timeout: 20000 });

  // 确认组件渲染 + 语言/引擎下拉
  const info = await page.evaluate(() => JSON.stringify({
    langs: [...document.querySelectorAll('.toolbar-field:nth-of-type(1) select option')].map(o => o.textContent),
    engines: [...document.querySelectorAll('.toolbar-field:nth-of-type(2) select option')].map(o => o.textContent),
    hasMonaco: document.querySelectorAll('.monaco-editor').length > 0,
  }));
  console.log('UI:', info);

  // C + XCC 运行
  await page.selectOption('.toolbar-field:nth-of-type(1) select', 'c');
  await page.waitForTimeout(300);
  await page.selectOption('.toolbar-field:nth-of-type(2) select', 'xcc');
  await page.waitForTimeout(300);
  await page.fill('.stdin-input', '5 7');
  await page.click('.btn-run');
  await page.waitForSelector('.output-panel', { timeout: 30000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => JSON.stringify({
    verdict: document.querySelector('.verdict')?.textContent,
    out: document.querySelector('.output-block .output-pre')?.textContent,
  }));
  console.log('XCC via lib:', r);
  await browser.close();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });

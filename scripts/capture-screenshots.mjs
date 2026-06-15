import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'docs', 'screenshots');
const base = process.env.J13_URL || 'http://localhost:8080';

async function shot(page, name, opts = {}) {
  const file = path.join(outDir, name);
  await page.screenshot({ path: file, type: 'png', ...opts });
  console.log('saved', file);
}

async function setTheme(page, theme) {
  await page.addInitScript((t) => {
    localStorage.setItem('j13-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
    document.documentElement.style.colorScheme = t;
  }, theme);
}

const browser = await chromium.launch();
const context = await browser.newContext({ deviceScaleFactor: 2 });

try {
  await mkdir(outDir, { recursive: true });

  // 首页 · 浅色
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTheme(page, 'light');
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await shot(page, 'home-light.png');
    await page.close();
  }

  // 首页 · 暗色
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTheme(page, 'dark');
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await shot(page, 'home-dark.png');
    await page.close();
  }

  // 帖子详情
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTheme(page, 'light');
    await page.goto(`${base}/post/2`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await shot(page, 'post-detail.png');
    await page.close();
  }

  // 发帖编辑器
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTheme(page, 'light');
    await page.goto(`${base}/compose`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await shot(page, 'compose.png');
    await page.close();
  }

  // 移动端
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await setTheme(page, 'light');
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await shot(page, 'mobile-home.png', { fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
}

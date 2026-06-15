import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'docs', 'screenshots');
const base = process.env.J13_URL || 'http://localhost:8080';

/** 用于发帖页截图的演示账号 */
const DEMO_USER = { username: 'admin', password: 'admin123' };
/** 富文本示例帖，用于详情页截图 */
const DEMO_POST_ID = Number(process.env.J13_POST_ID || 36);

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

/** 通过登录页写入 Cookie，供发帖页等需登录场景使用 */
async function login(page) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="username"], #username, input[autocomplete="username"]', DEMO_USER.username);
  await page.fill('input[name="password"], #password, input[type="password"]', DEMO_USER.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10000 });
  await page.waitForTimeout(600);
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
    await page.waitForSelector('.feed-sort-bar, .virtual-post-list, .post-list', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await shot(page, 'home-light.png');
    await page.close();
  }

  // 首页 · 暗色
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTheme(page, 'dark');
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.feed-sort-bar, .virtual-post-list, .post-list', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await shot(page, 'home-dark.png');
    await page.close();
  }

  // 帖子详情（富文本 + 楼层回复）
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTheme(page, 'light');
    await page.goto(`${base}/post/${DEMO_POST_ID}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.post-detail-page, .post-detail-title', { timeout: 10000 });
    await page.waitForTimeout(1200);
    await shot(page, 'post-detail.png');
    await page.close();
  }

  // 发帖编辑器（需登录）
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTheme(page, 'light');
    await login(page);
    await page.goto(`${base}/compose`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.compose-page, .compose-canvas, .article-editor', { timeout: 10000 });
    await page.fill('.compose-title', '分享你的技术见解');
    const editor = page.locator('.article-editor .ProseMirror, .article-editor [contenteditable="true"]').first();
    if (await editor.count()) {
      await editor.click();
      await editor.fill('支持 **粗体**、列表、代码块与图片上传的 TipTap 编辑器。');
    }
    await page.waitForTimeout(800);
    await shot(page, 'compose.png', {
      clip: { x: 0, y: 56, width: 1440, height: 844 },
    });
    await page.close();
  }

  // 移动端
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await setTheme(page, 'light');
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.feed-sort-bar, .virtual-post-list, .post-list', { timeout: 10000 });
    await page.waitForTimeout(1000);
    await shot(page, 'mobile-home.png', { fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
}

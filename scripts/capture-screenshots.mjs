import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'docs', 'screenshots');
/** 默认抓取在线演示站；本地可用 J13_URL=http://localhost:3000 */
const base = (process.env.J13_URL || 'https://bbs.iioio.com').replace(/\/$/, '');

/** 用于发帖页截图的演示账号（本地开发时填写） */
const DEMO_USER = {
  username: process.env.J13_USER || 'admin',
  password: process.env.J13_PASS || 'admin123',
};
/** 帖子详情 / 富文本展示用帖 ID */
const DEMO_POST_ID = Number(process.env.J13_POST_ID || 1);
const RICH_POST_ID = Number(process.env.J13_RICH_POST_ID || 8);
/** 演示站开启永久链接时带 .html */
const permalinkExt = process.env.J13_PERMALINK_EXT || 'html';

function postPath(id) {
  const ext = permalinkExt ? `.${permalinkExt.replace(/^\./, '')}` : '';
  return `${base}/post/${id}${ext}`;
}

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

async function waitFeed(page) {
  await page.waitForSelector('.feed-sort-bar, .virtual-post-list, .post-list', { timeout: 15000 });
  await page.waitForTimeout(1000);
}

/** 通过登录页写入 Cookie；失败时返回 false（演示站无账号时跳过发帖页） */
async function login(page) {
  try {
    await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[name="username"], #username, input[autocomplete="username"]', DEMO_USER.username);
    await page.fill('input[name="password"], #password, input[type="password"]', DEMO_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10000 });
    await page.waitForTimeout(600);
    return true;
  } catch (err) {
    console.warn('login skipped:', err.message);
    return false;
  }
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
    await waitFeed(page);
    await shot(page, 'home-light.png');
    await page.close();
  }

  // 首页 · 暗色
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTheme(page, 'dark');
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await waitFeed(page);
    await shot(page, 'home-dark.png');
    await page.close();
  }

  // 帖子详情（介绍文 / 目录）
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTheme(page, 'light');
    await page.goto(postPath(DEMO_POST_ID), { waitUntil: 'networkidle' });
    await page.waitForSelector('.post-detail-page, .post-detail-title, h1', { timeout: 15000 });
    await page.waitForTimeout(1200);
    await shot(page, 'post-detail.png');
    await page.close();
  }

  // 富文本帖（图片 + 代码高亮，展示 TipTap 渲染）
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTheme(page, 'light');
    await page.goto(postPath(RICH_POST_ID), { waitUntil: 'networkidle' });
    await page.waitForSelector('.post-detail-page, .post-detail-title, h1', { timeout: 15000 });
    const img = page.locator('.article-img, .post-detail-page img, article img').first();
    if (await img.count()) {
      await img.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
    }
    await shot(page, 'post-rich.png');
    await page.close();
  }

  // 发帖编辑器（需登录；演示站无账号时自动跳过）
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await setTheme(page, 'light');
    const ok = await login(page);
    if (ok) {
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
    } else {
      console.warn('compose.png 未生成：请设置 J13_USER / J13_PASS 后重试');
    }
    await page.close();
  }

  // 移动端首页
  {
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await setTheme(page, 'light');
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await waitFeed(page);
    await shot(page, 'mobile-home.png');
    await page.close();
  }
} finally {
  await browser.close();
}

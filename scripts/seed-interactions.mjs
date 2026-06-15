/**
 * 补全评论、点赞、置顶/锁定（帖子已存在时使用）
 * 用法：node scripts/seed-interactions.mjs
 */
const BASE = process.env.SEED_BASE || 'http://localhost:3000';

let cookie = '';

function captureCookie(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const part = line.split(';')[0].trim();
    if (part.startsWith('jiang13_token=')) cookie = part;
  }
}

async function request(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  if (opts.body instanceof FormData) delete headers['Content-Type'];
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  captureCookie(res);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${path}`);
  return data;
}

async function login(username, password) {
  const fd = new FormData();
  fd.append('username', username);
  fd.append('password', password);
  await request('/api/login', { method: 'POST', body: fd });
}

async function addComment(postId, content, replyTo) {
  const fd = new FormData();
  fd.append('content', content);
  if (replyTo) fd.append('reply_to', String(replyTo));
  const data = await request(`/api/posts/${postId}/comments`, { method: 'POST', body: fd });
  return data.id;
}

async function likePost(postId) {
  await request(`/api/posts/${postId}/like`, { method: 'POST' });
}

async function pinPost(postId) {
  await request(`/api/admin/posts/${postId}/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pinned: true }),
  });
}

async function lockPost(postId) {
  await request(`/api/admin/posts/${postId}/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locked: true }),
  });
}

async function main() {
  const { posts } = await request('/api/posts?page=1&size=50');
  const list = posts ?? [];
  if (!list.length) throw new Error('没有帖子，请先运行 node scripts/seed.mjs');

  const byTitle = (kw) => list.find((p) => p.title.includes(kw));
  const first = list[0];
  const qa = byTitle('embed') ?? first;
  const hot = list.filter((p) => p.title.includes('热门候选'));
  const lockTarget = byTitle('夜班') ?? list.at(-1);

  console.log('补全评论与互动…');
  await login('alice', 'alice123');
  await addComment(first.id, '第一条评论，测试楼层显示。');
  const aliceC = await addComment(first.id, '同意，排版帖很有参考价值。');
  await addComment(qa.id, '同问，embed 路径我也踩过坑。');

  await login('bob', 'bob123');
  await addComment(first.id, '引用回复测试', aliceC);
  for (const p of hot.slice(0, 2)) await addComment(p.id, '热门帖评论一条。');

  await login('admin', 'admin123');
  await addComment(first.id, '管理员也来回复一楼。');
  for (const p of hot) await likePost(p.id);
  await login('alice', 'alice123');
  for (const p of hot) await likePost(p.id);
  await login('bob', 'bob123');
  for (const p of hot) await likePost(p.id);

  await login('admin', 'admin123');
  await pinPost(first.id);
  if (list[1]) await pinPost(list[1].id);
  if (lockTarget) await lockPost(lockTarget.id);

  const stats = await request('/api/stats');
  console.log(`完成。帖子 ${stats.posts} · 会员 ${stats.users}`);
}

main().catch((e) => {
  console.error('失败：', e.message);
  process.exit(1);
});

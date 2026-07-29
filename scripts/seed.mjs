/**
 * 全量测试数据种子脚本（开发环境）
 * 用法：node scripts/seed.mjs
 * 环境变量：SEED_BASE=http://localhost:3000
 */
const BASE = process.env.SEED_BASE || 'http://localhost:3000';

let cookie = '';

function captureCookie(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const part = line.split(';')[0].trim();
    if (part.startsWith('jiang13_token=')) cookie = part;
  }
  const legacy = res.headers.get('set-cookie');
  if (legacy && !cookie) {
    const part = legacy.split(';')[0].trim();
    if (part.startsWith('jiang13_token=')) cookie = part;
  }
}

async function request(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  if (opts.body instanceof FormData) {
    delete headers['Content-Type'];
  }
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  captureCookie(res);
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) throw new Error(data.error || `${res.status} ${path}`);
  return data;
}

async function register(username, password, nickname) {
  const fd = new FormData();
  fd.append('username', username);
  fd.append('password', password);
  fd.append('nickname', nickname);
  await request('/api/register', { method: 'POST', body: fd });
  console.log(`  用户 ${username}（${nickname}）`);
}

async function login(username, password) {
  const fd = new FormData();
  fd.append('username', username);
  fd.append('password', password);
  await request('/api/login', { method: 'POST', body: fd });
}

async function ensureUser(username, password, nickname) {
  try {
    await register(username, password, nickname);
  } catch {
    await login(username, password);
    console.log(`  用户 ${username} 已存在，已登录`);
  }
}

async function ensureBoards() {
  const { boards } = await request('/api/boards');
  if (boards?.length > 0) {
    console.log(`  已有 ${boards.length} 个板块，跳过创建`);
    return boards.map((b) => b.id);
  }
  const ids = [
    await createBoard('技术交流', 'Go、前端、架构与工具', 1),
    await createBoard('生活杂谈', '日常、户外、读书与闲聊', 2),
    await createBoard('问答求助', '提问与互助', 3),
  ];
  return ids;
}

async function createBoard(name, description, sortOrder) {
  const data = await request('/api/admin/boards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, sort_order: sortOrder }),
  });
  console.log(`  板块「${name}」 id=${data.board.id}`);
  return data.board.id;
}

async function createPost(boardId, title, content, tags = '') {
  const fd = new FormData();
  fd.append('board_id', String(boardId));
  fd.append('title', title);
  fd.append('content', content);
  fd.append('tags', tags);
  const data = await request('/api/posts', { method: 'POST', body: fd });
  return data.post_id;
}

let postActionCount = 0;

/** 发帖限流：每分钟最多 10 次 */
async function createPostThrottled(boardId, title, content, tags = '') {
  if (postActionCount >= 9) {
    console.log('  （发帖限流，等待 62 秒…）');
    await sleep(62000);
    postActionCount = 0;
  }
  postActionCount++;
  return createPost(boardId, title, content, tags);
}

async function updatePost(id, title, content, tags = '') {
  const fd = new FormData();
  fd.append('title', title);
  fd.append('content', content);
  fd.append('tags', tags);
  await request(`/api/posts/${id}`, { method: 'PUT', body: fd });
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

const longSection = Array.from({ length: 20 }, (_, i) => {
  const n = i + 1;
  return `<h3>第 ${n} 节</h3><p>虚拟滚动压测段落 ${n}：中英文混排 Mixed Content，标点——「」、…、！？。用于检验列表滚动与详情渲染性能。</p>`;
}).join('');

const richPost = {
  title: '【测试】富文本排版大全',
  tags: '测试,排版,富文本',
  content: `<h2>标题与段落</h2>
<p>普通正文：<strong>加粗</strong>、<em>斜体</em>、<u>下划线</u>、<s>删除线</s>。</p>
<ul><li>Go 单二进制</li><li>React SPA</li><li>SQLite</li></ul>
<ol><li>注册</li><li>发帖</li><li>回复</li></ol>
<blockquote><p>引用：论坛的价值在于记录。</p></blockquote>
<p>代码：<code>npm run build</code></p>
<pre><code>func main() { fmt.Println("Hello") }</code></pre>
<p><a href="https://git.iioio.com/freefire/jiang13-forum" target="_blank" rel="noopener noreferrer">仓库链接</a></p>
<hr><p>排版元素应全部正常。</p>`,
};

const postTemplates = [
  richPost,
  {
    title: '【测试】登录可见区块',
    tags: '测试,会员专属',
    content: `<p>公开导读。</p>
<members-only><p>仅登录可见：内部纪要、未公开方案与敏感摘要。游客应见模糊占位与登录引导。</p></members-only>
<p>公开结尾。</p>`,
  },
  {
    title: '【测试】图片图文混排',
    tags: '测试,图片',
    content: `<p>占位图测试：</p>
<p><img src="https://picsum.photos/seed/jiang13/800/400" alt="配图"></p>
<p><img src="https://picsum.photos/seed/forum2/400/300" alt="小图"></p>`,
  },
  {
    title: '【测试】超长帖 · 虚拟滚动',
    tags: '测试,长文',
    content: `<h2>长文说明</h2><p>压测首页虚拟滚动。</p>${longSection}<p><strong>结束</strong></p>`,
  },
  {
    title: '【测试】短帖',
    tags: '测试',
    content: '<p>极简短帖，测试列表最小高度。</p>',
  },
  {
    title: '【测试】多级标题 H2~H6',
    tags: '测试,标题',
    content: '<h2>H2</h2><p>正文</p><h3>H3</h3><p>正文</p><h4>H4</h4><p>正文</p><h5>H5</h5><p>正文</p><h6>H6</h6><p>正文</p>',
  },
  {
    title: '【测试】混合登录可见 + 富文本',
    tags: '测试,会员专属',
    content: `<h2>公开</h2><p>所有人可见。</p>
<members-only><p><strong>隐藏</strong> <em>斜体</em> <code>tag</code></p></members-only>
<blockquote><p>公开引用。</p></blockquote>`,
  },
  {
    title: '【测试】特殊字符与 Emoji',
    tags: '测试,编码',
    content: '<p>&lt;script&gt; 应转义。Emoji 🎉 🚀 中日韩 姜十三</p><p>α+β=γ →←</p>',
  },
  {
    title: '【测试】多标签',
    tags: 'Go,React,SQLite,部署,开源',
    content: '<p>五标签帖，测搜索与展示。Go + Gin + React + TipTap。</p>',
  },
  {
    title: '【测试】换行保留',
    tags: '测试,换行',
    content: '<p>第一段。</p><p></p><p>第二段<br>换行<br>保留。</p>',
  },
  {
    title: '【搜索】姜十三论坛入门指南',
    tags: '教程,入门',
    content: '<p>姜十三论坛是一款轻量社区，支持富文本发帖与楼层回复。关键词：入门、部署、单二进制。</p>',
  },
  {
    title: '【搜索】SQLite 备份与恢复',
    tags: 'SQLite,运维',
    content: '<p>在管理后台可一键导出 jiang13_backup 数据库副本，适合小圈子冷备份。</p>',
  },
  {
    title: '【搜索】TipTap 编辑器使用技巧',
    tags: 'TipTap,编辑器',
    content: '<p>选中文字后使用工具栏设置格式，支持本地上传图片与登录可见区块。</p>',
  },
  {
    title: '周末徒步记录 · 西湖环线',
    tags: '生活,户外',
    content: '<p>周六走了西湖环线，天气不错，分享几张沿途风景。</p>',
  },
  {
    title: '求助：Go embed 静态资源路径',
    tags: '求助,Go',
    content: '<p>embed 打包 SPA 后 NoRoute 如何判断 SPA 路由？有经验的朋友吗？</p>',
  },
  {
    title: '分享：我的 homelab 配置',
    tags: 'homelab,分享',
    content: '<p>一台小主机跑论坛 + Gitea，2GB 内存够用，SQLite 省心。</p>',
  },
  {
    title: '【热门候选】年度最爱开源项目',
    tags: '讨论,开源',
    content: '<p>大家今年最喜欢的开源项目是什么？我先投 React 和 Go 一票。</p>',
  },
  {
    title: '【热门候选】轻量论坛选型讨论',
    tags: '讨论,论坛',
    content: '<p>小团队内部交流，更看重部署简单还是功能全？欢迎讨论。</p>',
  },
  {
    title: '【热门候选】前端虚拟滚动体验',
    tags: 'React,性能',
    content: '<p>TanStack Virtual 在长列表下确实流畅，欢迎分享调参经验。</p>',
  },
  {
    title: '草稿感帖子 · 待补充内容',
    tags: '随笔',
    content: '<p>先占个坑，晚点再写正文。</p>',
  },
  {
    title: '夜班摸鱼闲聊楼',
    tags: '闲聊',
    content: '<p>夜班同事来报到，今天咖啡喝了第几杯？</p>',
  },
  {
    title: '【修订测试】原始标题',
    tags: '测试,修订',
    content: '<p>这篇帖子将被编辑，用于测试修订历史与 diff 面板。</p>',
  },
];

async function main() {
  console.log(`连接 ${BASE} ...`);
  await request('/api/stats');

  console.log('\n1. 注册用户');
  await ensureUser('admin', 'admin123', '管理员');
  await ensureUser('alice', 'alice123', '爱丽丝');
  await ensureUser('bob', 'bob123', '鲍勃');

  console.log('\n2. 创建板块');
  await login('admin', 'admin123');
  const boards = await ensureBoards();

  console.log('\n3. 创建帖子');
  const postIds = [];
  let revisionPostId = null;
  for (let i = 0; i < postTemplates.length; i++) {
    const t = postTemplates[i];
    const boardId = boards[i % boards.length];
    const id = await createPostThrottled(boardId, t.title, t.content, t.tags);
    postIds.push(id);
    if (t.title.includes('修订测试')) revisionPostId = id;
    console.log(`  #${id} ${t.title}`);
  }

  for (let i = 1; i <= 12; i++) {
    const id = await createPostThrottled(
      boards[i % boards.length],
      `列表填充帖 #${i}`,
      `<p>填充首页列表与分页，编号 ${i}。内容简短，用于测排序与滚动。</p>`,
      '填充',
    );
    postIds.push(id);
    console.log(`  #${id} 列表填充帖 #${i}`);
  }

  if (revisionPostId) {
    await updatePost(
      revisionPostId,
      '【修订测试】已修改标题',
      '<p>正文已更新：用于验证修订历史、diff 展示与「已编辑」标记。</p><p>新增第二段内容。</p>',
      '测试,修订,已改',
    );
    console.log(`  已编辑帖子 #${revisionPostId}（修订历史）`);
  }

  console.log('\n4. 评论与互动');
  const hotIds = postIds.filter((_, i) => postTemplates[i]?.title?.includes('热门候选'));
  const qaPostId = postIds[postTemplates.findIndex((t) => t.title.includes('embed'))] ?? postIds[0];

  await login('alice', 'alice123');
  await addComment(postIds[0], '第一条评论，测试楼层显示。');
  const aliceComment = await addComment(postIds[0], '同意，排版帖很有参考价值。');
  await addComment(qaPostId, '同问，embed 路径我也踩过坑。');

  await login('bob', 'bob123');
  await addComment(postIds[0], '引用回复测试', aliceComment);
  await addComment(hotIds[0] ?? postIds[0], '我投 Vite + Go embed！');
  await addComment(hotIds[1] ?? postIds[0], '部署简单更重要，小圈子够用就行。');

  await login('admin', 'admin123');
  await addComment(postIds[0], '管理员也来回复一楼。');
  for (const id of hotIds) {
    await likePost(id);
  }
  await login('alice', 'alice123');
  for (const id of hotIds) {
    await likePost(id);
  }
  await login('bob', 'bob123');
  for (const id of hotIds) {
    await likePost(id);
  }

  console.log('\n5. 置顶与锁定');
  await login('admin', 'admin123');
  await pinPost(postIds[0]);
  console.log(`  置顶 #${postIds[0]}`);
  if (postIds[1]) {
    await pinPost(postIds[1]);
    console.log(`  置顶 #${postIds[1]}`);
  }
  const lockId = postIds[postTemplates.length - 2] ?? postIds.at(-1);
  if (lockId) {
    await lockPost(lockId);
    console.log(`  锁定编辑 #${lockId}`);
  }

  const stats = await request('/api/stats');
  const list = await request('/api/posts?page=1&size=1');

  console.log('\n========== 种子数据完成 ==========');
  console.log(`用户：admin / admin123（管理员）`);
  console.log(`      alice / alice123，bob / bob123`);
  console.log(`板块：${boards.length} 个`);
  console.log(`帖子：${list.total} 篇`);
  console.log(`统计：会员 ${stats.users} · 帖子 ${stats.posts} · 板块 ${stats.boards}`);
  console.log('==================================\n');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error('\n种子失败：', err.message);
  console.error('请确认服务已启动，例如：.\\dist\\jiang13.exe');
  process.exit(1);
});

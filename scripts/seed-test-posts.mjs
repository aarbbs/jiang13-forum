/**
 * 批量创建测试帖子，用于验证编辑器渲染、列表滚动、登录可见等功能
 */
const BASE = 'http://localhost:8080';
const TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJ1c2VybmFtZSI6InRlc3R1Iiwicm9sZSI6ImFkbWluIiwiZXhwIjoxNzgyMDYyODI2LCJpYXQiOjE3ODE0NTgwMjZ9.QmsRTyj_2YqmGHw_Mw7_gwmo-WbHtTeyqkWrTRfccV4';

const longBody = Array.from({ length: 30 }, (_, i) => {
  const n = i + 1;
  return `<h3>第 ${n} 节</h3><p>虚拟滚动测试段落 ${n}：Lorem ipsum 论坛长文压测内容，包含中英文混排 Mixed Content 以及标点符号——「」、『』、…、！？。重复文本有助于观察滚动条、已读标记与列表项高度是否稳定。</p>`;
}).join('');

const posts = [
  {
    board_id: '1',
    title: '【测试】富文本排版大全',
    tags: '测试,排版,富文本',
    content: `<h2>标题与段落</h2>
<p>这是一段普通正文，包含 <strong>加粗</strong>、<em>斜体</em>、<u>下划线</u> 和 <s>删除线</s> 样式。</p>
<h3>无序列表</h3>
<ul>
<li>第一项：Go 单二进制部署</li>
<li>第二项：React SPA 内嵌</li>
<li>第三项：SQLite 零依赖</li>
</ul>
<h3>有序列表</h3>
<ol>
<li>注册账号</li>
<li>选择板块发帖</li>
<li>楼层式回复互动</li>
</ol>
<blockquote><p>引用块：论坛的价值在于记录，而不只是展示。</p></blockquote>
<p>行内代码示例：<code>npm run build</code>，多行代码块：</p>
<pre><code>func main() {
    fmt.Println("Hello Jiang13 Forum")
}</code></pre>
<p>外链测试：<a href="https://git.iioio.com/freefire/jiang13-forum" target="_blank" rel="noopener noreferrer">姜十三论坛仓库</a></p>
<hr>
<p>分隔线以上，排版元素应全部正常显示。</p>`,
  },
  {
    board_id: '2',
    title: '【测试】登录可见区块',
    tags: '测试,会员专属',
    content: `<p>以下内容对游客隐藏，登录后可完整阅读。</p>
<members-only><p>这是会员专属段落：包含内部讨论纪要、未公开方案和敏感数据摘要。游客应看到模糊占位与登录引导按钮。</p></members-only>
<p>公开结尾：欢迎登录后查看上文隐藏内容。</p>`,
  },
  {
    board_id: '1',
    title: '【测试】图片与图文混排',
    tags: '测试,图片',
    content: `<p>下图使用占位图服务，用于验证图片自适应与懒加载：</p>
<p><img src="https://picsum.photos/seed/jiang13/800/400" alt="论坛测试配图"></p>
<p>图片下方继续正文，检查间距与圆角是否正常。</p>
<p><img src="https://picsum.photos/seed/forum2/400/300" alt="小图测试"></p>
<p>两张不同尺寸图片混排，移动端不应溢出容器。</p>`,
  },
  {
    board_id: '2',
    title: '【测试】超长帖子 · 虚拟滚动压测',
    tags: '测试,长文',
    content: `<h2>长文压测说明</h2>
<p>本帖用于测试首页虚拟滚动与详情页渲染性能，正文重复段落以撑满屏幕。</p>
${longBody}
<p><strong>长文结束</strong>，如滚动流畅则通过。</p>`,
  },
  {
    board_id: '1',
    title: '【测试】短帖 · 单行标题',
    tags: '测试',
    content: '<p>极简短帖，仅一句话，用于测试列表项最小高度与摘要截取。</p>',
  },
  {
    board_id: '2',
    title: '【测试】多级标题 H2~H6',
    tags: '测试,标题',
    content: `<h2>二级标题 H2</h2>
<p>H2 下方正文。</p>
<h3>三级标题 H3</h3>
<p>H3 下方正文。</p>
<h4>四级标题 H4</h4>
<p>H4 下方正文。</p>
<h5>五级标题 H5</h5>
<p>H5 下方正文。</p>
<h6>六级标题 H6</h6>
<p>H6 下方正文，六级标题字号应明显小于 H2。</p>`,
  },
  {
    board_id: '1',
    title: '【测试】混合登录可见 + 富文本',
    tags: '测试,会员专属,排版',
    content: `<h2>公开前言</h2>
<p>所有人可见的导读部分。</p>
<members-only>
<p>隐藏区 <strong>加粗</strong> 与 <em>斜体</em>：</p>
<ul>
<li>内部链接 <a href="/compose">发帖入口</a></li>
<li>代码 <code>members-only</code> 标签</li>
</ul>
</members-only>
<blockquote><p>公开引用：登录后上文应展开为完整富文本。</p></blockquote>`,
  },
  {
    board_id: '2',
    title: '【测试】特殊字符与 Emoji',
    tags: '测试,编码',
    content: `<p>特殊符号：&lt;script&gt;alert(1)&lt;/script&gt; 应被转义或过滤，不可执行。</p>
<p>Emoji：🎉 🚀 ✅ ❤️ 🔥 中日韩：姜十三论坛</p>
<p>数学符号：α + β = γ，箭头 → ← ↑ ↓</p>
<p>全角标点：，。！？；：""''【】</p>`,
  },
  {
    board_id: '1',
    title: '【测试】多标签帖子',
    tags: 'Go,React,SQLite,部署,开源',
    content: `<p>本帖携带五个标签，用于测试标签展示、搜索与筛选。</p>
<p>技术栈：Go + Gin + GORM + SQLite + React + TipTap。</p>`,
  },
  {
    board_id: '2',
    title: '【测试】空行与换行保留',
    tags: '测试,换行',
    content: `<p>第一段，后面有两个空行。</p>
<p></p>
<p></p>
<p>第二段，中间有<br>手动换行<br>应保留。</p>
<p>第三段结束。</p>`,
  },
];

async function createPost(post) {
  const fd = new FormData();
  fd.append('board_id', post.board_id);
  fd.append('title', post.title);
  fd.append('content', post.content);
  fd.append('tags', post.tags || '');

  const res = await fetch(`${BASE}/api/posts`, {
    method: 'POST',
    headers: { Cookie: `jiang13_token=${TOKEN}` },
    body: fd,
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || res.statusText);
  console.log(`  OK post_id=${data.post_id} ${post.title}`);
  return data.post_id;
}

async function pinPost(postId) {
  const res = await fetch(`${BASE}/api/admin/posts/${postId}/pin`, {
    method: 'POST',
    headers: {
      Cookie: `jiang13_token=${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pinned: true }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || res.statusText);
  console.log(`  PIN post_id=${postId}`);
}

async function main() {
  console.log(`开始创建 ${posts.length} 篇测试帖子...`);
  const ids = [];
  for (const post of posts) {
    ids.push(await createPost(post));
    await new Promise((r) => setTimeout(r, 150));
  }
  if (ids.length > 0) await pinPost(ids[0]);

  const list = await fetch(`${BASE}/api/posts?page=1&size=50`).then((r) => r.json());
  console.log(`\n完成！当前帖子总数：${list.total}`);
  console.log(`新建帖子 ID：${ids.join(', ')}`);
}

main().catch((err) => {
  console.error('失败：', err.message);
  process.exit(1);
});

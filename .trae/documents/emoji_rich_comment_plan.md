# 评论表情包改造 + 富文本评论编辑器计划

## 一、摘要

将评论系统从「纯文本 textarea + Unicode Emoji」升级为「Tiptap 富文本编辑器 + 姜十三专属 SVG 贴纸」，实现：
1. 去除所有 Unicode Emoji，替换为自定义 SVG 贴纸（懒加载）
2. 姜十三专属表情包：萌系吉祥物表情 + 中文网络流行语文字气泡（混合风格）
3. 评论复用帖子编辑器核心能力（精简变体），支持代码块、链接、图片、格式化等

---

## 二、当前状态分析

### 2.1 评论输入：纯文本 textarea

[CommentBox.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/CommentBox.tsx) 使用 `<textarea>` 输入评论，功能包括：
- `@` 用户提及（textarea 选区扫描 + API 搜索用户）
- Unicode Emoji 面板（[EmojiPicker.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/EmojiPicker.tsx) + [emojis.ts](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/utils/emojis.ts)）
- 隐私评论开关
- 无富文本格式化能力

### 2.2 评论渲染：纯文本转义

[CommentContent.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/CommentContent.tsx) 通过 [content.ts](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/utils/content.ts) 的 `highlightMentions()` 渲染评论：
- `escapeWithBreaks()` 转义 HTML 并将 `\n` 转为 `<br>`
- 正则匹配 `@username` 包裹为可点击 `<span class="mention">`
- 不支持 HTML/Markdown 渲染

### 2.3 评论编辑：纯 textarea

[CommentThreadList.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/CommentThreadList.tsx#L276-L297) 编辑模式使用 `<textarea>` 直接修改文本。

### 2.4 帖子编辑器：Tiptap 富文本

[ArticleEditor.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/ArticleEditor.tsx) 是功能完整的 Tiptap 编辑器（900 行），包含：
- 富文本模式 + Markdown 模式切换
- 工具栏：标题/加粗/斜体/下划线/删除线/分割线/引用/列表/代码块/表格/链接/图片/图组
- 门控区块：登录可见/回复可见/积分可见
- 全屏模式
- `forwardRef` 暴露 `getHTML()` / `isEmpty()` / `focus()`
- 使用 `DOMPurify` + `POST_CONTENT_PURIFY_CONFIG` 净化 HTML

### 2.5 后端评论存储

- [models.go](file:///c:/Users/freefire/Documents/jiang13-forum/model/models.go#L143-L164): `Comment.Content` 字段类型为 `text`，存储纯文本
- [comment.go](file:///c:/Users/freefire/Documents/jiang13-forum/service/comment.go#L172-L176): `Create()` 仅做 `TrimSpace` + 敏感词过滤，**无 HTML 净化**
- [handlers.go](file:///c:/Users/freefire/Documents/jiang13-forum/handler/handlers.go#L508-L530): `APICreateComment` 从 FormData 取 `content` 字段
- [sanitize_html.go](file:///c:/Users/freefire/Documents/jiang13-forum/service/sanitize_html.go): `SanitizePostHTML` 已有 HTML 白名单策略（bluemonday），但**仅用于帖子，未用于评论**

### 2.6 表情数据

[emojis.ts](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/utils/emojis.ts) 定义约 160 个 Unicode Emoji 字符，无分类、无搜索。

---

## 三、修改方案

### Part A：姜十三专属 SVG 贴纸系统

#### A1. 贴纸数据定义

**新建** `frontend/src/data/stickers.ts`

```typescript
export interface Sticker {
  id: string;          // 唯一ID，如 "j13-happy"
  name: string;        // 名称，如 "开心"
  category: StickerCategory;
  aliases?: string[];  // 搜索别名
  svg: string;         // 完整 SVG 字符串（含 viewBox 0 0 64 64）
}

export type StickerCategory = '热门' | '姜十三' | '文字气泡';

export const STICKER_CATEGORIES: StickerCategory[] = ['热门', '姜十三', '文字气泡'];
export const STICKERS: Sticker[] = [ /* ... */ ];
```

**贴纸内容设计（约 40 个）：**

| 分类 | 数量 | 内容 |
|------|------|------|
| 姜十三 | 16 | 萌系姜色（ginger色 #D4A574）圆脸吉祥物，额头带"13"标记，各种表情：开心/大笑/哭泣/生气/惊讶/思考/点赞/心心眼/睡觉/疑惑/酷/捂脸/送花/鼓掌/加油/拜托 |
| 文字气泡 | 16 | 圆角气泡 + 中文网络流行语：666/大佬/同问/给力/沙发/学习了/已赞/佩服/妙啊/牛批/感谢/收藏了/围观/催更/瑞思拜/芜湖 |
| 热门 | 8 | 从上述两类中精选最常用的 8 个 |

**SVG 设计规范：**
- `viewBox="0 0 64 64"` 统一尺寸
- 所有 fill 使用内联颜色（不依赖 CSS 变量）
- 姜十三吉祥物主色系：`#D4A574`（姜色）/ `#FFF3E0`（浅姜）/ `#E8B87C`（深姜）
- 文字气泡：`#FF6B6B`（红）/ `#4ECDC4`（青）/ `#FFE66D`（黄）/ `#95E1D3`（绿）四色循环
- 线条圆润，stroke-linecap: round

#### A2. SVG 贴纸渲染组件

**新建** `frontend/src/components/emoji/StickerSvg.tsx`

```typescript
interface StickerSvgProps {
  id: string;
  size?: number;       // 默认 28
  className?: string;
}
```

- 从 `STICKERS` 查找对应 id，渲染 `dangerouslySetInnerHTML={{ __html: sticker.svg }}`
- SVG 已自包含 fill 颜色，无需额外样式

#### A3. 贴纸选择器（懒加载）

**新建** `frontend/src/components/emoji/StickerPicker.tsx`

```typescript
interface StickerPickerProps {
  onSelect: (stickerId: string) => void;
}
```

**UI 结构：**
```
┌──────────────────────────────┐
│ [热门] [姜十三] [文字气泡]    │ ← 分类 Tab
├──────────────────────────────┤
│ [🙂] [😂] [❤️] [👍] [🎉] ... │ ← SVG 贴纸网格（6列桌面/4列移动端）
└──────────────────────────────┘
```

**懒加载策略：**
- 贴纸数据按分类拆分为独立 chunk：`data/stickers/j13.ts`、`data/stickers/text.ts`、`data/stickers/hot.ts`
- `StickerPicker` 使用 `React.lazy()` + `Suspense` 按需加载当前分类
- 切换分类时才加载对应 chunk，首次打开只加载"热门"分类
- 每个贴纸 SVG 在组件挂载时渲染（已在数据中内联，无需额外网络请求）

**交互：**
- 分类 Tab 点击切换，带下划线动画
- 贴纸 hover: `transform: scale(1.15)`, 0.1s 过渡
- 点击贴纸触发 `onSelect(sticker.id)`
- 键盘导航：方向键浏览 + Enter 选中

#### A4. 删除旧 Emoji 系统

- **删除** [emojis.ts](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/utils/emojis.ts)（`EMOJI_LIST` 导出）
- **删除** [EmojiPicker.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/EmojiPicker.tsx)
- **保留** `.emoji-picker*` CSS 类（避免影响其他可能的引用），新增 `.sticker-picker*` 类

---

### Part B：评论富文本编辑器（精简变体）

#### B1. 创建 CommentEditor 组件

**新建** `frontend/src/components/CommentEditor.tsx`

不直接复用 ArticleEditor（900 行，含全屏/Markdown/门控区块等评论不需要的功能），而是创建独立的精简 Tiptap 编辑器，**复用 ArticleEditor 的扩展组件**。

```typescript
export interface CommentEditorHandle {
  getHTML: () => string;
  isEmpty: () => boolean;
  focus: () => void;
}

interface CommentEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}
```

**使用的 Tiptap 扩展（复用现有）：**
- `StarterKit`（含 heading H2-H4、bold/italic/strike、blockquote、bulletList/orderedList、horizontalRule）
- `Underline`（来自 @tiptap/extension-underline，已安装）
- `Link`（来自 @tiptap/extension-link，已安装）
- `ArticleCodeBlock`（来自 [ArticleCodeBlockExtension.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/editor/ArticleCodeBlockExtension.tsx)，复用）
- `Placeholder`（来自 @tiptap/extension-placeholder，已安装）
- `TabIndent`（来自 [TabIndentExtension.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/editor/TabIndentExtension.tsx)，复用）
- `ArticleImage`（来自 [ArticleImageExtension.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/editor/ArticleImageExtension.tsx)，复用，用于插入图片）

**不使用的扩展（评论场景不需要）：**
- ~~TableKit~~（表格）
- ~~ImageGroup~~（图组）
- ~~MembersOnly / ReplyOnly / PointsOnly~~（门控区块）
- ~~ClearFloatParagraph~~（清除浮动段落）
- ~~Markdown 模式~~
- ~~全屏模式~~

**工具栏按钮（精简版）：**
```
[H] [B] [I] [U] [S] [引用] [列表] [有序列表] [代码块] [链接] [图片] [贴纸]
```

**贴纸集成：**
- 工具栏增加贴纸按钮（Lucide `Sticker` 图标）
- 点击弹出 `StickerPicker`
- 选中贴纸后，将 SVG 作为 inline `<img>` 插入编辑器：
  ```typescript
  const sticker = STICKERS.find(s => s.id === id);
  const dataUri = `data:image/svg+xml,${encodeURIComponent(sticker.svg)}`;
  editor.chain().focus().setImage({ src: dataUri, alt: sticker.name }).run();
  ```

**HTML 净化：**
- 使用 `DOMPurify.sanitize(html, POST_CONTENT_PURIFY_CONFIG)` 与 ArticleEditor 一致
- `POST_CONTENT_PURIFY_CONFIG` 来自 [postContent.ts](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/utils/postContent.ts)，复用现有配置

#### B2. 改造 CommentBox

**修改** [CommentBox.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/CommentBox.tsx)

**主要变更：**
1. 用 `CommentEditor` 替换 `<textarea>`
2. 用 `CommentEditorHandle` ref 替代 `textareaRef`
3. `content` 状态存储 HTML 而非纯文本
4. 移除 `EmojiPicker` 导入和使用，贴纸功能已集成到 `CommentEditor`
5. 移除 `owoRef` 和 `showEmoji` 状态
6. `@` 提及功能：暂时保留为文本输入（在编辑器中输入 `@username`，渲染时由 `processCommentHtml` 处理高亮），编辑器内自动补全作为后续增强
7. `insertEmoji` 改为 `insertSticker`，调用 `CommentEditor` ref 方法
8. 隐私评论开关保留
9. 发送时 `content` 为 HTML，直接传给 API

**改动前：**
```tsx
<textarea ref={textareaRef} value={content} onChange={handleChange} ... />
<button ref={owoRef} onClick={() => setShowEmoji(v => !v)}>OwO</button>
{showEmoji && <EmojiPicker onSelect={insertEmoji} />}
```

**改动后：**
```tsx
<CommentEditor ref={editorRef} value={content} onChange={setContent} placeholder="说点什么吧…" />
```

#### B3. 改造评论编辑模式

**修改** [CommentThreadList.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/CommentThreadList.tsx#L276-L297)

编辑模式从 `<textarea>` 改为 `CommentEditor`：
```tsx
// 改动前
<textarea value={editText} onChange={e => setEditText(e.target.value)} rows={3} />

// 改动后
<CommentEditor value={editText} onChange={setEditText} placeholder="编辑评论…" />
```

需要 import `CommentEditor`，并在 `handleSave` 中提交 HTML 内容。

---

### Part C：评论内容渲染

#### C1. 更新 content.ts 支持富文本

**修改** [content.ts](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/utils/content.ts)

当前 `highlightMentions()` 处理纯文本（转义 HTML + 换行 + @高亮）。需要新增 HTML 处理能力。

```typescript
import DOMPurify from 'dompurify';
import { POST_CONTENT_PURIFY_CONFIG } from '../utils/postContent';

/** 判断内容是否为 HTML（包含常见 HTML 标签） */
function isHtmlContent(text: string): boolean {
  return /<(?:p|div|span|br|h[1-6]|ul|ol|li|pre|code|blockquote|a|img|table|strong|em|u|s)\b/i.test(text);
}

/** 在 HTML 文本节点中高亮 @ 提及（DOM 遍历，避免破坏标签） */
function processMentionsInHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }
  for (const textNode of textNodes) {
    const text = textNode.textContent ?? '';
    if (!/@[\w\u4e00-\u9fa5_-]/.test(text)) continue;
    const frag = document.createDocumentFragment();
    const parts = text.split(/(@[\w\u4e00-\u9fa5_-]+)/);
    for (const part of parts) {
      const m = part.match(/^@([\w\u4e00-\u9fa5_-]+)$/);
      if (m) {
        const span = document.createElement('span');
        span.className = 'mention';
        span.setAttribute('data-name', m[1]);
        span.setAttribute('role', 'link');
        span.setAttribute('tabindex', '0');
        span.textContent = part;
        frag.appendChild(span);
      } else if (part) {
        frag.appendChild(document.createTextNode(part));
      }
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }
  return div.innerHTML;
}

/** 渲染评论内容：HTML 净化 + @提及高亮，兼容旧版纯文本 */
export function renderCommentContent(content: string): string {
  if (isHtmlContent(content)) {
    // 新版 HTML 评论
    const sanitized = DOMPurify.sanitize(content, POST_CONTENT_PURIFY_CONFIG);
    return processMentionsInHtml(sanitized);
  }
  // 旧版纯文本评论（向后兼容）
  return escapeWithBreaks(content).replace(
    /@([\w\u4e00-\u9fa5_-]+)/g,
    '<span class="mention" data-name="$1" role="link" tabindex="0">@$1</span>',
  );
}
```

保留原 `highlightMentions()` 函数不删除（可能有其他引用），新增 `renderCommentContent()`。

#### C2. 更新 CommentContent 组件

**修改** [CommentContent.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/CommentContent.tsx)

```tsx
import { renderCommentContent } from '../utils/content';

// 改动前
dangerouslySetInnerHTML={{ __html: highlightMentions(content) }}

// 改动后
dangerouslySetInnerHTML={{ __html: renderCommentContent(content) }}
```

评论内容中的贴纸 `<img>` 标签会被 `POST_CONTENT_PURIFY_CONFIG` 保留（已允许 `<img>` + `src`），自然渲染为 SVG 图。

---

### Part D：后端评论 HTML 净化

#### D1. 评论创建时净化

**修改** [comment.go](file:///c:/Users/freefire/Documents/jiang13-forum/service/comment.go#L172-L176)

```go
func (s *CommentService) Create(in CommentCreateInput) (*model.Comment, error) {
    content := SanitizePostHTML(strings.TrimSpace(in.Content))  // 新增 HTML 净化
    content = s.filter.Filter(content)                           // 敏感词过滤
    // ... 其余不变
}
```

#### D2. 评论更新时净化

**修改** [comment.go](file:///c:/Users/freefire/Documents/jiang13-forum/service/comment.go#L354-L376)

```go
func (s *CommentService) Update(userID, commentID uint, isAdmin, skipModeration bool, content string) (string, bool, error) {
    // ...
    content = SanitizePostHTML(strings.TrimSpace(content))  // 新增
    content = s.filter.Filter(content)                       // 敏感词过滤
    // ... 其余不变
}
```

`SanitizePostHTML` 已在 [sanitize_html.go](file:///c:/Users/freefire/Documents/jiang13-forum/service/sanitize_html.go) 中定义，使用 bluemonday 白名单策略，允许 Tiptap 产出的 HTML 标签和属性，禁止 `<script>`、`<style>` 等。

---

### Part E：CSS 样式

#### E1. 贴纸选择器样式

**修改** [global.css](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/styles/global.css#L5427-L5462) 区域

新增样式块（在现有 `.emoji-picker*` 样式之后）：

```css
/* 贴纸选择器 */
.sticker-picker {
  display: flex;
  flex-direction: column;
  margin-top: 8px;
  border: 1px solid var(--j13-border-light);
  border-radius: 8px;
  background: var(--j13-bg-surface);
  max-height: 280px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.sticker-picker-tabs {
  display: flex;
  border-bottom: 1px solid var(--j13-border-light);
  padding: 0 8px;
}

.sticker-picker-tab {
  border: none;
  background: none;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--color-text-3);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}

.sticker-picker-tab.active {
  color: var(--j13-green);
  border-bottom-color: var(--j13-green);
}

.sticker-picker-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 4px;
  padding: 10px;
  overflow-y: auto;
  flex: 1;
}

.sticker-picker-item {
  border: none;
  background: none;
  padding: 4px;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.1s, transform 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sticker-picker-item:hover {
  background: var(--color-fill-2);
  transform: scale(1.15);
}

/* 贴纸加载占位 */
.sticker-picker-loading {
  grid-column: 1 / -1;
  text-align: center;
  padding: 24px;
  color: var(--color-text-4);
  font-size: 13px;
}

/* 移动端 */
@media (max-width: 640px) {
  .sticker-picker-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
```

#### E2. 评论编辑器样式

新增 `.comment-editor` 相关样式，复用 `.article-editor-bar`、`.article-tool-btn` 等现有类名，仅做覆盖调整：

```css
/* 评论富文本编辑器 */
.comment-editor .article-editor-bar {
  padding: 4px 8px;
}

.comment-editor .article-tool-btn {
  width: 28px;
  height: 28px;
}

.comment-editor .article-editor-content {
  min-height: 80px;
  max-height: 300px;
  overflow-y: auto;
  padding: 8px 12px;
  font-size: 14px;
}

.comment-editor .article-editor-status {
  padding: 4px 10px;
}

/* 评论内贴纸图片 */
.comment-sticker {
  display: inline-block;
  vertical-align: middle;
  width: 28px;
  height: 28px;
  margin: 0 2px;
}
```

---

## 四、文件变更清单

### 新增文件

| 文件路径 | 用途 |
|----------|------|
| `frontend/src/data/stickers/hot.ts` | 热门贴纸数据（懒加载 chunk） |
| `frontend/src/data/stickers/j13.ts` | 姜十三吉祥物贴纸数据（懒加载 chunk） |
| `frontend/src/data/stickers/text.ts` | 文字气泡贴纸数据（懒加载 chunk） |
| `frontend/src/data/stickers/index.ts` | 贴纸类型定义 + 统一导出 |
| `frontend/src/components/emoji/StickerSvg.tsx` | SVG 贴纸渲染组件 |
| `frontend/src/components/emoji/StickerPicker.tsx` | 贴纸选择器（懒加载） |
| `frontend/src/components/CommentEditor.tsx` | 评论富文本编辑器（精简 Tiptap） |

### 修改文件

| 文件 | 变更 |
|------|------|
| [CommentBox.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/CommentBox.tsx) | textarea → CommentEditor，移除 EmojiPicker，content 改为 HTML |
| [CommentThreadList.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/CommentThreadList.tsx#L276-L297) | 编辑模式 textarea → CommentEditor |
| [CommentContent.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/CommentContent.tsx) | 使用 `renderCommentContent()` 替代 `highlightMentions()` |
| [content.ts](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/utils/content.ts) | 新增 `renderCommentContent()` + `processMentionsInHtml()` |
| [global.css](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/styles/global.css#L5427-L5462) | 新增 `.sticker-picker*` 和 `.comment-editor*` 样式 |
| [comment.go](file:///c:/Users/freefire/Documents/jiang13-forum/service/comment.go#L172-L176) | Create() 增加 `SanitizePostHTML` |
| [comment.go](file:///c:/Users/freefire/Documents/jiang13-forum/service/comment.go#L354-L376) | Update() 增加 `SanitizePostHTML` |

### 删除文件

| 文件 | 原因 |
|------|------|
| [emojis.ts](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/utils/emojis.ts) | Unicode Emoji 数据不再需要 |
| [EmojiPicker.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/EmojiPicker.tsx) | 被 StickerPicker 替代 |

---

## 五、假设与决策

### 5.1 编辑器决策

- **不直接复用 ArticleEditor 组件**，而是创建独立的 CommentEditor，原因：
  - ArticleEditor 900 行，含全屏/Markdown/门控区块等评论不需要的功能
  - 复用 ArticleEditor 的 Tiptap 扩展组件（ArticleCodeBlock、ArticleImage、TabIndent 等），避免代码重复
  - CommentEditor 更轻量，每个评论实例加载更快
- **@ 提及**：暂不在编辑器中实现自动补全（需要 Tiptap Mention 扩展或自定义扩展），用户手动输入 `@username`，渲染时由 `processMentionsInHtml` 高亮。后续可增强为 Tiptap Mention 扩展。

### 5.2 贴纸存储格式

- 贴纸以 `data:image/svg+xml` URI 内联在 `<img src="...">` 中
- 每个 SVG 约 300-800 字节，单条评论即使 10 个贴纸也仅 ~8KB
- 后端 `SanitizePostHTML` 白名单已允许 `<img src="...">`，无需额外修改
- 旧评论（纯文本）不受影响，`renderCommentContent` 自动检测并兼容

### 5.3 懒加载策略

- 贴纸数据按分类拆分为 3 个 chunk（hot/j13/text），`React.lazy()` 动态导入
- 首次打开选择器只加载"热门"chunk（8 个贴纸），切换分类时才加载其他 chunk
- 每个 chunk 约 5-10KB，加载延迟 < 100ms

### 5.4 向后兼容

- 旧评论为纯文本，新 `renderCommentContent()` 通过 `isHtmlContent()` 检测自动走旧路径（escapeWithBreaks + 正则高亮）
- 新评论为 HTML，走 DOMPurify 净化 + DOM 遍历高亮路径
- 后端 `SanitizePostHTML` 对纯文本也安全（bluemonday 会保留纯文本，仅过滤危险标签）

---

## 六、实施顺序

1. **Part A**：贴纸数据 + 组件（stickers/*.ts → StickerSvg → StickerPicker）
2. **Part D**：后端评论 HTML 净化（comment.go Create/Update 加 SanitizePostHTML）
3. **Part B**：CommentEditor 组件 → CommentBox 集成 → CommentThreadList 编辑模式
4. **Part C**：content.ts 渲染函数 → CommentContent 更新
5. **Part E**：CSS 样式
6. 删除旧 EmojiPicker / emojis.ts
7. 验证测试

---

## 七、验证步骤

1. **贴纸系统验证**：
   - 点击贴纸按钮，选择器弹出，3 个分类 Tab 可切换
   - 切换分类时加载对应贴纸（Network 面板确认懒加载）
   - 点击贴纸后编辑器中出现对应 SVG 图

2. **评论编辑器验证**：
   - 评论框支持加粗/斜体/下划线/删除线/标题/引用/列表/代码块/链接/图片/贴纸
   - 代码块支持语法高亮和折叠
   - 图片可上传并插入
   - 无全屏/Markdown/表格/门控区块按钮

3. **评论渲染验证**：
   - 新评论 HTML 正确渲染（格式化、代码块、图片、贴纸）
   - `@username` 在 HTML 评论中正确高亮为可点击链接
   - 旧评论（纯文本）仍正常渲染
   - 贴纸图片在评论中正确显示

4. **后端验证**：
   - 发送含 `<script>alert(1)</script>` 的评论，后端净化后移除 script 标签
   - 发送正常 HTML 评论，后端存储完整 HTML
   - 旧纯文本评论正常存储和渲染

5. **编辑模式验证**：
   - 编辑已有评论时，CommentEditor 正确加载 HTML 内容
   - 保存后评论更新正确

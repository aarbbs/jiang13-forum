# 表情效果调整计划

## 问题分析

当前实现存在 5 个问题，根因如下：

### 1. 插入表情后有选择状态（蓝色高亮）
- **根因**: Tiptap `setImage` 插入图片节点后，节点处于 "node-selected" 状态，显示蓝色选中框
- **位置**: [CommentEditor.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/CommentEditor.tsx) L155-163

### 2. 输入框表情太大
- **根因**: CSS 选择器 `img[src^="data:image/svg"]` 只匹配旧 SVG data URI，不匹配新的 AVIF URL（`/stickers/tieba/tb_01.avif`），导致表情图片无尺寸约束，以原始大尺寸渲染
- **位置**: [global.css](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/styles/global.css) L5584-5603

### 3. 插入表情后光标换行
- **根因**: `ArticleImage.configure({ inline: false })` 使图片为块级节点，插入后自动换行
- **位置**: [CommentEditor.tsx](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/components/CommentEditor.tsx) L92

### 4. 表情栏目太宽松
- **根因**: Grid 仅 6 列，gap 4px，padding 10px
- **位置**: [global.css](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/styles/global.css) L5502-5510

### 5. 颜文字太小
- **根因**: `.sticker-picker-text` 的 `font-size: 8px`，极小
- **位置**: [global.css](file:///c:/Users/freefire/Documents/jiang13-forum/frontend/src/styles/global.css) L5606-5616

## 改动方案

### 文件 1: CommentEditor.tsx
**改动 A — 图片改为内联** (L92):
```typescript
// 旧
ArticleImage.configure({ inline: false, allowBase64: true }),
// 新
ArticleImage.configure({ inline: true, allowBase64: true }),
```

**改动 B — insertSticker 插入后取消选中和换行** (L155-163):
```typescript
const insertSticker = useCallback((sticker: Sticker) => {
  if (!editor) return;
  if (sticker.type === 'text' && sticker.text) {
    editor.chain().focus().insertContent(sticker.text).run();
  } else if (sticker.url) {
    // 插入内联图片 + 尾随零宽空格，确保光标在图片后面而非选中图片
    editor.chain().focus().insertContent([
      { type: 'image', attrs: { src: sticker.url, alt: sticker.name } },
      { type: 'text', text: '\u200b' },
    ]).run();
  }
  setShowSticker(false);
}, [editor]);
```
> 用 `insertContent` + 零宽空格替代 `setImage`，避免 node-selected 状态，光标自然落在图片后。

### 文件 2: StickerPicker.tsx
**改动 C — 键盘导航列数匹配新网格** (L44):
```typescript
// 旧
const cols = 6;
// 新
const cols = 8;
```

### 文件 3: global.css
**改动 D — 表情选择器密度提升** (L5502-5510):
```css
.sticker-picker-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);  /* 6 → 8 */
  gap: 2px;                                /* 4px → 2px */
  padding: 6px;                            /* 10px → 6px */
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
```

**改动 E — 选择器项缩小** (L5512-5522):
```css
.sticker-picker-item {
  padding: 2px;   /* 4px → 2px */
  /* 其余不变 */
}
```

**改动 F — 颜文字字体放大** (L5606-5616):
```css
.sticker-picker-text {
  font-size: 14px;   /* 8px → 14px */
  line-height: 1.4;  /* 1.2 → 1.4 */
  /* 其余不变 */
}
```

**改动 G — 替换旧 SVG 选择器为通用贴纸选择器** (L5584-5603):

删除旧的 `img[src^="data:image/svg"]` 选择器，替换为基于 `/stickers/` 路径的选择器：

```css
/* 编辑器内贴纸 img 尺寸约束 */
.comment-editor .article-prosemirror img[src*="/stickers/"],
.comment-editor .article-editor-content img[src*="/stickers/"] {
  display: inline-block;
  width: 28px;
  height: 28px;
  vertical-align: middle;
  margin: 0 1px;
  border-radius: 4px;
  object-fit: contain;
}

/* 评论正文中的贴纸 img */
.floor-body img[src*="/stickers/"],
.comment-body img[src*="/stickers/"] {
  display: inline-block;
  vertical-align: middle;
  width: 28px;
  height: 28px;
  margin: 0 1px;
  background: transparent;
  border-radius: 4px;
  object-fit: contain;
}
```

**改动 H — 移动端网格也改为 8 列** (L5619-5624):
```css
@media (max-width: 640px) {
  .sticker-picker { max-height: 240px; }
  .sticker-picker-grid { grid-template-columns: repeat(6, 1fr); } /* 移动端 6 列 */
  .sticker-picker-tab { padding: 6px 10px; font-size: 12px; }
  .comment-editor .article-tool-btn { width: 30px; height: 30px; }
}
```
> 移动端保持 6 列（屏幕窄），桌面端 8 列。

## 不改动
- `ArticleImageExtension.tsx` — 无需修改，`inline: true` 通过 `configure()` 传入即可
- `kaomoji.ts` / `emojiData.ts` / `hot.ts` — 数据层不变
- `CommentContent.tsx` — 渲染层不变（CSS 覆盖即可）
- PostEditor（帖子编辑器）— 不受影响，仍使用 `inline: false`

## 验证
1. `npm run build` 无报错
2. 浏览器验证：
   - 选择表情后插入无蓝色选中框
   - 表情在输入框中显示 28px，内联在文字中
   - 插入表情后光标紧跟表情后方，不换行
   - 表情选择器 8 列密度更高
   - 颜文字标签内字体清晰可读

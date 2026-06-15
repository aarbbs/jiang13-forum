import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/react';

export const TAB_SPACES = '    ';

/** 收集选区覆盖的文本块 */
function collectSelectedTextblocks(editor: Editor): { pos: number }[] {
  const { from, to } = editor.state.selection;
  const blocks: { pos: number }[] = [];
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) {
      blocks.push({ pos });
      return false;
    }
    return undefined;
  });
  return blocks;
}

/** 代码块多行选区：每行首插入缩进 */
function indentCodeBlockSelection(editor: Editor): boolean {
  const { from, to, empty } = editor.state.selection;
  if (empty) return false;

  const text = editor.state.doc.textBetween(from, to, '\n', '\n');
  const lineStarts = [from];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') lineStarts.push(from + i + 1);
  }

  let tr = editor.state.tr;
  let offset = 0;
  lineStarts.forEach(pos => {
    tr = tr.insertText(TAB_SPACES, pos + offset);
    offset += TAB_SPACES.length;
  });
  editor.view.dispatch(tr);
  return true;
}

/** 代码块多行选区：每行首移除最多 4 个空格 */
function outdentCodeBlockSelection(editor: Editor): boolean {
  const { from, to, empty } = editor.state.selection;
  if (empty) return false;

  const doc = editor.state.doc;
  const text = doc.textBetween(from, to, '\n', '\n');
  const lineStarts = [from];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') lineStarts.push(from + i + 1);
  }

  let tr = editor.state.tr;
  let offset = 0;
  let changed = false;
  lineStarts.forEach(pos => {
    const adjPos = pos + offset;
    const lineEnd = doc.textBetween(adjPos, to + offset).split('\n')[0] ?? '';
    const match = lineEnd.match(/^ {1,4}/);
    if (!match) return;
    tr = tr.delete(adjPos, adjPos + match[0].length);
    offset -= match[0].length;
    changed = true;
  });

  if (!changed) return false;
  editor.view.dispatch(tr);
  return true;
}

/** 多行选区：在每个文本块行首插入缩进 */
function indentSelection(editor: Editor): boolean {
  const { empty } = editor.state.selection;
  if (empty) return false;

  if (editor.isActive('codeBlock')) {
    return indentCodeBlockSelection(editor);
  }

  if (editor.isActive('listItem')) {
    return editor.chain().focus().sinkListItem('listItem').run();
  }

  const blocks = collectSelectedTextblocks(editor);
  if (blocks.length === 0) return false;

  let tr = editor.state.tr;
  let offset = 0;
  blocks.forEach(({ pos }) => {
    const insertPos = pos + 1 + offset;
    tr = tr.insertText(TAB_SPACES, insertPos);
    offset += TAB_SPACES.length;
  });
  editor.view.dispatch(tr);
  return true;
}

/** 多行选区：移除每个文本块行首最多 4 个空格 */
function outdentSelection(editor: Editor): boolean {
  const { empty } = editor.state.selection;
  if (empty) return false;

  if (editor.isActive('codeBlock')) {
    return outdentCodeBlockSelection(editor);
  }

  if (editor.isActive('listItem')) {
    return editor.chain().focus().liftListItem('listItem').run();
  }

  const blocks = collectSelectedTextblocks(editor);
  if (blocks.length === 0) return false;

  let tr = editor.state.tr;
  let offset = 0;
  blocks.forEach(({ pos }) => {
    const node = editor.state.doc.nodeAt(pos);
    if (!node?.isTextblock) return;
    const text = node.textContent;
    const match = text.match(/^ {1,4}/);
    if (!match) return;
    const removeLen = match[0].length;
    const from = pos + 1 + offset;
    tr = tr.delete(from, from + removeLen);
    offset -= removeLen;
  });

  if (tr.steps.length === 0) return false;
  editor.view.dispatch(tr);
  return true;
}

/** 在代码块或段落中移除光标前的 4 个空格缩进 */
function outdentTextblock(editor: Editor): boolean {
  const { state } = editor;
  const { $from, empty } = state.selection;
  if (!empty) return false;
  if (!$from.parent.isTextblock) return false;

  const lineStart = $from.start();
  const beforeCursor = state.doc.textBetween(lineStart, $from.pos);

  if (beforeCursor.endsWith(TAB_SPACES)) {
    return editor.chain().focus().deleteRange({ from: $from.pos - TAB_SPACES.length, to: $from.pos }).run();
  }

  const leading = beforeCursor.match(/^ {1,4}/);
  if (leading) {
    return editor.chain().focus().deleteRange({ from: lineStart, to: lineStart + leading[0].length }).run();
  }

  return false;
}

/** Tab 缩进：列表缩进/反缩进，多行选区整体缩进，其余插入 4 个空格 */
export const TabIndent = Extension.create({
  name: 'tabIndent',

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (!editor.state.selection.empty) {
          return indentSelection(editor);
        }

        if (editor.isActive('codeBlock')) {
          return editor.chain().focus().insertContent(TAB_SPACES).run();
        }
        if (editor.isActive('listItem')) {
          return editor.chain().focus().sinkListItem('listItem').run();
        }
        return editor.chain().focus().insertContent(TAB_SPACES).run();
      },
      'Shift-Tab': ({ editor }) => {
        if (!editor.state.selection.empty) {
          return outdentSelection(editor);
        }

        if (editor.isActive('codeBlock')) {
          return outdentTextblock(editor);
        }
        if (editor.isActive('listItem')) {
          return editor.chain().focus().liftListItem('listItem').run();
        }
        return outdentTextblock(editor);
      },
    };
  },
});

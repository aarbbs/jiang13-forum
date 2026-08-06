/** CommonMark 围栏：开围栏行（最多 3 空格缩进 + 至少 3 个反引号） */
const OPEN_FENCE_RE = /^ {0,3}(`{3,})([^`\n]*)$/;
/** 闭围栏行：仅反引号与可选尾随空白 */
const CLOSE_FENCE_RE = /^ {0,3}(`{3,})[ \t]*$/;

/** 正文中最长连续反引号数；外层围栏需至少 longest+1（且 ≥ 3） */
export function fenceLengthForContent(text: string): number {
  let longest = 0;
  let run = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '`') {
      run += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  return Math.max(3, longest + 1);
}

/** 用足够长的围栏包裹代码正文（info 为语言/选项串，可为空） */
export function wrapFencedCode(info: string, text: string): string {
  const len = fenceLengthForContent(text);
  const fence = '`'.repeat(len);
  const open = info ? `${fence}${info}` : fence;
  return `\n\n${open}\n${text}\n${fence}\n\n`;
}

/**
 * 按行识别围栏块；仅对围栏外文本调用 fn。
 * 闭合条件：行首闭围栏长度 ≥ 开围栏（CommonMark）。
 */
export function mapOutsideFences(markdown: string, fn: (outside: string) => string): string {
  const lines = markdown.split('\n');
  const out: string[] = [];
  let i = 0;
  let outsideBuf: string[] = [];

  const flushOutside = () => {
    if (outsideBuf.length === 0) return;
    out.push(fn(outsideBuf.join('\n')));
    outsideBuf = [];
  };

  while (i < lines.length) {
    const openMatch = lines[i].match(OPEN_FENCE_RE);
    if (!openMatch) {
      outsideBuf.push(lines[i]);
      i += 1;
      continue;
    }

    flushOutside();
    const openLen = openMatch[1].length;
    const fenceLines = [lines[i]];
    i += 1;

    while (i < lines.length) {
      fenceLines.push(lines[i]);
      const closeMatch = lines[i].match(CLOSE_FENCE_RE);
      if (closeMatch && closeMatch[1].length >= openLen) {
        i += 1;
        break;
      }
      i += 1;
    }

    out.push(fenceLines.join('\n'));
  }

  flushOutside();
  return out.join('\n');
}

/** 插入 / 编辑代码块时的选项（外观随站点亮/暗主题自动切换，不可手选） */
export interface CodeBlockInsertOptions {
  /** 语言标识，空字符串表示纯文本 */
  language: string;
  lineNumbers: boolean;
  /** 阅读态默认折叠（仅 ≥5 行时显示折叠按钮） */
  collapsed: boolean;
}

/** 常用语言（与 highlight.js/lib/common 对齐，并保留若干手写标签） */
export const CODE_BLOCK_LANGUAGES: { id: string; label: string }[] = [
  { id: '', label: '纯文本' },
  { id: 'aardio', label: 'aardio' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'r', label: 'R' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'java', label: 'Java' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'php', label: 'PHP' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'swift', label: 'Swift' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'sql', label: 'SQL' },
  { id: 'bash', label: 'Bash / Shell' },
  { id: 'powershell', label: 'PowerShell' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'xml', label: 'XML / HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'scss', label: 'SCSS' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'dockerfile', label: 'Dockerfile' },
  { id: 'nginx', label: 'Nginx' },
];

export const DEFAULT_CODE_BLOCK_OPTIONS: CodeBlockInsertOptions = {
  language: '',
  lineNumbers: false,
  collapsed: false,
};

const PREFS_KEY = 'j13-codeblock-prefs';

/** 读取上次插入偏好（不含语言，避免误带到无关帖子） */
export function loadCodeBlockPrefs(): Pick<CodeBlockInsertOptions, 'lineNumbers' | 'collapsed'> {
  try {
    const raw = sessionStorage.getItem(PREFS_KEY);
    if (!raw) return { lineNumbers: false, collapsed: false };
    const parsed = JSON.parse(raw) as Partial<CodeBlockInsertOptions>;
    return {
      lineNumbers: Boolean(parsed.lineNumbers),
      collapsed: Boolean(parsed.collapsed),
    };
  } catch {
    return { lineNumbers: false, collapsed: false };
  }
}

/** 记住展示相关偏好 */
export function saveCodeBlockPrefs(opts: CodeBlockInsertOptions): void {
  try {
    sessionStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        lineNumbers: opts.lineNumbers,
        collapsed: opts.collapsed,
      }),
    );
  } catch {
    /* 隐私模式等忽略 */
  }
}

/** 是否为非默认展示选项 */
export function hasNonDefaultCodeBlockDisplay(opts: {
  lineNumbers?: boolean;
  collapsed?: boolean;
}): boolean {
  return Boolean(opts.lineNumbers) || Boolean(opts.collapsed);
}

/** 解析围栏信息串：`js lines collapsed`（兼容旧的 style=*，解析时忽略） */
export function parseFenceInfo(info: string): CodeBlockInsertOptions {
  const parts = info.trim().split(/\s+/).filter(Boolean);
  let language = '';
  let lineNumbers = false;
  let collapsed = false;

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'lines' || lower === 'line-numbers') {
      lineNumbers = true;
      continue;
    }
    if (lower === 'collapsed' || lower === 'fold') {
      collapsed = true;
      continue;
    }
    // 旧版 style=light|soft|dark：忽略，外观由站点主题决定
    if (lower.startsWith('style=')) {
      continue;
    }
    // 首个非 flag 片段视为语言
    if (!language && !lower.includes('=')) {
      language = lower;
    }
  }

  return { language, lineNumbers, collapsed };
}

/** 生成围栏信息串（便于手写） */
export function formatFenceInfo(opts: Pick<CodeBlockInsertOptions, 'language' | 'lineNumbers' | 'collapsed'>): string {
  const parts: string[] = [];
  const lang = (opts.language || '').trim().toLowerCase();
  if (lang) parts.push(lang);
  if (opts.lineNumbers) parts.push('lines');
  if (opts.collapsed) parts.push('collapsed');
  return parts.join(' ');
}

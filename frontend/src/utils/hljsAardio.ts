import type { HLJSApi, Language } from 'highlight.js';

/**
 * aardio 语法高亮（对齐官方文档 Prism 定义）：
 * https://www.aardio.com/zh-cn/docs/js/prism.js
 */
export function aardioLanguage(hljs: HLJSApi): Language {
  const KEYWORD_RE = (
    'begin|end|if|lambda|λ|else|elseif|class|function|return|while|do|namespace|'
    + 'select|case|catch|try|for|in|this|global|self|owner|var|def|null|and|not|or|'
    + 'break|continue|import|with|ctor|eval|type|assert|assert2|assertf|error|rget|'
    + 'callex|errput|loadcode|dumpcode|collectgarbage|call|invoke|tostring|topointer|'
    + 'tonumber|sleep|execute|setlocale|setprivilege|loadcodex|reduce|switch|'
    + 'true|false'
  );

  const KEYWORDS = {
    keyword:
      'begin end if lambda λ else elseif class function return while do namespace '
      + 'select case catch try for in this global self owner var def and not or '
      + 'break continue import with ctor eval type assert assert2 assertf error '
      + 'rget callex errput loadcode dumpcode collectgarbage call invoke tostring '
      + 'topointer tonumber sleep execute setlocale setprivilege loadcodex reduce switch',
    literal: 'true false null',
  };

  return {
    name: 'aardio',
    aliases: ['aardio'],
    keywords: KEYWORDS,
    illegal: /<\//,
    contains: [
      // /*...*/ 与 /**...**/ 等成对星号注释（宽松匹配）
      {
        className: 'comment',
        begin: /\/\*+/,
        end: /\*+\//,
        contains: ['self'],
      },
      hljs.C_LINE_COMMENT_MODE,
      // "..."（"" 转义）
      {
        className: 'string',
        begin: '"',
        end: '"',
        contains: [{ begin: /""/ }],
      },
      // `...`（`` 转义）
      {
        className: 'string',
        begin: '`',
        end: '`',
        contains: [{ begin: /``/ }],
      },
      // '...'（反斜杠转义）
      {
        className: 'string',
        begin: "'",
        end: "'",
        contains: [hljs.BACKSLASH_ESCAPE],
      },
      // _CONST 常量
      {
        className: 'literal',
        begin: /\b_[A-Za-z]\w*\b/,
      },
      // class Name
      {
        beginKeywords: 'class',
        end: /(?=[{;])/,
        contains: [
          {
            className: 'title',
            begin: /[\w.\\]+/,
            relevance: 0,
          },
        ],
      },
      // 函数调用名（排除关键字，避免 if( 被当成函数）
      {
        className: 'title function_',
        begin: new RegExp(
          String.raw`\b(?!(?:${KEYWORD_RE})\b)[_$a-zA-Z\u00A0-\uFFFF][$\w\u00A0-\uFFFF]*(?=\s*\()`,
        ),
        relevance: 0,
      },
      // 数字（十六进制 / 进制字面量 / 小数 / 科学计数）
      {
        className: 'number',
        relevance: 0,
        variants: [
          { begin: /\b0x[a-fA-F_\d]+(?:\.[a-fA-F_\d]*)?(?:p[+-]?\d[_\d]*)?\b/i },
          { begin: /\b\d+#[\d_]+\b/ },
          { begin: /\b\d[_\d]*(?:\.\B|(?:\.[_\d]*)?(?:e[+-]?\d[_\d]*)?\b)/i },
          { begin: /\B\.\d[_\d]*(?:e[+-]?\d[_\d]*)?\b/i },
        ],
      },
      {
        className: 'operator',
        begin: /\.\.|--|\+\+|\*\*=?|&&=?|\|\|=?|[!=]==|<<=?|>>>?=?|[-+*/%&|^!=<>]=?|[~:?]/,
      },
    ],
  };
}

/** 向 highlight.js 注册 aardio（可重复调用） */
export function registerAardioLanguage(hljs: HLJSApi): void {
  if (hljs.getLanguage('aardio')) return;
  hljs.registerLanguage('aardio', aardioLanguage);
}

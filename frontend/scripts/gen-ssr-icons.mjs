import fs from 'fs';
import path from 'path';

const paths = JSON.parse(fs.readFileSync('tmp-lucide-paths.json', 'utf8'));

function splitInner(inner) {
  const tags = [];
  const re = /<([a-z]+)([^>]*)\/>/g;
  let m;
  while ((m = re.exec(inner))) {
    tags.push(`<${m[1]}${m[2]}/>`);
  }
  return tags;
}

function goFunc(name, size, key, className = '') {
  const tags = splitInner(paths[key]);
  const lines = tags.map((t) => `\t\t\`${t}\`,`).join('\n');
  if (className) {
    return `func ${name}() string {\n\treturn ssrSVGWithClass(${size}, "${className}",\n${lines}\n\t)\n}\n\n`;
  }
  return `func ${name}() string {\n\treturn ssrSVG(${size},\n${lines}\n\t)\n}\n\n`;
}

const boardKeys = [
  'code-2', 'coffee', 'help-circle', 'message-square', 'lightbulb', 'book-open',
  'gamepad-2', 'palette', 'music', 'camera', 'heart', 'zap', 'globe', 'users',
  'briefcase', 'graduation-cap', 'shopping-bag', 'map-pin', 'megaphone', 'flame',
  'star', 'folder', 'wrench', 'cpu',
];
const defaults = [
  'code-2', 'coffee', 'help-circle', 'message-square',
  'lightbulb', 'book-open', 'gamepad-2', 'palette',
];

let out = `package handler

import (
\t"strconv"
\t"strings"
\t"time"
)

// 内联 SVG：path 对齐 lucide-react@1.18（由 scripts/extract-lucide-paths.mjs 抽取）

func ssrSVG(size int, paths ...string) string {
\treturn ssrSVGWithClass(size, "", paths...)
}

func ssrSVGWithClass(size int, className string, paths ...string) string {
\tvar b strings.Builder
\tb.WriteString(\`<svg xmlns="http://www.w3.org/2000/svg" width="\`)
\tb.WriteString(strconv.Itoa(size))
\tb.WriteString(\`" height="\`)
\tb.WriteString(strconv.Itoa(size))
\tb.WriteString(\`" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"\`)
\tif className != "" {
\t\tb.WriteString(\` class="\`)
\t\tb.WriteString(className)
\t\tb.WriteString(\`"\`)
\t}
\tb.WriteString(\` aria-hidden="true">\`)
\tfor _, p := range paths {
\t\tb.WriteString(p)
\t}
\tb.WriteString(\`</svg>\`)
\treturn b.String()
}

`;

out += goFunc('ssrIconSearch', 16, 'search', 'header-search-icon');
out += goFunc('ssrIconSliders', 15, 'sliders-horizontal');
out += goFunc('ssrIconPlus', 16, 'plus');
out += goFunc('ssrIconMoon', 18, 'moon');
out += goFunc('ssrIconSun', 18, 'sun');
out += goFunc('ssrIconMail', 18, 'mail');
out += goFunc('ssrIconHome', 18, 'house');
out += goFunc('ssrIconStar', 18, 'star');
out += goFunc('ssrIconFolderGit', 18, 'folder-git-2');
out += goFunc('ssrIconLink2', 18, 'link-2');
out += goFunc('ssrIconEarth', 18, 'earth');
out += goFunc('ssrIconFileText', 18, 'file-text');
out += goFunc('ssrIconLayoutDashboard', 18, 'layout-dashboard');
out += goFunc('ssrIconMessageCircle', 16, 'message-circle');
out += goFunc('ssrIconClock', 16, 'clock');
out += goFunc('ssrIconBadgeCheck', 16, 'badge-check');
out += goFunc('ssrIconTags', 16, 'tags');
out += goFunc('ssrIconUserPlus', 16, 'user-plus');
out += goFunc('ssrIconCalendarCheck', 18, 'calendar-check');
out += goFunc('ssrIconCheck', 18, 'check');
out += goFunc('ssrIconGift', 15, 'gift');
out += goFunc('ssrIconPanelRight', 18, 'panel-right');

out += '// 板块图标 path（key 对齐 BOARD_ICON_OPTIONS / AllowedBoardIcons）\nvar ssrBoardIconInner = map[string]string{\n';
for (const k of boardKeys) {
  out += `\t"${k}": \`${paths[k]}\`,\n`;
}
out += '}\n\n';

out += '// 与前端 DEFAULT_ICONS 顺序一致（按 themeIndex 回退）\nvar ssrBoardDefaultIcons = []string{\n';
for (const k of defaults) {
  out += `\t"${k}",\n`;
}
out += '}\n\n';

out += `// ssrBoardIconSVG 输出板块 Lucide 图标；class 打在 svg 上（与 React BoardIconDisplay 一致）
func ssrBoardIconSVG(icon string, themeIndex int, className string) string {
\tkey := strings.TrimSpace(strings.ToLower(icon))
\tinner, ok := ssrBoardIconInner[key]
\tif !ok || inner == "" {
\t\tif themeIndex < 0 {
\t\t\tthemeIndex = 0
\t\t}
\t\tkey = ssrBoardDefaultIcons[themeIndex%len(ssrBoardDefaultIcons)]
\t\tinner = ssrBoardIconInner[key]
\t}
\treturn ssrSVGWithClass(18, className, inner)
}

// formatSSRRelativeTime 与前端 formatTime 同规则
func formatSSRRelativeTime(t time.Time) string {
\tif t.IsZero() {
\t\treturn ""
\t}
\tnow := time.Now()
\tdiffSec := now.Sub(t).Seconds()
\tif diffSec < 0 {
\t\tdiffSec = 0
\t}
\tif diffSec < 60 {
\t\treturn "刚刚"
\t}
\tif diffSec < 3600 {
\t\treturn strconv.Itoa(int(diffSec/60)) + "分钟前"
\t}
\tif diffSec < 86400 {
\t\treturn strconv.Itoa(int(diffSec/3600)) + "小时前"
\t}
\tdiffDay := int(diffSec / 86400)
\tif diffDay < 30 {
\t\treturn strconv.Itoa(diffDay) + "天前"
\t}
\tif t.Year() == now.Year() {
\t\treturn strconv.Itoa(int(t.Month())) + "月" + strconv.Itoa(t.Day()) + "日"
\t}
\treturn strconv.Itoa(t.Year()) + "年" + strconv.Itoa(int(t.Month())) + "月" + strconv.Itoa(t.Day()) + "日"
}

// formatSSRShortDateTime 与前端 formatShortDateTime 同规则（MM-DD HH:mm）
func formatSSRShortDateTime(t time.Time) string {
\tif t.IsZero() {
\t\treturn ""
\t}
\tlocal := t.Local()
\tpad := func(n int) string {
\t\tif n < 10 {
\t\t\treturn "0" + strconv.Itoa(n)
\t\t}
\t\treturn strconv.Itoa(n)
\t}
\treturn pad(int(local.Month())) + "-" + pad(local.Day()) + " " + pad(local.Hour()) + ":" + pad(local.Minute())
}
`;

const outPath = path.join('..', 'handler', 'ssr_icons.go');
fs.writeFileSync(outPath, out);
console.log('wrote', outPath, Object.keys(paths).length, 'icons');

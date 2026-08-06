/** 转义 HTML 并保留换行 */
function escapeWithBreaks(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

/** @用户名 高亮（data-name 供点击跳转用户主页） */
export function highlightMentions(text: string): string {
  return escapeWithBreaks(text)
    .replace(
      /@([\w\u4e00-\u9fa5_-]+)/g,
      '<span class="mention" data-name="$1" role="link" tabindex="0">@$1</span>',
    );
}

/** 相对时间：刚刚 / N分钟前 / N小时前 / N天前；更早用具体日期 */
export function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const now = new Date();
  const diffSec = Math.max(0, (now.getTime() - d.getTime()) / 1000);
  if (diffSec < 60) return '刚刚';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}小时前`;

  const diffDay = Math.floor(diffSec / 86400);
  if (diffDay < 30) return `${diffDay}天前`;

  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 完整日期时间（用于帖子发布/修改时间展示） */
export function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 短日期时间（本地时区）：MM-DD HH:mm，用于右栏最新评论等 */
export function formatShortDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 判断两个 ISO 时间是否相差超过 1 分钟 */
export function isTimeDiffSignificant(a: string, b: string) {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return false;
  return Math.abs(da - db) > 60_000;
}

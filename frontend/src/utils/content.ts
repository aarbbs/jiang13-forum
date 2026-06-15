/** @用户名 高亮（仅用于评论正文中用户主动输入的 @） */
export function highlightMentions(text: string, _onClick?: (name: string) => void): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // innerHTML 解析会吞掉换行，需转为 <br>
    .replace(/\n/g, '<br>')
    .replace(/@([\w\u4e00-\u9fa5_-]+)/g, '<span class="mention">@$1</span>');
}

export function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

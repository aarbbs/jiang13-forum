/** 统计正文字数（CJK 按字、英文按词） */
export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  const cjk = t.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const en = t.match(/[a-zA-Z0-9]+/g)?.length ?? 0;
  return cjk + en;
}

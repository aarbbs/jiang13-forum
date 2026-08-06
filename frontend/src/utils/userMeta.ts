/** 等级门槛（与后端 model.LevelThresholds 一致） */
export const LEVEL_THRESHOLDS = [0, 20, 50, 100, 200, 400, 800, 1500, 3000, 5000];

export function levelFromExp(exp = 0): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
    if (exp >= LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  return level;
}

export function resolveUserLevel(u?: { level?: number; exp?: number } | null): number {
  if (u?.level && u.level > 0) return u.level;
  return levelFromExp(u?.exp ?? 0);
}

/** 等级视觉档位（纹章 / CSS tone） */
export type LevelTone = 'sprout' | 'leaf' | 'crest' | 'crown';

export function levelToneFromLevel(level: number): LevelTone {
  if (level >= 9) return 'crown';
  if (level >= 7) return 'crest';
  if (level >= 4) return 'leaf';
  return 'sprout';
}

/** 是否免审发帖/评论 */
export function skipsModeration(u?: { role?: string; verified?: boolean } | null): boolean {
  return !!u && (u.role === 'admin' || !!u.verified);
}

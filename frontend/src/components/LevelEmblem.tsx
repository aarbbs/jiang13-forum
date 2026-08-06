import { cn } from '@/lib/utils';
import { levelToneFromLevel, type LevelTone } from '../utils/userMeta';

interface Props {
  level: number;
  size?: number;
  className?: string;
  tone?: LevelTone;
}

/** 等级迷你纹章：芽 / 叶 / 盾 / 冠（线描，currentColor） */
export default function LevelEmblem({ level, size = 12, className, tone: toneProp }: Props) {
  const tone = toneProp ?? levelToneFromLevel(level);

  return (
    <svg
      className={cn('level-emblem', `level-emblem--${tone}`, className)}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {tone === 'sprout' && (
        <>
          <path
            d="M8 13.5V8.2"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
          <path
            d="M8 9.2C8 9.2 5.2 8.6 4.2 6.4C3.4 4.6 4.6 3.2 6.4 3.6C7.6 3.9 8 5.2 8 5.2"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 7.6C8 7.6 9.8 6.4 11.2 7.2C12.6 8 12.4 9.8 10.8 10.4C9.6 10.85 8.4 10.2 8 9.6"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {tone === 'leaf' && (
        <>
          <path
            d="M8 13.2V7.5"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
          <path
            d="M8 8.2C5.6 8.2 3.8 6.5 3.5 4.4C3.3 2.9 4.5 2.2 5.8 2.6C7.1 3 8 4.4 8 4.4C8 4.4 8.9 3 10.2 2.6C11.5 2.2 12.7 2.9 12.5 4.4C12.2 6.5 10.4 8.2 8 8.2Z"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path
            d="M8 4.4V8.2"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.7"
          />
          <path
            d="M5.2 11.4C5.8 10.2 6.8 9.5 8 9.5C9.2 9.5 10.2 10.2 10.8 11.4"
            stroke="currentColor"
            strokeWidth="1.15"
            strokeLinecap="round"
          />
        </>
      )}
      {tone === 'crest' && (
        <>
          <path
            d="M3.5 3.2H12.5V7.2C12.5 10.4 10.4 12.6 8 13.4C5.6 12.6 3.5 10.4 3.5 7.2V3.2Z"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path
            d="M8 11.2V6.2"
            stroke="currentColor"
            strokeWidth="1.15"
            strokeLinecap="round"
          />
          <path
            d="M8 7C6.4 7 5.4 6 5.2 4.8C5.8 5.1 6.8 5.2 8 5.2C9.2 5.2 10.2 5.1 10.8 4.8C10.6 6 9.6 7 8 7Z"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </>
      )}
      {tone === 'crown' && (
        <>
          <path
            d="M3.2 10.2C3.8 11.8 5.6 13 8 13.4C10.4 13 12.2 11.8 12.8 10.2"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
          />
          <path
            d="M4.2 10C3.6 8.2 3.8 6.2 5.2 5C6.2 4.1 7.2 4.4 8 5.2C8.8 4.4 9.8 4.1 10.8 5C12.2 6.2 12.4 8.2 11.8 10"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path
            d="M5.5 4.2L4.6 2.6M8 4.4V2.4M10.5 4.2L11.4 2.6"
            stroke="currentColor"
            strokeWidth="1.15"
            strokeLinecap="round"
          />
          <circle cx="4.5" cy="2.2" r="0.7" fill="currentColor" />
          <circle cx="8" cy="2" r="0.75" fill="currentColor" />
          <circle cx="11.5" cy="2.2" r="0.7" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

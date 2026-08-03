import type { Area } from 'react-easy-crop';

export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** 头像输出尺寸 */
export const AVATAR_OUTPUT_SIZE = 512;

/**
 * 原图体积软上限：仅防止浏览器加载过大文件卡死。
 * 实际上传限额看裁剪后的文件（见 validateAvatarOutput）。
 */
export const AVATAR_SOURCE_MAX_MB = 20;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

/** 选择/拖入原图时：只校验格式与可读性上限，不按上传限额卡死 */
export function validateAvatarFile(file: File): string | null {
  if (!AVATAR_MIME_TYPES.includes(file.type)) {
    return '仅支持 JPG、PNG、GIF、WebP 格式';
  }
  if (file.size > AVATAR_SOURCE_MAX_MB * 1024 * 1024) {
    return `原图过大（超过 ${AVATAR_SOURCE_MAX_MB}MB），请换一张较小的图片`;
  }
  return null;
}

/** 裁剪完成后：按实际上传体积校验 */
export function validateAvatarOutput(file: File, maxMb: number): string | null {
  if (file.size > maxMb * 1024 * 1024) {
    return `裁剪后头像仍超过 ${maxMb}MB，请缩小裁剪区域或换图`;
  }
  return null;
}

/** 将裁剪区域渲染为 WebP 文件（体积更小；不支持时回退 JPEG） */
export async function getCroppedAvatarFile(
  imageSrc: string,
  pixelCrop: Area,
  originalName = 'avatar.webp',
): Promise<File> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  const size = AVATAR_OUTPUT_SIZE;
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('裁剪失败');

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    size,
    size,
  );

  const tryTypes: { mime: string; quality: number; ext: string }[] = [
    { mime: 'image/webp', quality: 0.86, ext: 'webp' },
    { mime: 'image/jpeg', quality: 0.92, ext: 'jpg' },
  ];

  let blob: Blob | null = null;
  let picked = tryTypes[1];
  for (const t of tryTypes) {
    blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(b => resolve(b), t.mime, t.quality);
    });
    if (blob && blob.type === t.mime) {
      picked = t;
      break;
    }
    blob = null;
  }
  if (!blob) throw new Error('裁剪失败');

  const baseName = originalName.replace(/\.[^.]+$/, '') || 'avatar';
  return new File([blob], `${baseName}.${picked.ext}`, { type: picked.mime });
}

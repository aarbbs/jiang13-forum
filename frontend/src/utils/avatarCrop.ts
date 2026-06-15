import type { Area } from 'react-easy-crop';

export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** 头像输出尺寸 */
export const AVATAR_OUTPUT_SIZE = 512;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = src;
  });
}

/** 校验头像文件，返回错误信息或 null */
export function validateAvatarFile(file: File, maxMb: number): string | null {
  if (!AVATAR_MIME_TYPES.includes(file.type)) {
    return '仅支持 JPG、PNG、GIF、WebP 格式';
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `头像不能超过 ${maxMb}MB`;
  }
  return null;
}

/** 将裁剪区域渲染为 JPEG 文件 */
export async function getCroppedAvatarFile(
  imageSrc: string,
  pixelCrop: Area,
  originalName = 'avatar.jpg',
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

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('裁剪失败'))),
      'image/jpeg',
      0.92,
    );
  });

  const baseName = originalName.replace(/\.[^.]+$/, '') || 'avatar';
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
}

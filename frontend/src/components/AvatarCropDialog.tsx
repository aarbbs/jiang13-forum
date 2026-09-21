import { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { getCroppedAvatarFile, isGifFile, validateAvatarOutput, type AvatarCropRect } from '../utils/avatarCrop';

export interface AvatarCropResult {
  /** 待上传文件；GIF 时为原图，其余为裁剪后的文件 */
  file: File;
  /** 动图 GIF 的裁剪区域（交由服务端逐帧裁剪） */
  crop?: AvatarCropRect;
}

interface Props {
  open: boolean;
  imageSrc: string | null;
  /** 原始选中文件（GIF 保留动画需原样上传） */
  sourceFile?: File | null;
  fileName?: string;
  /** 裁剪后文件体积上限（MB） */
  maxMb: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: (result: AvatarCropResult) => void;
}

export default function AvatarCropDialog({
  open,
  imageSrc,
  sourceFile,
  fileName,
  maxMb,
  onOpenChange,
  onConfirm,
}: Props) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    }
  }, [open, imageSrc]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setConfirming(true);
    try {
      const rect: AvatarCropRect = {
        x: Math.max(0, Math.round(croppedAreaPixels.x)),
        y: Math.max(0, Math.round(croppedAreaPixels.y)),
        w: Math.max(1, Math.round(croppedAreaPixels.width)),
        h: Math.max(1, Math.round(croppedAreaPixels.height)),
      };
      // 动图 GIF：canvas 会压平为首帧，改为原图 + 裁剪区域交由服务端逐帧裁剪
      if (sourceFile && isGifFile(sourceFile)) {
        onConfirm({ file: sourceFile, crop: rect });
        onOpenChange(false);
        return;
      }
      const file = await getCroppedAvatarFile(imageSrc, croppedAreaPixels, fileName);
      const sizeErr = validateAvatarOutput(file, maxMb);
      if (sizeErr) {
        notify.error(sizeErr);
        return;
      }
      onConfirm({ file });
      onOpenChange(false);
    } catch {
      notify.error('裁剪失败，请重试');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="avatar-crop-dialog">
        <DialogHeader>
          <DialogTitle>裁剪头像</DialogTitle>
          <DialogDescription>
            拖动图片调整位置，滚轮或滑块缩放。JPG/PNG 裁剪后按原图格式保存；GIF 保留动画，由服务端按裁剪区域生成动图 WebP。
          </DialogDescription>
        </DialogHeader>

        <div className="avatar-crop-stage">
          {imageSrc ? (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          ) : (
            <div className="avatar-crop-loading">
              <Spinner size="lg" />
            </div>
          )}
        </div>

        <div className="avatar-crop-zoom">
          <span className="avatar-crop-zoom-label">缩放</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            aria-label="缩放"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={confirming} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button loading={confirming} disabled={!imageSrc} onClick={handleConfirm}>
            确认裁剪
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { getCroppedAvatarFile, validateAvatarOutput } from '../utils/avatarCrop';

interface Props {
  open: boolean;
  imageSrc: string | null;
  fileName?: string;
  /** 裁剪后文件体积上限（MB） */
  maxMb: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: (file: File) => void;
}

export default function AvatarCropDialog({
  open,
  imageSrc,
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
      const file = await getCroppedAvatarFile(imageSrc, croppedAreaPixels, fileName);
      const sizeErr = validateAvatarOutput(file, maxMb);
      if (sizeErr) {
        notify.error(sizeErr);
        return;
      }
      onConfirm(file);
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
            拖动图片调整位置，滚轮或滑块缩放。裁剪结果按原图格式保存（JPG→JPEG，PNG 保留透明）；GIF 裁剪后变为静态 JPG。服务端会额外生成 WebP。
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

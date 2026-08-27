import { useEffect, useRef, useState } from 'react';
import { Link2, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { api } from '../api/client';
import type { FriendLinkApply } from '../api/types';
import { getCachedSiteBranding } from '../hooks/useSiteBranding';
import { resolveFriendLinkLogo } from '../utils/friendLink';
import FriendLinkSiteInfo from './FriendLinkSiteInfo';

type LinkPlacement = 'homepage' | 'custom';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editApply?: FriendLinkApply | null;
  onSubmitted?: () => void;
}

/** 友链申请 / 修改弹窗 */
export default function FriendLinkApplyDialog({ open, onOpenChange, editApply, onSubmitted }: Props) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [logo, setLogo] = useState('');
  const [linkPlacement, setLinkPlacement] = useState<LinkPlacement>('homepage');
  const [reciprocalPageURL, setReciprocalPageURL] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isEdit = !!editApply?.id;

  const reset = () => {
    setName('');
    setUrl('');
    setLogo('');
    setLinkPlacement('homepage');
    setReciprocalPageURL('');
  };

  useEffect(() => {
    if (!open) return;
    if (editApply) {
      setName(editApply.name ?? '');
      setUrl(editApply.url ?? '');
      setLogo(editApply.logo ?? '');
      const onHomepage = editApply.link_on_homepage !== false;
      setLinkPlacement(onHomepage ? 'homepage' : 'custom');
      setReciprocalPageURL(onHomepage ? '' : (editApply.reciprocal_page_url ?? ''));
    } else {
      reset();
    }
  }, [open, editApply]);

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    setUploadingLogo(true);
    try {
      const r = await api.uploadFriendLinkLogo(file);
      setLogo(r.url);
      notify.success('LOGO 已上传');
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploadingLogo(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = async () => {
    const trimmedName = name.trim();
    const trimmedURL = url.trim();
    const trimmedLogo = logo.trim();
    const trimmedReciprocal = reciprocalPageURL.trim();
    if (!trimmedName || !trimmedURL) {
      notify.warning('请填写网站名称与网站链接');
      return;
    }
    if (!/^https?:\/\//i.test(trimmedURL)) {
      notify.warning('网站链接需以 http:// 或 https:// 开头');
      return;
    }
    if (!trimmedLogo) {
      notify.warning('请填写或上传网站 LOGO');
      return;
    }
    if (linkPlacement === 'custom') {
      if (!trimmedReciprocal) {
        notify.warning('请填写添加本站链接的页面地址');
        return;
      }
      if (!/^https?:\/\//i.test(trimmedReciprocal)) {
        notify.warning('回链页地址需以 http:// 或 https:// 开头');
        return;
      }
    }

    const linkOnHomepage = linkPlacement === 'homepage';
    const body = {
      name: trimmedName,
      url: trimmedURL,
      logo: trimmedLogo,
      link_on_homepage: linkOnHomepage,
      reciprocal_page_url: linkOnHomepage ? trimmedURL : trimmedReciprocal,
    };

    setSubmitting(true);
    try {
      if (isEdit) {
        const r = await api.updateFriendLinkApply(editApply!.id, body);
        notify.success(
          editApply?.status === 'approved'
            ? `已更新并重新提交审核，友链已暂时从列表移除${r.message.includes('回链检测') ? '，回链检测将在后台进行' : ''}`
            : r.message,
        );
      } else {
        const r = await api.applyFriendLink(body);
        notify.success(r.message);
      }
      onSubmitted?.();
      handleOpenChange(false);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  const logoPreview = resolveFriendLinkLogo(logo.trim(), getCachedSiteBranding().site_url);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="friend-link-apply-dialog sm:max-w-[560px]">
        <DialogHeader className="friend-link-apply-dialog__header">
          <DialogTitle>{isEdit ? '修改友链申请' : '申请本页友情链接'}</DialogTitle>
        </DialogHeader>

        <FriendLinkSiteInfo />

        <div className="friend-link-apply-form">
          <div className="friend-link-apply-field">
            <Label htmlFor="friend-link-name">网站名称</Label>
            <Input
              id="friend-link-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="请输入您的网站名称"
              maxLength={32}
            />
          </div>
          <div className="friend-link-apply-field">
            <Label htmlFor="friend-link-url">网站链接</Label>
            <Input
              id="friend-link-url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="请输入您的网站地址（以 http 开头）"
              maxLength={512}
            />
          </div>
          <div className="friend-link-apply-field">
            <Label>本站链接放置位置</Label>
            <div className="friend-link-apply-placement" role="radiogroup" aria-label="本站链接放置位置">
              <button
                type="button"
                role="radio"
                aria-checked={linkPlacement === 'homepage'}
                className={cn(
                  'friend-link-apply-placement__option',
                  linkPlacement === 'homepage' && 'friend-link-apply-placement__option--active',
                )}
                onClick={() => setLinkPlacement('homepage')}
              >
                友链在我的网站首页
              </button>
              <div
                className={cn(
                  'friend-link-apply-placement__custom',
                  linkPlacement === 'custom' && 'friend-link-apply-placement__custom--open',
                )}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={linkPlacement === 'custom'}
                  className={cn(
                    'friend-link-apply-placement__option',
                    linkPlacement === 'custom' && 'friend-link-apply-placement__option--active',
                  )}
                  onClick={() => setLinkPlacement('custom')}
                >
                  友链在其它页面
                </button>
                <div className="friend-link-apply-placement__custom-panel" aria-hidden={linkPlacement !== 'custom'}>
                  <div className="friend-link-apply-placement__custom-inner">
                    <Label htmlFor="friend-link-reciprocal">添加我方链接的页面地址</Label>
                    <Input
                      id="friend-link-reciprocal"
                      value={reciprocalPageURL}
                      onChange={e => setReciprocalPageURL(e.target.value)}
                      placeholder="如：https://您的域名/link.htm"
                      maxLength={512}
                      tabIndex={linkPlacement === 'custom' ? 0 : -1}
                    />
                    <p className="friend-link-apply-field__hint">
                      请填写实际放置本站友链的页面，提交后将在后台检测该页面
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="friend-link-apply-field">
            <Label htmlFor="friend-link-logo">填写或上传网站 LOGO</Label>
            <div className="friend-link-apply-logo-row">
              <div className="friend-link-apply-logo-preview" aria-label="LOGO 预览">
                {logoPreview ? (
                  <img src={logoPreview} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span>预览</span>
                )}
              </div>
              <Input
                id="friend-link-logo"
                className="friend-link-apply-logo-input"
                value={logo}
                onChange={e => setLogo(e.target.value)}
                placeholder="LOGO 图片地址"
                maxLength={512}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="sr-only"
                onChange={e => uploadLogo(e.target.files?.[0])}
              />
              <Button
                type="button"
                variant="outline"
                className="friend-link-apply-logo-upload"
                disabled={uploadingLogo}
                onClick={() => fileRef.current?.click()}
              >
                {uploadingLogo ? <Spinner size="sm" /> : <Upload size={15} aria-hidden />}
                上传
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="friend-link-apply-dialog__footer">
          <p className="friend-link-apply-dialog__note">
            <Link2 size={14} aria-hidden />
            提交后立即返回，回链检测在后台进行，结果供管理员参考
          </p>
          <div className="friend-link-apply-dialog__actions">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              取消
            </Button>
            <Button type="button" disabled={submitting || uploadingLogo} onClick={submit}>
              {submitting ? '提交中…' : isEdit ? '保存并提交' : '提交申请'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

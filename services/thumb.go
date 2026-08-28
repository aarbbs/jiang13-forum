package services

import (
	"errors"
	"fmt"
	"image"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/image/draw"

	// 注册解码器
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"

	_ "golang.org/x/image/webp"
)

const (
	// PostThumbMaxSide 正文预览图最长边（像素）
	PostThumbMaxSide = 1280
)

var thumbLocks sync.Map // 同一原图并发生成时串行化

// ThumbURLFromUpload 将 /uploads/posts/xxx.webp 转为 /media/thumb/posts/xxx.webp
func ThumbURLFromUpload(uploadURL string) string {
	u := strings.TrimSpace(uploadURL)
	if u == "" {
		return ""
	}
	if strings.HasPrefix(u, "/media/thumb/") {
		return u
	}
	if strings.HasPrefix(u, "/uploads/") {
		return "/media/thumb/" + strings.TrimPrefix(u, "/uploads/")
	}
	return ""
}

// WarmPostImageThumb 上传后预热缩略图（失败忽略，首次访问仍会生成）
func WarmPostImageThumb(uploadsRoot, relativePath string) {
	_, _ = EnsureUploadThumb(uploadsRoot, relativePath)
}

// EnsureUploadThumb 确保缩略图存在，返回磁盘路径
// relativePath 形如 posts/1_123.webp（相对 uploads 根目录）
func EnsureUploadThumb(uploadsRoot, relativePath string) (string, error) {
	rel, err := sanitizeUploadRel(relativePath)
	if err != nil {
		return "", err
	}
	// 仅处理帖子正文图
	if !strings.HasPrefix(rel, "posts/") {
		return "", errors.New("仅支持帖子图片缩略图")
	}

	origPath := filepath.Join(uploadsRoot, filepath.FromSlash(rel))
	if st, err := os.Stat(origPath); err != nil || st.IsDir() {
		return "", errors.New("原图不存在")
	}

	thumbPath := filepath.Join(uploadsRoot, ".thumbs", filepath.FromSlash(rel)+".webp")
	if fresh, err := thumbFresherThan(thumbPath, origPath); err == nil && fresh {
		return thumbPath, nil
	}

	lockKey := rel
	muIface, _ := thumbLocks.LoadOrStore(lockKey, &sync.Mutex{})
	mu := muIface.(*sync.Mutex)
	mu.Lock()
	defer mu.Unlock()

	// 双检
	if fresh, err := thumbFresherThan(thumbPath, origPath); err == nil && fresh {
		return thumbPath, nil
	}

	if err := generateWebPThumb(origPath, thumbPath, PostThumbMaxSide); err != nil {
		return "", err
	}
	return thumbPath, nil
}

func thumbFresherThan(thumbPath, origPath string) (bool, error) {
	ts, err := os.Stat(thumbPath)
	if err != nil {
		return false, err
	}
	os_, err := os.Stat(origPath)
	if err != nil {
		return false, err
	}
	return !ts.ModTime().Before(os_.ModTime()), nil
}

func sanitizeUploadRel(relativePath string) (string, error) {
	rel := strings.TrimSpace(relativePath)
	rel = strings.TrimPrefix(rel, "/")
	rel = strings.ReplaceAll(rel, "\\", "/")
	if rel == "" || strings.Contains(rel, "..") {
		return "", errors.New("非法路径")
	}
	cleaned := filepath.Clean(filepath.FromSlash(rel))
	if cleaned == "." || strings.HasPrefix(cleaned, "..") {
		return "", errors.New("非法路径")
	}
	return filepath.ToSlash(cleaned), nil
}

func generateWebPThumb(srcPath, dstPath string, maxSide int) error {
	f, err := os.Open(srcPath)
	if err != nil {
		return err
	}
	defer f.Close()

	img, _, err := image.Decode(f)
	if err != nil {
		return fmt.Errorf("解码图片失败: %w", err)
	}

	out := resizeToMax(img, maxSide)
	data, err := encodeWebPBytes(out, ThumbWebPQuality, UploadWebPMethod)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
		return err
	}

	tmp := fmt.Sprintf("%s.%d.tmp", dstPath, time.Now().UnixNano())
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	if err := os.Rename(tmp, dstPath); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}

func resizeToMax(src image.Image, maxSide int) image.Image {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= 0 || h <= 0 {
		return src
	}
	if w <= maxSide && h <= maxSide {
		return src
	}
	var nw, nh int
	if w >= h {
		nw = maxSide
		nh = int(float64(h) * float64(maxSide) / float64(w))
	} else {
		nh = maxSide
		nw = int(float64(w) * float64(maxSide) / float64(h))
	}
	if nw < 1 {
		nw = 1
	}
	if nh < 1 {
		nh = 1
	}
	dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
	draw.CatmullRom.Scale(dst, dst.Bounds(), src, b, draw.Over, nil)
	return dst
}

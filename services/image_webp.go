package services

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/gif"
	"io"
	"mime/multipart"
	"path/filepath"
	"strings"

	"github.com/KarpelesLab/gowebp"

	// 注册解码器
	_ "image/jpeg"
	_ "image/png"

	_ "golang.org/x/image/webp"
)

// 图片展示方案（上传时同时保留原图与 WebP，按此决定返回给前端的 URL）
const (
	ImageDeliveryWebP     = "webp"     // 使用 WebP（默认，省流量）
	ImageDeliveryOriginal = "original" // 使用原图
)

const (
	// UploadWebPQuality 上传衍生 WebP 有损质量（0–100）
	UploadWebPQuality float32 = 82
	// UploadWebPMethod 编码档位：3 速度与体积较均衡
	UploadWebPMethod = 3
	// ThumbWebPQuality 帖子预览图质量
	ThumbWebPQuality float32 = 80
)

// preparedUpload 原图 + 可选 WebP 衍生
type preparedUpload struct {
	OrigExt         string // 含点，如 .jpg
	OrigContentType string
	OrigData        []byte
	WebPData        []byte // 空表示无衍生（动图 GIF，或原图已是 WebP）
}

// prepareUploadImage 始终保留原图字节；静态图额外生成 WebP 衍生
func prepareUploadImage(file *multipart.FileHeader) (*preparedUpload, error) {
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if !allowedImageExt[ext] {
		return nil, errors.New("仅支持 jpg/png/gif/webp 格式")
	}
	if ext == ".jpeg" {
		ext = ".jpg"
	}

	src, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer src.Close()

	raw, err := io.ReadAll(src)
	if err != nil {
		return nil, err
	}
	if len(raw) == 0 {
		return nil, errors.New("空图片文件")
	}

	out := &preparedUpload{
		OrigExt:         ext,
		OrigContentType: imageContentType(ext),
		OrigData:        raw,
	}

	// 动图 GIF：只保留原文件
	if ext == ".gif" && gifFrameCount(raw) > 1 {
		return out, nil
	}
	// 上传已是 WebP：原图即 WebP，不再重复衍生
	if ext == ".webp" {
		return out, nil
	}

	img, _, err := image.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil, fmt.Errorf("解码图片失败: %w", err)
	}

	webpBytes, err := encodeWebPBytes(img, UploadWebPQuality, UploadWebPMethod)
	if err != nil {
		return nil, fmt.Errorf("转换 WebP 失败: %w", err)
	}
	out.WebPData = webpBytes
	return out, nil
}

func gifFrameCount(raw []byte) int {
	g, err := gif.DecodeAll(bytes.NewReader(raw))
	if err != nil || g == nil {
		return 0
	}
	return len(g.Image)
}

func encodeWebPBytes(img image.Image, quality float32, method int) ([]byte, error) {
	var buf bytes.Buffer
	if err := gowebp.Encode(&buf, img, &gowebp.Options{
		Lossy:   true,
		Quality: quality,
		Method:  method,
	}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func normalizeImageDelivery(raw string) string {
	if strings.ToLower(strings.TrimSpace(raw)) == ImageDeliveryOriginal {
		return ImageDeliveryOriginal
	}
	return ImageDeliveryWebP
}

func imageContentType(ext string) string {
	switch strings.ToLower(ext) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	default:
		return "application/octet-stream"
	}
}

// siblingUploadExts 同主文件名可能存在的伴生扩展名（删除时一并清理）
func siblingUploadExts(ext string) []string {
	ext = strings.ToLower(ext)
	all := []string{".jpg", ".jpeg", ".png", ".gif", ".webp"}
	out := make([]string, 0, len(all))
	for _, e := range all {
		if e == ext || (ext == ".jpg" && e == ".jpeg") || (ext == ".jpeg" && e == ".jpg") {
			continue
		}
		out = append(out, e)
	}
	return out
}

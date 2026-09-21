package service

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/draw"
	"image/gif"
	"io"
	"mime/multipart"
	"path/filepath"
	"strings"

	"github.com/KarpelesLab/gowebp"
	xdraw "golang.org/x/image/draw"

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

// CropRect 源图像像素裁剪区域（用于头像等按用户选择裁剪）。
type CropRect struct {
	X int `json:"x"`
	Y int `json:"y"`
	W int `json:"w"`
	H int `json:"h"`
}

// imageProcessOptions 可选的图像处理参数：先按 crop 裁剪，再按 squareOut 缩放为正方形。
type imageProcessOptions struct {
	crop      *CropRect
	squareOut int
}

// prepareUploadImage 始终保留原图字节；静态图额外生成 WebP 衍生。
// opt 非空时对静态图与动图 GIF 逐帧应用裁剪/缩放。
func prepareUploadImage(file *multipart.FileHeader, opt *imageProcessOptions) (*preparedUpload, error) {
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

	// 动图 GIF：转换为动图 WebP；解析/编码失败或过大时回退保留原 GIF
	if ext == ".gif" && gifFrameCount(raw) > 1 {
		if webpBytes, ok := encodeAnimatedGIFToWebP(raw, opt); ok {
			out.WebPData = webpBytes
		}
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
	img = applyCropAndResize(img, opt)

	webpBytes, err := encodeWebPBytes(img, UploadWebPQuality, UploadWebPMethod)
	if err != nil {
		return nil, fmt.Errorf("转换 WebP 失败: %w", err)
	}
	out.WebPData = webpBytes
	return out, nil
}

// applyCropAndResize 按 opt 裁剪并缩放；opt 为空则原样返回。
func applyCropAndResize(img image.Image, opt *imageProcessOptions) image.Image {
	if opt == nil || img == nil {
		return img
	}
	if c := opt.crop; c != nil && c.W > 0 && c.H > 0 {
		r := image.Rect(c.X, c.Y, c.X+c.W, c.Y+c.H).Intersect(img.Bounds())
		if !r.Empty() {
			img = cropToNRGBA(img, r)
		}
	}
	if opt.squareOut > 0 {
		img = resizeToSquare(img, opt.squareOut)
	}
	return img
}

// cropToNRGBA 将 src 的 r 区域拷贝为新的 NRGBA 图像。
func cropToNRGBA(src image.Image, r image.Rectangle) *image.NRGBA {
	dst := image.NewNRGBA(image.Rect(0, 0, r.Dx(), r.Dy()))
	draw.Draw(dst, dst.Bounds(), src, r.Min, draw.Src)
	return dst
}

// resizeToSquare 缩放到 size×size；非正方形时先居中裁剪为正方形再缩放。
func resizeToSquare(src image.Image, size int) image.Image {
	if src == nil || size <= 0 {
		return src
	}
	b := src.Bounds()
	if b.Dx() <= 0 || b.Dy() <= 0 {
		return src
	}
	if b.Dx() != b.Dy() {
		side := b.Dx()
		if b.Dy() < side {
			side = b.Dy()
		}
		cx := b.Min.X + (b.Dx()-side)/2
		cy := b.Min.Y + (b.Dy()-side)/2
		src = cropToNRGBA(src, image.Rect(cx, cy, cx+side, cy+side))
		b = src.Bounds()
	}
	if b.Dx() == size && b.Dy() == size && b.Min.X == 0 && b.Min.Y == 0 {
		return src
	}
	dst := image.NewNRGBA(image.Rect(0, 0, size, size))
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, src.Bounds(), xdraw.Over, nil)
	return dst
}

func gifFrameCount(raw []byte) int {
	g, err := gif.DecodeAll(bytes.NewReader(raw))
	if err != nil || g == nil {
		return 0
	}
	return len(g.Image)
}

const (
	// 动图转换上限：超过则回退保留原 GIF，避免 CPU/内存过高
	maxAnimatedGIFrames  = 300
	maxAnimatedGifPixels = int64(64 * 1024 * 1024) // 总像素（宽×高×帧数）
)

// encodeAnimatedGIFToWebP 将动图 GIF 转为动图 WebP；解析/编码失败或过大时返回 ok=false（回退保留原图）。
func encodeAnimatedGIFToWebP(raw []byte, opt *imageProcessOptions) ([]byte, bool) {
	g, err := gif.DecodeAll(bytes.NewReader(raw))
	if err != nil || g == nil || len(g.Image) < 2 {
		return nil, false
	}
	w, h := g.Config.Width, g.Config.Height
	if w <= 0 || h <= 0 {
		return nil, false
	}
	if len(g.Image) > maxAnimatedGIFrames || int64(w)*int64(h)*int64(len(g.Image)) > maxAnimatedGifPixels {
		return nil, false
	}

	frames, durations, disposals := composeGIFAnimation(g, w, h)
	if len(frames) == 0 {
		return nil, false
	}
	// 逐帧应用裁剪/缩放（如头像裁剪）
	if opt != nil {
		for i := range frames {
			frames[i] = applyCropAndResize(frames[i], opt)
		}
	}

	ani := &gowebp.Animation{
		Images:          frames,
		Durations:       durations,
		Disposals:       disposals,
		LoopCount:       gifLoopCountToWebP(g.LoopCount),
		BackgroundColor: 0x00000000,
	}
	var buf bytes.Buffer
	if err := gowebp.EncodeAll(&buf, ani, &gowebp.Options{
		Lossy:   true,
		Quality: UploadWebPQuality,
		Method:  UploadWebPMethod,
	}); err != nil {
		return nil, false
	}
	return buf.Bytes(), true
}

// composeGIFAnimation 将 GIF 帧按处置方式合成到逻辑画布，输出整帧序列、
// 帧时长（毫秒）与 WebP 处置方式（0=保留，1=清为背景）。
func composeGIFAnimation(g *gif.GIF, w, h int) ([]image.Image, []uint, []uint) {
	canvas := image.NewNRGBA(image.Rect(0, 0, w, h))
	frames := make([]image.Image, 0, len(g.Image))
	durations := make([]uint, 0, len(g.Image))
	disposals := make([]uint, 0, len(g.Image))
	var saved *image.NRGBA

	for i, frame := range g.Image {
		disposal := byte(0)
		if i < len(g.Disposal) {
			disposal = g.Disposal[i]
		}
		if disposal == gif.DisposalPrevious {
			saved = cloneNRGBA(canvas)
		}

		// 帧可能为局部区域并含透明，叠加到画布
		draw.Draw(canvas, frame.Bounds(), frame, frame.Bounds().Min, draw.Over)
		frames = append(frames, cloneNRGBA(canvas))

		delay := 10 // GIF 默认 100ms
		if i < len(g.Delay) && g.Delay[i] > 0 {
			delay = g.Delay[i]
		}
		durations = append(durations, uint(delay*10))

		switch disposal {
		case gif.DisposalBackground:
			clearNRGBARect(canvas, frame.Bounds())
			disposals = append(disposals, 1)
		case gif.DisposalPrevious:
			if saved != nil {
				canvas = cloneNRGBA(saved)
			}
			disposals = append(disposals, 0)
		default:
			disposals = append(disposals, 0)
		}
	}
	return frames, durations, disposals
}

func cloneNRGBA(src *image.NRGBA) *image.NRGBA {
	dst := image.NewNRGBA(src.Bounds())
	copy(dst.Pix, src.Pix)
	return dst
}

func clearNRGBARect(img *image.NRGBA, r image.Rectangle) {
	r = r.Intersect(img.Bounds())
	if r.Empty() {
		return
	}
	for y := r.Min.Y; y < r.Max.Y; y++ {
		start := img.PixOffset(r.Min.X, y)
		end := img.PixOffset(r.Max.X, y)
		for i := start; i < end; i++ {
			img.Pix[i] = 0
		}
	}
}

// gifLoopCountToWebP GIF 循环次数转 WebP：0=无限，-1=仅播放一次，其余保持不变。
func gifLoopCountToWebP(loop int) uint16 {
	if loop < 0 {
		return 1
	}
	if loop > 0 && loop <= 0xffff {
		return uint16(loop)
	}
	return 0
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

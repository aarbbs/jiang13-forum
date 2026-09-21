package service

import (
	"bytes"
	"image"
	"image/color"
	"image/gif"
	"testing"
)

func buildAnimatedGIF(t *testing.T) []byte {
	t.Helper()
	pal := color.Palette{color.RGBA{R: 255, A: 255}, color.RGBA{G: 255, A: 255}}
	f1 := image.NewPaletted(image.Rect(0, 0, 8, 8), pal)
	f2 := image.NewPaletted(image.Rect(0, 0, 8, 8), pal)
	for i := range f1.Pix {
		f1.Pix[i] = 0
	}
	for i := range f2.Pix {
		f2.Pix[i] = 1
	}
	g := &gif.GIF{
		Image:     []*image.Paletted{f1, f2},
		Delay:     []int{10, 20},
		Disposal:  []byte{gif.DisposalNone, gif.DisposalNone},
		LoopCount: 0,
		Config:    image.Config{ColorModel: pal, Width: 8, Height: 8},
	}
	var buf bytes.Buffer
	if err := gif.EncodeAll(&buf, g); err != nil {
		t.Fatalf("encode gif: %v", err)
	}
	return buf.Bytes()
}

func TestEncodeAnimatedGIFToWebP(t *testing.T) {
	raw := buildAnimatedGIF(t)
	if gifFrameCount(raw) != 2 {
		t.Fatalf("expected 2 gif frames")
	}
	webp, ok := encodeAnimatedGIFToWebP(raw, nil)
	if !ok {
		t.Fatal("should convert animated gif to animated webp")
	}
	for _, chunk := range []string{"RIFF", "WEBP", "VP8X", "ANIM", "ANMF"} {
		if !bytes.Contains(webp, []byte(chunk)) {
			t.Fatalf("animated webp missing chunk %q", chunk)
		}
	}
}

func TestEncodeAnimatedGIFCropResize(t *testing.T) {
	raw := buildAnimatedGIF(t) // 8x8, 2 帧
	opt := &imageProcessOptions{crop: &CropRect{X: 2, Y: 2, W: 4, H: 4}, squareOut: 64}
	webp, ok := encodeAnimatedGIFToWebP(raw, opt)
	if !ok {
		t.Fatal("should convert with crop/resize")
	}
	if !bytes.Contains(webp, []byte("ANIM")) || !bytes.Contains(webp, []byte("ANMF")) {
		t.Fatal("should stay animated")
	}
	// 解析首个 ANMF 帧头，确认已裁剪并缩放为 64x64
	w, h := animFrameSize(t, webp)
	if w != 64 || h != 64 {
		t.Fatalf("expected 64x64 frame, got %dx%d", w, h)
	}
}

// animFrameSize 读取首个 ANMF 帧头中的宽高（WebP 容器规范）。
func animFrameSize(t *testing.T, data []byte) (int, int) {
	t.Helper()
	idx := bytes.Index(data, []byte("ANMF"))
	if idx < 0 || idx+12 > len(data) {
		t.Fatal("ANMF chunk not found")
	}
	p := idx + 8 // skip "ANMF" + chunk size
	read3 := func(b []byte) int { return int(b[0]) | int(b[1])<<8 | int(b[2])<<16 }
	w := read3(data[p+6:p+9]) + 1
	h := read3(data[p+9:p+12]) + 1
	return w, h
}

func TestEncodeStaticGIFNotAnimated(t *testing.T) {	pal := color.Palette{color.RGBA{R: 255, A: 255}}
	f := image.NewPaletted(image.Rect(0, 0, 4, 4), pal)
	g := &gif.GIF{
		Image:  []*image.Paletted{f},
		Delay:  []int{0},
		Config: image.Config{ColorModel: pal, Width: 4, Height: 4},
	}
	var buf bytes.Buffer
	if err := gif.EncodeAll(&buf, g); err != nil {
		t.Fatalf("encode gif: %v", err)
	}
	if _, ok := encodeAnimatedGIFToWebP(buf.Bytes(), nil); ok {
		t.Fatal("single-frame gif should not use animation encoder")
	}
}

func TestGifLoopCountToWebP(t *testing.T) {
	if got := gifLoopCountToWebP(0); got != 0 {
		t.Fatalf("0 should map to infinite (0), got %d", got)
	}
	if got := gifLoopCountToWebP(-1); got != 1 {
		t.Fatalf("-1 should map to 1, got %d", got)
	}
	if got := gifLoopCountToWebP(3); got != 3 {
		t.Fatalf("3 should map to 3, got %d", got)
	}
}

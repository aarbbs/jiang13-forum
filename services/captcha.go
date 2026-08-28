package service

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"math/big"
	"strings"
	"sync"
	"time"
)

const (
	captchaLen    = 4
	captchaTTL    = 5 * time.Minute
	captchaChars  = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	captchaWidth  = 120
	captchaHeight = 40
)

type captchaEntry struct {
	answer    string
	expiresAt time.Time
}

// CaptchaService 内存图形验证码
type CaptchaService struct {
	mu      sync.Mutex
	entries map[string]captchaEntry
}

func NewCaptchaService() *CaptchaService {
	s := &CaptchaService{entries: make(map[string]captchaEntry)}
	go s.cleanup()
	return s
}

// Generate 生成验证码，返回 id 与 SVG 图片
func (s *CaptchaService) Generate() (id, svg string, err error) {
	answer, err := randomCaptchaText(captchaLen)
	if err != nil {
		return "", "", err
	}
	rawID := make([]byte, 16)
	if _, err := rand.Read(rawID); err != nil {
		return "", "", err
	}
	id = hex.EncodeToString(rawID)

	s.mu.Lock()
	s.entries[id] = captchaEntry{
		answer:    strings.ToUpper(answer),
		expiresAt: time.Now().Add(captchaTTL),
	}
	s.mu.Unlock()

	return id, renderCaptchaSVG(answer), nil
}

// Verify 校验验证码（一次性，大小写不敏感）
func (s *CaptchaService) Verify(id, answer string) bool {
	if id == "" || answer == "" {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.entries[id]
	if !ok {
		return false
	}
	delete(s.entries, id)
	if time.Now().After(entry.expiresAt) {
		return false
	}
	return strings.EqualFold(entry.answer, strings.TrimSpace(answer))
}

func (s *CaptchaService) cleanup() {
	ticker := time.NewTicker(time.Minute)
	for range ticker.C {
		now := time.Now()
		s.mu.Lock()
		for id, entry := range s.entries {
			if now.After(entry.expiresAt) {
				delete(s.entries, id)
			}
		}
		s.mu.Unlock()
	}
}

func randomCaptchaText(n int) (string, error) {
	var b strings.Builder
	b.Grow(n)
	max := big.NewInt(int64(len(captchaChars)))
	for i := 0; i < n; i++ {
		idx, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		b.WriteByte(captchaChars[idx.Int64()])
	}
	return b.String(), nil
}

func renderCaptchaSVG(text string) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf(
		`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">`,
		captchaWidth, captchaHeight, captchaWidth, captchaHeight,
	))
	b.WriteString(`<rect width="100%" height="100%" fill="#f4f6f5"/>`)

	// 干扰线
	for i := 0; i < 4; i++ {
		x1, _ := randInt(0, captchaWidth)
		y1, _ := randInt(0, captchaHeight)
		x2, _ := randInt(0, captchaWidth)
		y2, _ := randInt(0, captchaHeight)
		color := noiseColor()
		b.WriteString(fmt.Sprintf(
			`<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="1"/>`,
			x1, y1, x2, y2, color,
		))
	}

	step := captchaWidth / (len(text) + 1)
	for i, ch := range text {
		x := step*(i+1) - 6
		y, _ := randInt(26, 34)
		rot, _ := randInt(-18, 18)
		b.WriteString(fmt.Sprintf(
			`<text x="%d" y="%d" fill="#2d5a45" font-size="22" font-family="monospace" font-weight="700" transform="rotate(%d %d %d)">%c</text>`,
			x, y, rot, x+6, y-6, ch,
		))
	}

	b.WriteString(`</svg>`)
	return b.String()
}

func randInt(min, max int) (int, error) {
	if max <= min {
		return min, nil
	}
	n, err := rand.Int(rand.Reader, big.NewInt(int64(max-min+1)))
	if err != nil {
		return min, err
	}
	return min + int(n.Int64()), nil
}

func noiseColor() string {
	r, _ := randInt(160, 210)
	g, _ := randInt(170, 220)
	b, _ := randInt(160, 210)
	return fmt.Sprintf("#%02x%02x%02x", r, g, b)
}

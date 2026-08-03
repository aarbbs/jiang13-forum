package service

import (
	"crypto/rand"
	"math/big"
	"strings"
	"sync"
	"time"

	"git.iioio.com/freefire/jiang13-forum/model"
)

const (
	emailCodeLen      = 6
	emailCodeTTL      = 10 * time.Minute
	emailCodeCooldown = 60 * time.Second
)

// EmailCodeLen 注册邮箱验证码位数（供 API 告知前端）
const EmailCodeLen = emailCodeLen

type emailCodeEntry struct {
	code      string
	expiresAt time.Time
	sentAt    time.Time
}

// EmailCodeService 注册邮箱验证码
type EmailCodeService struct {
	mu      sync.Mutex
	entries map[string]emailCodeEntry
	mail    *MailService
}

func NewEmailCodeService(mail *MailService) *EmailCodeService {
	s := &EmailCodeService{
		entries: make(map[string]emailCodeEntry),
		mail:    mail,
	}
	go s.cleanup()
	return s
}

// SendRegisterCode 向邮箱发送注册验证码
func (s *EmailCodeService) SendRegisterCode(email string) error {
	email = NormalizeEmail(email)
	if err := ValidateEmail(email); err != nil {
		return err
	}

	var exist model.User
	if err := model.DB.Where("email = ?", email).First(&exist).Error; err == nil {
		return ErrEmailExists
	}

	s.mu.Lock()
	if prev, ok := s.entries[email]; ok && time.Since(prev.sentAt) < emailCodeCooldown {
		s.mu.Unlock()
		return ErrEmailCodeCooldown
	}
	s.mu.Unlock()

	code, err := randomDigits(emailCodeLen)
	if err != nil {
		return err
	}

	siteName := "姜十三论坛"
	if s.mail != nil && s.mail.settings != nil {
		siteName = s.mail.settings.SiteBranding().Name
	}
	subject, textBody, htmlBody := BuildRegisterCodeMail(siteName, code, int(emailCodeTTL.Minutes()))
	if err := s.mail.SendHTML(email, subject, textBody, htmlBody); err != nil {
		return err
	}

	s.mu.Lock()
	s.entries[email] = emailCodeEntry{
		code:      code,
		expiresAt: time.Now().Add(emailCodeTTL),
		sentAt:    time.Now(),
	}
	s.mu.Unlock()
	return nil
}

// Verify 校验邮箱验证码（一次性）
func (s *EmailCodeService) Verify(email, code string) bool {
	email = NormalizeEmail(email)
	code = strings.TrimSpace(code)
	if email == "" || code == "" {
		return false
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.entries[email]
	if !ok {
		return false
	}
	delete(s.entries, email)
	if time.Now().After(entry.expiresAt) {
		return false
	}
	return entry.code == code
}

func (s *EmailCodeService) cleanup() {
	ticker := time.NewTicker(time.Minute)
	for range ticker.C {
		now := time.Now()
		s.mu.Lock()
		for email, entry := range s.entries {
			if now.After(entry.expiresAt) {
				delete(s.entries, email)
			}
		}
		s.mu.Unlock()
	}
}

func randomDigits(n int) (string, error) {
	var b strings.Builder
	b.Grow(n)
	max := big.NewInt(10)
	for i := 0; i < n; i++ {
		v, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		b.WriteByte(byte('0' + v.Int64()))
	}
	return b.String(), nil
}

package services

import (
	"crypto/rand"
	"errors"
	"math/big"
	"strings"
	"sync"
	"time"

	"git.iioio.com/freefire/jiang13-forum/models"
)

const (
	emailCodeLen      = 6
	emailCodeTTL      = 10 * time.Minute
	emailCodeCooldown = 60 * time.Second

	EmailCodePurposeRegister = "register"
	EmailCodePurposeReset    = "reset"
)

// EmailCodeLen 邮箱验证码位数（供 API 告知前端）
const EmailCodeLen = emailCodeLen

type emailCodeEntry struct {
	code      string
	expiresAt time.Time
	sentAt    time.Time
}

// EmailCodeService 邮箱验证码（按 purpose 隔离）
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

func emailCodeKey(purpose, email string) string {
	return purpose + ":" + NormalizeEmail(email)
}

// SendRegisterCode 向邮箱发送注册验证码（邮箱须未注册）
func (s *EmailCodeService) SendRegisterCode(email string) error {
	return s.sendCode(EmailCodePurposeRegister, email)
}

// SendResetCode 向邮箱发送重置密码验证码（邮箱须已注册；不存在时仍返回成功以防枚举）
func (s *EmailCodeService) SendResetCode(email string) error {
	return s.sendCode(EmailCodePurposeReset, email)
}

func (s *EmailCodeService) sendCode(purpose, email string) error {
	email = NormalizeEmail(email)
	if err := ValidateEmail(email); err != nil {
		return err
	}

	var exist models.User
	found := models.DB.Where("email = ?", email).First(&exist).Error == nil
	switch purpose {
	case EmailCodePurposeRegister:
		if found {
			return ErrEmailExists
		}
	case EmailCodePurposeReset:
		if !found {
			// 防邮箱枚举：假装已发送
			return nil
		}
	default:
		return errors.New("无效的验证码用途")
	}

	key := emailCodeKey(purpose, email)
	s.mu.Lock()
	if prev, ok := s.entries[key]; ok && time.Since(prev.sentAt) < emailCodeCooldown {
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
	var subject, textBody, htmlBody string
	if purpose == EmailCodePurposeReset {
		subject, textBody, htmlBody = BuildResetCodeMail(siteName, code, int(emailCodeTTL.Minutes()))
	} else {
		subject, textBody, htmlBody = BuildRegisterCodeMail(siteName, code, int(emailCodeTTL.Minutes()))
	}
	if err := s.mail.SendHTML(email, subject, textBody, htmlBody); err != nil {
		return err
	}

	s.mu.Lock()
	s.entries[key] = emailCodeEntry{
		code:      code,
		expiresAt: time.Now().Add(emailCodeTTL),
		sentAt:    time.Now(),
	}
	s.mu.Unlock()
	return nil
}

// Verify 校验邮箱验证码（一次性）；兼容旧调用 Verify(email, code) 视为注册用途
func (s *EmailCodeService) Verify(email, code string) bool {
	return s.VerifyPurpose(EmailCodePurposeRegister, email, code)
}

// VerifyPurpose 按用途校验验证码（一次性）
func (s *EmailCodeService) VerifyPurpose(purpose, email, code string) bool {
	email = NormalizeEmail(email)
	code = strings.TrimSpace(code)
	if purpose == "" || email == "" || code == "" {
		return false
	}
	key := emailCodeKey(purpose, email)
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.entries[key]
	if !ok {
		return false
	}
	delete(s.entries, key)
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
		for key, entry := range s.entries {
			if now.After(entry.expiresAt) {
				delete(s.entries, key)
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

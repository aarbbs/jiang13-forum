package services

import (
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUserExists            = errors.New("用户名已存在")
	ErrEmailExists           = errors.New("邮箱已被注册")
	ErrInvalidCred           = errors.New("用户名或密码错误")
	ErrUserBanned            = errors.New("账号已被禁言")
	ErrWeakPassword          = errors.New("密码至少 6 位")
	ErrInvalidUsername       = errors.New("用户名 2-32 位，支持中文、字母、数字与下划线")
	ErrInvalidEmail          = errors.New("邮箱格式不正确")
	ErrPostNotFound          = errors.New("帖子不存在")
	ErrCommentNotFound       = errors.New("评论不存在")
	ErrPermissionDenied      = errors.New("无权操作")
	ErrBoardNotFound         = errors.New("板块不存在")
	ErrPostEditLocked        = errors.New("帖子已被管理员锁定，无法编辑")
	ErrPostCommentsLocked    = errors.New("该帖子已锁定讨论，无法评论")
	ErrPostEditExpired       = errors.New("已超过可编辑时限")
	ErrRevisionNotFound      = errors.New("历史版本不存在")
	ErrInvalidSetting        = errors.New("无效的设置值")
	ErrSearchKeywordTooShort = errors.New("搜索关键词过短")
	ErrSearchKeywordTooLong  = errors.New("搜索关键词过长")
	ErrPostTitleTooLong      = errors.New("标题过长")
	ErrPostTagsTooLong       = errors.New("标签过长")
	ErrPostContentTooLong    = errors.New("正文过长")
	ErrCommentTooLong        = errors.New("评论内容过长")
	ErrCaptchaInvalid        = errors.New("验证码错误或已过期")
	ErrEmailCodeInvalid      = errors.New("邮箱验证码错误或已过期")
	ErrEmailCodeCooldown     = errors.New("发送过于频繁，请稍后再试")
	ErrMailNotConfigured     = errors.New("邮件服务未配置或未启用")
	ErrRegisterClosed        = errors.New("论坛暂未开放注册，请联系管理员配置邮件服务")
)

// HashPassword 使用 bcrypt 加密密码
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

// CheckPassword 校验密码
func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// ValidateUsername 校验用户名：中文/字母/数字/下划线，2-32 个字符
func ValidateUsername(username string) error {
	n := utf8.RuneCountInString(username)
	if n < 2 || n > 32 {
		return ErrInvalidUsername
	}
	for _, r := range username {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' {
			continue
		}
		return ErrInvalidUsername
	}
	return nil
}

// NormalizeEmail 规范化邮箱（小写去空格）
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// ValidateEmail 校验邮箱格式
func ValidateEmail(email string) error {
	email = NormalizeEmail(email)
	if email == "" {
		return ErrInvalidEmail
	}
	addr, err := mail.ParseAddress(email)
	if err != nil || addr.Address != email {
		return ErrInvalidEmail
	}
	return nil
}

// ValidatePassword 校验密码强度
func ValidatePassword(password string, minLen int) error {
	if minLen <= 0 {
		minLen = 6
	}
	if utf8.RuneCountInString(password) < minLen {
		return fmt.Errorf("密码至少 %d 位", minLen)
	}
	return nil
}

// SensitiveFilter 敏感词过滤器
type SensitiveFilter struct {
	mu    sync.RWMutex
	words []string
}

func NewSensitiveFilter() *SensitiveFilter {
	return &SensitiveFilter{
		words: []string{"违禁词示例", "广告刷单"},
	}
}

// LoadFromFile 从配置文件加载敏感词，每行一个词
func (f *SensitiveFilter) LoadFromFile(path string) {
	data, err := osReadFile(path)
	if err != nil {
		return
	}
	lines := strings.Split(string(data), "\n")
	var words []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "#") {
			words = append(words, line)
		}
	}
	if len(words) > 0 {
		f.mu.Lock()
		f.words = words
		f.mu.Unlock()
	}
}

func (f *SensitiveFilter) Filter(text string) string {
	f.mu.RLock()
	defer f.mu.RUnlock()
	result := text
	for _, w := range f.words {
		if w == "" {
			continue
		}
		replacement := strings.Repeat("*", utf8.RuneCountInString(w))
		result = strings.ReplaceAll(result, w, replacement)
	}
	return result
}

// osReadFile 避免循环依赖，简单封装
func osReadFile(path string) ([]byte, error) {
	return readFile(path)
}

// readFile 由 filter_io.go 实现
var readFile = func(path string) ([]byte, error) {
	return nil, errors.New("not implemented")
}

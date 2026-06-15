package service

import (
	"errors"
	"regexp"
	"strings"
	"sync"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUserExists       = errors.New("用户名已存在")
	ErrInvalidCred      = errors.New("用户名或密码错误")
	ErrUserBanned       = errors.New("账号已被禁言")
	ErrWeakPassword     = errors.New("密码至少 6 位")
	ErrInvalidUsername  = errors.New("用户名 3-32 位字母数字下划线")
	ErrPostNotFound     = errors.New("帖子不存在")
	ErrCommentNotFound  = errors.New("评论不存在")
	ErrPermissionDenied = errors.New("无权操作")
	ErrBoardNotFound    = errors.New("板块不存在")
	ErrPostEditLocked   = errors.New("帖子已被管理员锁定，无法编辑")
	ErrPostEditExpired  = errors.New("已超过可编辑时限")
	ErrRevisionNotFound = errors.New("历史版本不存在")
	ErrInvalidSetting   = errors.New("无效的设置值")
)

var usernameRe = regexp.MustCompile(`^[a-zA-Z0-9_]{3,32}$`)

// HashPassword 使用 bcrypt 加密密码
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

// CheckPassword 校验密码
func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// ValidateUsername 校验用户名格式
func ValidateUsername(username string) error {
	if !usernameRe.MatchString(username) {
		return ErrInvalidUsername
	}
	return nil
}

// ValidatePassword 校验密码强度
func ValidatePassword(password string) error {
	if utf8.RuneCountInString(password) < 6 {
		return ErrWeakPassword
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

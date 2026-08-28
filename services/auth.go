package services

import (
	"sync"
	"time"

	"git.iioio.com/freefire/jiang13-forum/models"
)

// 最近访问写入节流，避免每次请求都打库
const lastAccessTouchInterval = 5 * time.Minute

var lastAccessTouchCache sync.Map // userID(uint) -> time.Time

// SessionTTL 与浏览器会话对齐（兼容旧常量名）
const TokenExpire = SessionTTL

type AuthService struct {
	hmacSecret string // CSRF 等 HMAC；不再用于浏览器登录 JWT
	filter     *SensitiveFilter
	settings   *ForumSettingsService
}

func NewAuthService(hmacSecret string, filter *SensitiveFilter, settings *ForumSettingsService) *AuthService {
	return &AuthService{hmacSecret: hmacSecret, filter: filter, settings: settings}
}

// HMACSecret 供 CSRF 等使用
func (s *AuthService) HMACSecret() string { return s.hmacSecret }

// UserCount 当前用户数
func (s *AuthService) UserCount() int64 {
	var n int64
	models.DB.Model(&models.User{}).Count(&n)
	return n
}

// Register 用户注册
func (s *AuthService) Register(username, password, nickname, email string) (*models.User, error) {
	if err := ValidateUsername(username); err != nil {
		return nil, err
	}
	if err := ValidatePassword(password, s.settings.PasswordMinLen()); err != nil {
		return nil, err
	}
	email = NormalizeEmail(email)
	if err := ValidateEmail(email); err != nil {
		return nil, err
	}

	var exist models.User
	if err := models.DB.Where("username = ?", username).First(&exist).Error; err == nil {
		return nil, ErrUserExists
	}
	if err := models.DB.Where("email = ?", email).First(&exist).Error; err == nil {
		return nil, ErrEmailExists
	}

	hash, err := HashPassword(password)
	if err != nil {
		return nil, err
	}
	if nickname == "" {
		nickname = username
	}
	nickname = s.filter.Filter(nickname)

	user := &models.User{
		Username: username,
		Email:    email,
		Password: hash,
		Nickname: nickname,
		Role:     models.RoleUser,
	}
	if err := models.DB.Create(user).Error; err != nil {
		return nil, err
	}
	return user, nil
}

// CreateAdmin 安装向导创建管理员（仅应在未安装时调用）
func (s *AuthService) CreateAdmin(username, password, nickname, email string) (*models.User, error) {
	if err := ValidateUsername(username); err != nil {
		return nil, err
	}
	if err := ValidatePassword(password, s.settings.PasswordMinLen()); err != nil {
		return nil, err
	}
	email = NormalizeEmail(email)
	if err := ValidateEmail(email); err != nil {
		return nil, err
	}
	if nickname == "" {
		nickname = username
	}
	nickname = s.filter.Filter(nickname)
	hash, err := HashPassword(password)
	if err != nil {
		return nil, err
	}
	user := &models.User{
		Username: username,
		Email:    email,
		Password: hash,
		Nickname: nickname,
		Role:     models.RoleAdmin,
		Verified: true,
	}
	if err := models.DB.Create(user).Error; err != nil {
		return nil, err
	}
	return user, nil
}

// Login 校验密码并创建会话，返回 session id
func (s *AuthService) Login(username, password, clientIP, userAgent string) (sessionID string, user *models.User, err error) {
	var u models.User
	if err := models.DB.Where("username = ?", username).First(&u).Error; err != nil {
		return "", nil, ErrInvalidCred
	}
	if u.Banned {
		return "", nil, ErrUserBanned
	}
	if !CheckPassword(u.Password, password) {
		return "", nil, ErrInvalidCred
	}
	s.recordLogin(&u, clientIP)
	sid, err := CreateSession(u.ID, clientIP, userAgent)
	if err != nil {
		return "", nil, err
	}
	return sid, &u, nil
}

// CreateSessionForUser 已认证用户直接建会话（注册后自动登录）
func (s *AuthService) CreateSessionForUser(user *models.User, clientIP, userAgent string) (string, error) {
	if user == nil {
		return "", ErrInvalidCred
	}
	s.recordLogin(user, clientIP)
	return CreateSession(user.ID, clientIP, userAgent)
}

func (s *AuthService) recordLogin(user *models.User, clientIP string) {
	now := time.Now()
	ip := clientIP
	if len(ip) > 45 {
		ip = ip[:45]
	}
	_ = models.DB.Model(user).Updates(map[string]interface{}{
		"last_login_at":  now,
		"last_login_ip":  ip,
		"last_access_at": now,
	}).Error
	user.LastLoginAt = &now
	user.LastLoginIP = ip
	user.LastAccessAt = &now
	lastAccessTouchCache.Store(user.ID, now)
}

// TouchLastAccess 记录最近访问时间（节流写入，失败忽略）
func (s *AuthService) TouchLastAccess(userID uint) {
	if userID == 0 {
		return
	}
	now := time.Now()
	if v, ok := lastAccessTouchCache.Load(userID); ok {
		if t, ok := v.(time.Time); ok && now.Sub(t) < lastAccessTouchInterval {
			return
		}
	}
	lastAccessTouchCache.Store(userID, now)
	_ = models.DB.Model(&models.User{}).Where("id = ?", userID).Update("last_access_at", now).Error
}

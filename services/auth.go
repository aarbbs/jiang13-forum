package service

import (
	"errors"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"git.iioio.com/freefire/jiang13-forum/model"
)

// 最近访问写入节流，避免每次 API 都打库
const lastAccessTouchInterval = 5 * time.Minute

var lastAccessTouchCache sync.Map // userID(uint) -> time.Time

const TokenExpire = 7 * 24 * time.Hour

type Claims struct {
	UserID   uint       `json:"user_id"`
	Username string     `json:"username"`
	Role     model.Role `json:"role"`
	jwt.RegisteredClaims
}

type AuthService struct {
	jwtSecret string
	filter    *SensitiveFilter
	settings  *ForumSettingsService
}

func NewAuthService(jwtSecret string, filter *SensitiveFilter, settings *ForumSettingsService) *AuthService {
	return &AuthService{jwtSecret: jwtSecret, filter: filter, settings: settings}
}

// UserCount 当前用户数
func (s *AuthService) UserCount() int64 {
	var n int64
	model.DB.Model(&model.User{}).Count(&n)
	return n
}

// Register 用户注册
func (s *AuthService) Register(username, password, nickname, email string) (*model.User, error) {
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

	var exist model.User
	if err := model.DB.Where("username = ?", username).First(&exist).Error; err == nil {
		return nil, ErrUserExists
	}
	if err := model.DB.Where("email = ?", email).First(&exist).Error; err == nil {
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

	// 首个注册用户自动成为管理员
	role := model.RoleUser
	if s.UserCount() == 0 {
		role = model.RoleAdmin
	}

	user := &model.User{
		Username: username,
		Email:    email,
		Password: hash,
		Nickname: nickname,
		Role:     role,
	}
	if err := model.DB.Create(user).Error; err != nil {
		return nil, err
	}
	return user, nil
}

// Login 用户登录，返回 JWT token；clientIP 写入上次登录记录
func (s *AuthService) Login(username, password, clientIP string) (string, *model.User, error) {
	var user model.User
	if err := model.DB.Where("username = ?", username).First(&user).Error; err != nil {
		return "", nil, ErrInvalidCred
	}
	if user.Banned {
		return "", nil, ErrUserBanned
	}
	if !CheckPassword(user.Password, password) {
		return "", nil, ErrInvalidCred
	}
	s.recordLogin(&user, clientIP)
	token, err := s.GenerateToken(&user)
	return token, &user, err
}

// recordLogin 记录上次登录时间与 IP；登录同时视为一次访问（失败不影响登录）
func (s *AuthService) recordLogin(user *model.User, clientIP string) {
	now := time.Now()
	ip := clientIP
	if len(ip) > 45 {
		ip = ip[:45]
	}
	_ = model.DB.Model(user).Updates(map[string]interface{}{
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
	_ = model.DB.Model(&model.User{}).Where("id = ?", userID).Update("last_access_at", now).Error
}

// GenerateToken 生成 JWT
func (s *AuthService) GenerateToken(user *model.User) (string, error) {
	claims := Claims{
		UserID:   user.ID,
		Username: user.Username,
		Role:     user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(TokenExpire)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.jwtSecret))
}

// ParseToken 解析 JWT
func (s *AuthService) ParseToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(s.jwtSecret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

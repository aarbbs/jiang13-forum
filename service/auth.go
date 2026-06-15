package service

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jiang13/forum/model"
)

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
}

func NewAuthService(jwtSecret string, filter *SensitiveFilter) *AuthService {
	return &AuthService{jwtSecret: jwtSecret, filter: filter}
}

// Register 用户注册
func (s *AuthService) Register(username, password, nickname string) (*model.User, error) {
	if err := ValidateUsername(username); err != nil {
		return nil, err
	}
	if err := ValidatePassword(password); err != nil {
		return nil, err
	}
	var exist model.User
	if err := model.DB.Where("username = ?", username).First(&exist).Error; err == nil {
		return nil, ErrUserExists
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
	var userCount int64
	model.DB.Model(&model.User{}).Count(&userCount)
	if userCount == 0 {
		role = model.RoleAdmin
	}

	user := &model.User{
		Username: username,
		Password: hash,
		Nickname: nickname,
		Role:     role,
	}
	if err := model.DB.Create(user).Error; err != nil {
		return nil, err
	}
	return user, nil
}

// Login 用户登录，返回 JWT token
func (s *AuthService) Login(username, password string) (string, *model.User, error) {
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
	token, err := s.GenerateToken(&user)
	return token, &user, err
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

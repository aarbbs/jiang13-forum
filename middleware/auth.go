package middleware

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"git.iioio.com/freefire/jiang13-forum/model"
	"git.iioio.com/freefire/jiang13-forum/service"
)

const (
	CtxUserID   = "user_id"
	CtxUsername = "username"
	CtxRole     = "role"
	CookieName  = "jiang13_token"
)

type AuthMiddleware struct {
	auth *service.AuthService
}

func NewAuthMiddleware(auth *service.AuthService) *AuthMiddleware {
	return &AuthMiddleware{auth: auth}
}

// OptionalAuth 可选鉴权：有 token 则解析，无 token 不拦截
func (m *AuthMiddleware) OptionalAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := extractToken(c)
		if token != "" {
			if claims, err := m.auth.ParseToken(token); err == nil {
				c.Set(CtxUserID, claims.UserID)
				c.Set(CtxUsername, claims.Username)
				c.Set(CtxRole, claims.Role)
			}
		}
		c.Next()
	}
}

// RequireAuth 必须登录
func (m *AuthMiddleware) RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := extractToken(c)
		if token == "" {
			respondAuthRequired(c)
			c.Abort()
			return
		}
		claims, err := m.auth.ParseToken(token)
		if err != nil {
			respondAuthExpired(c)
			c.Abort()
			return
		}
		// 检查禁言
		var user model.User
		if err := model.DB.First(&user, claims.UserID).Error; err != nil || user.Banned {
			respondBanned(c)
			c.Abort()
			return
		}
		c.Set(CtxUserID, claims.UserID)
		c.Set(CtxUsername, claims.Username)
		c.Set(CtxRole, claims.Role)
		c.Next()
	}
}

// RequireAdmin 必须管理员
func (m *AuthMiddleware) RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get(CtxRole)
		if !exists || role != model.RoleAdmin {
			if isAPI(c) {
				c.JSON(http.StatusForbidden, gin.H{"error": "需要管理员权限"})
			} else {
				c.Redirect(http.StatusFound, "/admin/login")
			}
			c.Abort()
			return
		}
		c.Next()
	}
}

func extractToken(c *gin.Context) string {
	if auth := c.GetHeader("Authorization"); auth != "" {
		if strings.HasPrefix(auth, "Bearer ") {
			return strings.TrimPrefix(auth, "Bearer ")
		}
	}
	if token, err := c.Cookie(CookieName); err == nil {
		return token
	}
	return c.Query("token")
}

func isAPI(c *gin.Context) bool {
	p := c.Request.URL.Path
	return strings.HasPrefix(p, "/api/") || strings.HasPrefix(p, "/admin/api/")
}

func adminLoginPath(c *gin.Context) string {
	if strings.HasPrefix(c.Request.URL.Path, "/admin") {
		return "/admin/login"
	}
	return "/login"
}

func respondAuthRequired(c *gin.Context) {
	if isAPI(c) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	c.Redirect(http.StatusFound, adminLoginPath(c))
}

func respondAuthExpired(c *gin.Context) {
	c.SetCookie(CookieName, "", -1, "/", "", false, true)
	if isAPI(c) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "登录已过期"})
		return
	}
	c.Redirect(http.StatusFound, adminLoginPath(c))
}

func respondBanned(c *gin.Context) {
	if isAPI(c) {
		c.JSON(http.StatusForbidden, gin.H{"error": "账号已被禁言"})
		return
	}
	if strings.HasPrefix(c.Request.URL.Path, "/admin") {
		c.Redirect(http.StatusFound, "/admin/login?banned=1")
		return
	}
	c.Redirect(http.StatusFound, "/login?banned=1")
}

// RateLimitMiddleware 限流中间件
func RateLimitMiddleware(limiter *service.RateLimiter, action string) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.ClientIP() + ":" + action
		if uid, ok := c.Get(CtxUserID); ok {
			key = fmt.Sprintf("%s:%d", action, uid.(uint))
		}
		if !limiter.Allow(key) {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "操作过于频繁，请稍后再试"})
			c.Abort()
			return
		}
		c.Next()
	}
}

package auth

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

const (
	CtxUserID    = "user_id"
	CtxUsername  = "username"
	CtxRole      = "role"
	CtxSessionID = "session_id"
	CookieName   = "jiang13_session"
)

type AuthMiddleware struct {
	auth *services.AuthService
}

func NewAuthMiddleware(auth *services.AuthService) *AuthMiddleware {
	return &AuthMiddleware{auth: auth}
}

// OptionalAuth 可选鉴权：有会话则加载用户；禁言/无效则清 Cookie
func (m *AuthMiddleware) OptionalAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		sid := extractSessionID(c)
		if sid == "" {
			c.Next()
			return
		}
		user, sess, err := services.ResolveSession(sid)
		if err != nil || user == nil {
			ClearAuthCookie(c)
			c.Next()
			return
		}
		if user.Banned {
			services.RevokeUserSessions(user.ID)
			ClearAuthCookie(c)
			c.Next()
			return
		}
		c.Set(CtxUserID, user.ID)
		c.Set(CtxUsername, user.Username)
		c.Set(CtxRole, user.Role)
		c.Set(CtxSessionID, sess.ID)
		m.auth.TouchLastAccess(user.ID)
		c.Next()
	}
}

// RequireAuth 必须登录且未禁言
func (m *AuthMiddleware) RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		sid := extractSessionID(c)
		if sid == "" {
			respondAuthRequired(c)
			c.Abort()
			return
		}
		user, sess, err := services.ResolveSession(sid)
		if err != nil || user == nil {
			respondAuthExpired(c)
			c.Abort()
			return
		}
		if user.Banned {
			services.RevokeUserSessions(user.ID)
			ClearAuthCookie(c)
			respondBanned(c)
			c.Abort()
			return
		}
		c.Set(CtxUserID, user.ID)
		c.Set(CtxUsername, user.Username)
		c.Set(CtxRole, user.Role)
		c.Set(CtxSessionID, sess.ID)
		m.auth.TouchLastAccess(user.ID)
		c.Next()
	}
}

// RequireAdmin 必须管理员（依赖上游已跑 OptionalAuth/RequireAuth，role 来自 DB）
func (m *AuthMiddleware) RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid, ok := c.Get(CtxUserID)
		if !ok || uid == nil {
			respondAuthRequired(c)
			c.Abort()
			return
		}
		role, exists := c.Get(CtxRole)
		if !exists || role != models.RoleAdmin {
			if isAPI(c) {
				c.JSON(http.StatusForbidden, gin.H{"error": "需要管理员权限"})
			} else {
				c.Redirect(http.StatusFound, "/")
			}
			c.Abort()
			return
		}
		c.Next()
	}
}

func extractSessionID(c *gin.Context) string {
	if sid, err := c.Cookie(CookieName); err == nil && sid != "" {
		return sid
	}
	// 兼容清理旧 Cookie 名（一次性）
	if old, err := c.Cookie("jiang13_token"); err == nil && old != "" {
		ClearNamedCookie(c, "jiang13_token")
	}
	return ""
}

func isAPI(c *gin.Context) bool {
	return strings.HasPrefix(c.Request.URL.Path, "/api/")
}

func adminLoginPath(c *gin.Context) string {
	if strings.HasPrefix(c.Request.URL.Path, "/admin") {
		return "/login?redirect=" + url.QueryEscape("/admin/dashboard")
	}
	return "/login"
}

func respondAuthRequired(c *gin.Context) {
	if isAPI(c) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	redir := c.Request.URL.RequestURI()
	if strings.HasPrefix(c.Request.URL.Path, "/admin") {
		redir = "/admin/dashboard"
	}
	c.Redirect(http.StatusFound, "/login?redirect="+url.QueryEscape(redir))
}

func respondAuthExpired(c *gin.Context) {
	ClearAuthCookie(c)
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
	c.Redirect(http.StatusFound, "/login?banned=1")
}

// RateLimitMiddleware 限流中间件
func RateLimitMiddleware(limiter *services.RateLimiter, action string) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.ClientIP()
		if uid, ok := c.Get(CtxUserID); ok {
			key = fmt.Sprintf("%d", uid.(uint))
		}
		if !limiter.Allow(action, key) {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "操作过于频繁，请稍后再试"})
			c.Abort()
			return
		}
		c.Next()
	}
}

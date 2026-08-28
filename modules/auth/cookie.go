package auth

import (
	"net/http"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

// ClearAuthCookie 清除登录会话 Cookie
func ClearAuthCookie(c *gin.Context) {
	ClearNamedCookie(c, CookieName)
	ClearNamedCookie(c, "jiang13_token") // 清旧名
}

// ClearNamedCookie 按名清除
func ClearNamedCookie(c *gin.Context, name string) {
	secure := c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https")
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// SetSessionCookie 写入 opaque session id
func SetSessionCookie(c *gin.Context, sessionID string) {
	secure := c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https")
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     CookieName,
		Value:    sessionID,
		Path:     "/",
		MaxAge:   services.SessionCookieMaxAge(),
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

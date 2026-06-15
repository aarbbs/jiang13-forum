package middleware

import (
	"crypto/rand"
	"encoding/hex"

	"github.com/gin-gonic/gin"
	"github.com/jiang13/forum/service"
)

const VisitorCookieName = "j13_vid"

// PresenceMiddleware 记录当前请求的浏览活跃（会员或游客）
func PresenceMiddleware(online *service.OnlineService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if uid, ok := c.Get(CtxUserID); ok {
			if id, ok := uid.(uint); ok && id > 0 {
				online.Ping(id)
				c.Next()
				return
			}
		}
		vid, err := c.Cookie(VisitorCookieName)
		if err != nil || vid == "" {
			vid = newVisitorID()
			c.SetCookie(VisitorCookieName, vid, 86400, "/", "", false, true)
		}
		online.PingGuest(vid)
		c.Next()
	}
}

func newVisitorID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return hex.EncodeToString([]byte("fallback-visitor-id"))
	}
	return hex.EncodeToString(b)
}

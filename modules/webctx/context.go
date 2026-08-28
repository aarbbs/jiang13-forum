package webctx

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"html/template"
	"net/http"
	"strconv"
	"strings"
	"time"

	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/modules/auth"
	"git.iioio.com/freefire/jiang13-forum/modules/webrender"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

const (
	csrfCookie  = "jiang13_csrf"
	flashCookie = "jiang13_flash"
)

// Context 浏览器请求上下文（对齐 Gitea context 的精简版）
type Context struct {
	C      *gin.Context
	Doer   *models.User
	Secret string
}

// New 从 Gin 构造；依赖 OptionalAuth / RequireAuth 已写入 user 信息时可再查库
func New(c *gin.Context, secret string) *Context {
	ctx := &Context{C: c, Secret: secret}
	if id, ok := c.Get(auth.CtxUserID); ok {
		if uid, ok := id.(uint); ok && uid > 0 {
			var u models.User
			if err := models.DB.First(&u, uid).Error; err == nil {
				ctx.Doer = &u
			}
		}
	}
	return ctx
}

func (ctx *Context) IsSigned() bool { return ctx.Doer != nil }
func (ctx *Context) IsAdmin() bool {
	return ctx.Doer != nil && ctx.Doer.Role == models.RoleAdmin
}
func (ctx *Context) UserID() uint {
	if ctx.Doer == nil {
		return 0
	}
	return ctx.Doer.ID
}

// SkipsModeration 管理员或认证用户免审
func (ctx *Context) SkipsModeration() bool {
	return ctx.Doer != nil && ctx.Doer.SkipsModeration()
}

// HTML 渲染命名模板
func (ctx *Context) HTML(status int, name string, data any) {
	ctx.C.Header("Content-Type", "text/html; charset=utf-8")
	ctx.C.Status(status)
	if err := webrender.Execute(ctx.C.Writer, name, data); err != nil {
		ctx.C.String(http.StatusInternalServerError, "模板渲染失败")
	}
}

// Redirect 303 见其它 URI（PRG）
func (ctx *Context) Redirect(url string) {
	ctx.C.Redirect(http.StatusSeeOther, url)
}

// SetFlash 一次性提示（下一请求读取）
func (ctx *Context) SetFlash(msg string) {
	v := base64.RawURLEncoding.EncodeToString([]byte(msg))
	ctx.writeCookie(flashCookie, v, 120, true)
}

// TakeFlash 读取并清除
func (ctx *Context) TakeFlash() string {
	v, err := ctx.C.Cookie(flashCookie)
	if err != nil || v == "" {
		return ""
	}
	ctx.writeCookie(flashCookie, "", -1, true)
	b, err := base64.RawURLEncoding.DecodeString(v)
	if err != nil {
		return ""
	}
	return string(b)
}

// EnsureCSRF 保证 CSRF cookie，并返回表单 token
func (ctx *Context) EnsureCSRF() string {
	if t, err := ctx.C.Cookie(csrfCookie); err == nil && t != "" && ctx.validCSRF(t) {
		return t
	}
	t := ctx.newCSRF()
	ctx.writeCookie(csrfCookie, t, int((12 * time.Hour).Seconds()), true)
	return t
}

// CheckCSRF 校验表单 _csrf（或请求头 X-CSRF-Token，供上传 fetch）
func (ctx *Context) CheckCSRF() bool {
	form := strings.TrimSpace(ctx.C.PostForm("_csrf"))
	if form == "" {
		form = strings.TrimSpace(ctx.C.GetHeader("X-CSRF-Token"))
	}
	cookie, _ := ctx.C.Cookie(csrfCookie)
	if form == "" || cookie == "" || form != cookie {
		return false
	}
	return ctx.validCSRF(form)
}

func (ctx *Context) newCSRF() string {
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	mac := hmac.New(sha256.New, []byte(ctx.Secret))
	_, _ = mac.Write([]byte(ts))
	sig := hex.EncodeToString(mac.Sum(nil))[:32]
	return ts + "." + sig
}

func (ctx *Context) validCSRF(token string) bool {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return false
	}
	ts, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return false
	}
	if time.Since(time.Unix(ts, 0)) > 12*time.Hour {
		return false
	}
	mac := hmac.New(sha256.New, []byte(ctx.Secret))
	_, _ = mac.Write([]byte(parts[0]))
	sig := hex.EncodeToString(mac.Sum(nil))[:32]
	return hmac.Equal([]byte(sig), []byte(parts[1]))
}

// SetLoginCookie 写入 opaque 会话 Cookie
func (ctx *Context) SetLoginCookie(sessionID string) {
	auth.SetSessionCookie(ctx.C, sessionID)
}

// ClearLoginCookie 退出并删 Cookie；若有 session id 则吊销
func (ctx *Context) ClearLoginCookie() {
	if sid, err := ctx.C.Cookie(auth.CookieName); err == nil && sid != "" {
		services.DeleteSession(sid)
	}
	auth.ClearAuthCookie(ctx.C)
}

func (ctx *Context) writeCookie(name, value string, maxAge int, httpOnly bool) {
	secure := requestIsHTTPS(ctx.C)
	http.SetCookie(ctx.C.Writer, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: httpOnly,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// requestIsHTTPS 直连 TLS 或反代 X-Forwarded-Proto
func requestIsHTTPS(c *gin.Context) bool {
	if c.Request.TLS != nil {
		return true
	}
	return strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https")
}

// SafeHTML 供模板使用的类型别名说明（实际转换在 webrender FuncMap）
type SafeHTML = template.HTML

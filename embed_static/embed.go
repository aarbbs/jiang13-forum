package embed_static

import (
	"embed"
	"io/fs"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
)

//go:embed static/*
var staticFS embed.FS

var (
	spaTitleRe      = regexp.MustCompile(`(?s)<title>.*?</title>`)
	spaBrandTitleFn func() string
	spaBrandJSONFn  func() []byte // 站点品牌 JSON，注入 window.__J13_BRANDING__
)

// SetSPADocumentTitle 注册站点标题提供者，ServeSPA 会注入到入口 HTML，避免刷新闪烁
func SetSPADocumentTitle(fn func() string) {
	spaBrandTitleFn = fn
}

// SetSPABrandingJSON 注册品牌 JSON 提供者（须为合法 JSON 对象），供前端首屏同步读入
func SetSPABrandingJSON(fn func() []byte) {
	spaBrandJSONFn = fn
}

// SetupEmbed 配置内嵌资源：React SPA 静态资源
func SetupEmbed(r *gin.Engine) error {
	if sub, err := fs.Sub(staticFS, "static/spa/assets"); err == nil {
		r.GET("/assets/*filepath", gin.WrapH(http.StripPrefix("/assets", http.FileServer(http.FS(sub)))))
	}
	return nil
}

// ServeSPA 返回 React SPA 入口（仅注入站点默认标题）
func ServeSPA(c *gin.Context) {
	ServeSPAWithMeta(c, nil)
}

// ServeSPANoIndex 返回带 noindex 的 SPA（登录/后台等私密页）
func ServeSPANoIndex(c *gin.Context) {
	title := ""
	if spaBrandTitleFn != nil {
		title = strings.TrimSpace(spaBrandTitleFn())
	}
	ServeSPAWithMeta(c, &SPAPageMeta{
		Title:  title,
		Robots: "noindex,nofollow",
	})
}

// IsSPARoute 判断是否应由 SPA 处理
func IsSPARoute(path string) bool {
	if path == "/robots.txt" || path == "/sitemap.xml" {
		return false
	}
	if strings.HasPrefix(path, "/api") ||
		strings.HasPrefix(path, "/admin") ||
		strings.HasPrefix(path, "/uploads") ||
		strings.HasPrefix(path, "/media") ||
		strings.HasPrefix(path, "/assets") ||
		strings.HasPrefix(path, "/oauth") ||
		strings.HasPrefix(path, "/.well-known") {
		return false
	}
	return true
}

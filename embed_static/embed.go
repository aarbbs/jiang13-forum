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
	spaTitleRe        = regexp.MustCompile(`(?s)<title>.*?</title>`)
	spaBrandTitleFn   func() string
	spaBrandJSONFn    func() []byte // 站点品牌 JSON，注入 window.__J13_BRANDING__
	spaBrandFaviconFn func() string // 站点 Favicon URL，注入 <link rel="icon">
)

// SetSPADocumentTitle 注册站点标题提供者，ServeSPA 会注入到入口 HTML，避免刷新闪烁
func SetSPADocumentTitle(fn func() string) {
	spaBrandTitleFn = fn
}

// SetSPABrandingJSON 注册品牌 JSON 提供者（须为合法 JSON 对象），供前端首屏同步读入
func SetSPABrandingJSON(fn func() []byte) {
	spaBrandJSONFn = fn
}

// SetSPAFaviconURL 注册 Favicon URL 提供者，注入到入口 HTML 的 <link rel="icon">
func SetSPAFaviconURL(fn func() string) {
	spaBrandFaviconFn = fn
}

// SetupEmbed 配置内嵌资源：React SPA 静态资源
func SetupEmbed(r *gin.Engine) error {
	if sub, err := fs.Sub(staticFS, "static/spa/assets"); err == nil {
		fileServer := http.StripPrefix("/assets", http.FileServer(http.FS(sub)))
		r.GET("/assets/*filepath", func(c *gin.Context) {
			// 仅 200 写 immutable，避免中间层把旧 chunk 的 404 长期缓存
			w := &cacheOnOKWriter{ResponseWriter: c.Writer, cacheControl: "public, max-age=31536000, immutable"}
			c.Writer = w
			fileServer.ServeHTTP(c.Writer, c.Request)
		})
	}

	if sub, err := fs.Sub(staticFS, "static/spa/stickers"); err == nil {
		fileServer := http.StripPrefix("/stickers", http.FileServer(http.FS(sub)))
		r.GET("/stickers/*filepath", func(c *gin.Context) {
			// stickers 不含哈希指纹，设置适中的缓存
			c.Header("Cache-Control", "public, max-age=86400")
			fileServer.ServeHTTP(c.Writer, c.Request)
		})
	}
	return nil
}

// cacheOnOKWriter 仅在最终状态码为 200 时写入长期 Cache-Control
type cacheOnOKWriter struct {
	gin.ResponseWriter
	cacheControl string
	wroteHeader  bool
}

func (w *cacheOnOKWriter) WriteHeader(code int) {
	if !w.wroteHeader {
		w.wroteHeader = true
		if code == http.StatusOK {
			w.Header().Set("Cache-Control", w.cacheControl)
		}
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *cacheOnOKWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(b)
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
	if path == "/health" || path == "/robots.txt" || path == "/sitemap.xml" {
		return false
	}
	if strings.HasPrefix(path, "/api") ||
		strings.HasPrefix(path, "/admin") ||
		strings.HasPrefix(path, "/uploads") ||
		strings.HasPrefix(path, "/media") ||
		strings.HasPrefix(path, "/assets") ||
		strings.HasPrefix(path, "/stickers") ||
		strings.HasPrefix(path, "/oauth") ||
		strings.HasPrefix(path, "/.well-known") {
		return false
	}
	return true
}

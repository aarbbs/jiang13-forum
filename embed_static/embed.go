package embed_static

import (
	"embed"
	"html/template"
	"io/fs"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

//go:embed static/*
var staticFS embed.FS

//go:embed templates/*
var templatesFS embed.FS

// SetupEmbed 配置内嵌资源：SPA 前端 + 后台 HTML 模板
func SetupEmbed(r *gin.Engine) error {
	tmpl, err := LoadTemplates()
	if err != nil {
		return err
	}
	r.SetHTMLTemplate(tmpl)

	// React SPA 构建产物（Vite）
	if sub, err := fs.Sub(staticFS, "static/spa/assets"); err == nil {
		r.GET("/assets/*filepath", gin.WrapH(http.StripPrefix("/assets", http.FileServer(http.FS(sub)))))
	}

	// 后台管理遗留静态资源
	if sub, err := fs.Sub(staticFS, "static/legacy"); err == nil {
		r.GET("/legacy/*filepath", gin.WrapH(http.StripPrefix("/legacy", http.FileServer(http.FS(sub)))))
	}

	return nil
}

// ServeSPA 返回 React SPA 入口
func ServeSPA(c *gin.Context) {
	data, err := staticFS.ReadFile("static/spa/index.html")
	if err != nil {
		c.String(http.StatusNotFound, "前端未构建，请运行: cd frontend && npm run build")
		return
	}
	c.Data(http.StatusOK, "text/html; charset=utf-8", data)
}

// IsSPARoute 判断是否应由 SPA 处理
func IsSPARoute(path string) bool {
	if strings.HasPrefix(path, "/api") ||
		strings.HasPrefix(path, "/admin") ||
		strings.HasPrefix(path, "/uploads") ||
		strings.HasPrefix(path, "/legacy") ||
		strings.HasPrefix(path, "/assets") {
		return false
	}
	return true
}

func LoadTemplates() (*template.Template, error) {
	sub, err := fs.Sub(templatesFS, "templates")
	if err != nil {
		return nil, err
	}
	tmpl := template.New("").Funcs(template.FuncMap{
		"safeHTML": func(s string) template.HTML { return template.HTML(s) },
		"add":      func(a, b int) int { return a + b },
		"sub":      func(a, b int) int { return a - b },
	})
	return tmpl.ParseFS(sub, "*.html", "admin/*.html")
}

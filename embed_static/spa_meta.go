package embed_static

import (
	"bytes"
	"encoding/json"
	"html"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// SPAPageMeta 注入到 SPA 入口 HTML 的 SEO / 社交预览元数据（仅 <head>，不写 #root，避免刷新闪屏）
type SPAPageMeta struct {
	Title       string // 完整 <title>
	Description string
	Keywords    string // meta keywords
	Canonical   string
	OGType      string // 默认 website
	OGImage     string
	SiteName    string // og:site_name
	Locale      string // og:locale，默认 zh_CN
	Robots      string // 如 noindex,nofollow
	JSONLD      string // 已序列化的 JSON-LD 对象（不含 script 标签）
	Status      int    // HTTP 状态码，0 视为 200
}

// ServeSPAWithMeta 返回带页面级 meta / JSON-LD 的干净 SPA 入口
func ServeSPAWithMeta(c *gin.Context, meta *SPAPageMeta) {
	status := http.StatusOK
	if meta != nil && meta.Status != 0 {
		status = meta.Status
	}
	data, err := staticFS.ReadFile("static/spa/index.html")
	if err != nil {
		c.String(http.StatusNotFound, "前端未构建，请运行: cd frontend && npm run build")
		return
	}
	data = applySPAPageMeta(data, meta)
	// 入口 HTML 禁止长期缓存，否则发版后仍引用旧 chunk 哈希
	c.Header("Cache-Control", "no-cache")
	c.Data(status, "text/html; charset=utf-8", data)
}

func applySPAPageMeta(data []byte, meta *SPAPageMeta) []byte {
	if meta == nil {
		meta = &SPAPageMeta{}
	}

	title := strings.TrimSpace(meta.Title)
	if title == "" && spaBrandTitleFn != nil {
		title = strings.TrimSpace(spaBrandTitleFn())
	}
	if title != "" {
		escaped := html.EscapeString(title)
		data = spaTitleRe.ReplaceAll(data, []byte("<title>"+escaped+"</title>"))
	}

	var head strings.Builder
	writeMeta(&head, "description", meta.Description)
	writeMeta(&head, "keywords", meta.Keywords)
	if canonical := strings.TrimSpace(meta.Canonical); canonical != "" {
		head.WriteString(`<link rel="canonical" href="` + html.EscapeString(canonical) + `"/>`)
	}
	robots := strings.TrimSpace(meta.Robots)
	if robots != "" {
		writeMeta(&head, "robots", robots)
	}

	ogType := strings.TrimSpace(meta.OGType)
	if ogType == "" {
		ogType = "website"
	}
	locale := strings.TrimSpace(meta.Locale)
	if locale == "" {
		locale = "zh_CN"
	}
	writeProp(&head, "og:type", ogType)
	writeProp(&head, "og:site_name", meta.SiteName)
	writeProp(&head, "og:locale", locale)
	writeProp(&head, "og:title", firstNonEmpty(meta.Title, title))
	writeProp(&head, "og:description", meta.Description)
	writeProp(&head, "og:url", meta.Canonical)
	writeProp(&head, "og:image", meta.OGImage)
	writeMetaName(&head, "twitter:card", twitterCard(meta.OGImage))
	writeMetaName(&head, "twitter:title", firstNonEmpty(meta.Title, title))
	writeMetaName(&head, "twitter:description", meta.Description)
	writeMetaName(&head, "twitter:image", meta.OGImage)

	if jsonld := strings.TrimSpace(meta.JSONLD); jsonld != "" {
		head.WriteString(`<script type="application/ld+json">`)
		head.WriteString(jsonld)
		head.WriteString(`</script>`)
	}

	// 同步注入品牌配置，避免 React 首屏用默认名闪一下
	if boot := spaBrandingBootScript(); boot != "" {
		head.WriteString(boot)
	}

	if head.Len() > 0 {
		data = bytes.Replace(data, []byte("</head>"), []byte(head.String()+"</head>"), 1)
	}

	return data
}

// spaBrandingBootScript 生成 window.__J13_BRANDING__=...; 内联脚本
func spaBrandingBootScript() string {
	if spaBrandJSONFn == nil {
		return ""
	}
	raw := bytes.TrimSpace(spaBrandJSONFn())
	if len(raw) == 0 || !json.Valid(raw) {
		return ""
	}
	// 防止 JSON 字符串中的 </script> 提前闭合标签
	safe := bytes.ReplaceAll(raw, []byte("<"), []byte(`\u003c`))
	return "<script>window.__J13_BRANDING__=" + string(safe) + ";</script>"
}

func writeMeta(b *strings.Builder, name, content string) {
	content = strings.TrimSpace(content)
	if content == "" {
		return
	}
	b.WriteString(`<meta name="` + html.EscapeString(name) + `" content="` + html.EscapeString(content) + `"/>`)
}

func writeMetaName(b *strings.Builder, name, content string) {
	writeMeta(b, name, content)
}

func writeProp(b *strings.Builder, prop, content string) {
	content = strings.TrimSpace(content)
	if content == "" {
		return
	}
	b.WriteString(`<meta property="` + html.EscapeString(prop) + `" content="` + html.EscapeString(content) + `"/>`)
}

func twitterCard(ogImage string) string {
	if strings.TrimSpace(ogImage) != "" {
		return "summary_large_image"
	}
	return "summary"
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if s := strings.TrimSpace(v); s != "" {
			return s
		}
	}
	return ""
}

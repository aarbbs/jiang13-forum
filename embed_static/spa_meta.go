package embed_static

import (
	"bytes"
	"encoding/json"
	"html"
	"net/http"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
)

var spaRootEmptyRe = regexp.MustCompile(`(?s)<div id="root">\s*</div>`)

// SPAPageMeta 注入到 SPA 入口 HTML 的 SEO / 社交预览元数据。
// 默认不写 #root；首页/板块文档 SSR 可填 RootHTML / BootJSON。
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
	RootHTML    string // 可选：写入 #root 的首屏 HTML（首页文档 SSR）
	BootJSON    []byte // 可选：window.__J13_HOME_BOOT__ 合法 JSON
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
	// 入口 HTML 禁止缓存，否则发版后仍引用旧 chunk 哈希（部分反代对 no-cache 仍会存）
	c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
	c.Header("Pragma", "no-cache")
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

	// —— 静态 SEO HTML（meta / OG / JSON-LD / favicon），紧跟 </title>，不经 JS ——
	var seo strings.Builder
	writeMeta(&seo, "description", meta.Description)
	writeMeta(&seo, "keywords", meta.Keywords)
	if canonical := strings.TrimSpace(meta.Canonical); canonical != "" {
		seo.WriteString(`<link rel="canonical" href="` + html.EscapeString(canonical) + `"/>`)
	}
	if favicon := spaFaviconHref(); favicon != "" {
		seo.WriteString(`<link rel="icon" href="` + html.EscapeString(favicon) + `"/>`)
		seo.WriteString(`<link rel="shortcut icon" href="` + html.EscapeString(favicon) + `"/>`)
	}
	robots := strings.TrimSpace(meta.Robots)
	if robots != "" {
		writeMeta(&seo, "robots", robots)
	}

	ogType := strings.TrimSpace(meta.OGType)
	if ogType == "" {
		ogType = "website"
	}
	locale := strings.TrimSpace(meta.Locale)
	if locale == "" {
		locale = "zh_CN"
	}
	writeProp(&seo, "og:type", ogType)
	writeProp(&seo, "og:site_name", meta.SiteName)
	writeProp(&seo, "og:locale", locale)
	writeProp(&seo, "og:title", firstNonEmpty(meta.Title, title))
	writeProp(&seo, "og:description", meta.Description)
	writeProp(&seo, "og:url", meta.Canonical)
	writeProp(&seo, "og:image", meta.OGImage)
	writeMetaName(&seo, "twitter:card", twitterCard(meta.OGImage))
	writeMetaName(&seo, "twitter:title", firstNonEmpty(meta.Title, title))
	writeMetaName(&seo, "twitter:description", meta.Description)
	writeMetaName(&seo, "twitter:image", meta.OGImage)

	if jsonld := strings.TrimSpace(meta.JSONLD); jsonld != "" {
		// 常规 HTML 节点；仅转义 < 防止提前闭合，不是用 JS 写入
		seo.WriteString(`<script type="application/ld+json">`)
		seo.WriteString(string(bytes.ReplaceAll([]byte(jsonld), []byte("<"), []byte(`\u003c`))))
		seo.WriteString(`</script>`)
	}

	if seo.Len() > 0 {
		data = bytes.Replace(data, []byte("</title>"), []byte("</title>\n"+seo.String()), 1)
	}

	// —— 可执行 boot 脚本仍放在 </head> 前 ——
	var boot strings.Builder
	if s := spaBrandingBootScript(); s != "" {
		boot.WriteString(s)
	}
	if s := spaHomeBootScript(meta.BootJSON); s != "" {
		boot.WriteString(s)
	}
	if boot.Len() > 0 {
		data = bytes.Replace(data, []byte("</head>"), []byte(boot.String()+"</head>"), 1)
	}

	if root := strings.TrimSpace(meta.RootHTML); root != "" {
		data = injectSPARootHTML(data, root)
	}

	return data
}

// spaHomeBootScript 生成 window.__J13_HOME_BOOT__=...; 内联脚本（前端灌缓存，非 SEO）
func spaHomeBootScript(raw []byte) string {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || !json.Valid(raw) {
		return ""
	}
	safe := bytes.ReplaceAll(raw, []byte("<"), []byte(`\u003c`))
	return "<script>window.__J13_HOME_BOOT__=" + string(safe) + ";</script>"
}

// injectSPARootHTML 将首屏 HTML 写入 #root（允许空白）
func injectSPARootHTML(data []byte, rootHTML string) []byte {
	return spaRootEmptyRe.ReplaceAll(data, []byte(`<div id="root">`+rootHTML+`</div>`))
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

// spaFaviconHref 当前站点配置的 Favicon（相对或绝对 URL）
func spaFaviconHref() string {
	if spaBrandFaviconFn == nil {
		return ""
	}
	return strings.TrimSpace(spaBrandFaviconFn())
}

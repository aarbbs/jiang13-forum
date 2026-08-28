package api

import (
	"fmt"
	"html"
	"strings"
	"time"

	"git.iioio.com/freefire/jiang13-forum/modules/seo"
	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/services"
)

// 爬虫专用伪静态 HTML（无 SPA；仅 User-Agent 命中爬虫时返回，避免用户刷新闪屏）

func renderBotHTML(meta *seo.PageMeta, bodyInner string) string {
	if meta == nil {
		meta = &seo.PageMeta{}
	}
	ogType := strings.TrimSpace(meta.OGType)
	if ogType == "" {
		ogType = "website"
	}
	locale := strings.TrimSpace(meta.Locale)
	if locale == "" {
		locale = "zh_CN"
	}
	var b strings.Builder
	b.WriteString("<!DOCTYPE html><html lang=\"zh-CN\"><head>")
	b.WriteString("<meta charset=\"UTF-8\"/>")
	b.WriteString("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"/>")
	writeEscapedTag(&b, "title", meta.Title)
	writeEscapedMeta(&b, "name", "description", meta.Description)
	writeEscapedMeta(&b, "name", "keywords", meta.Keywords)
	if meta.Robots != "" {
		writeEscapedMeta(&b, "name", "robots", meta.Robots)
	}
	if meta.Canonical != "" {
		b.WriteString(`<link rel="canonical" href="` + html.EscapeString(meta.Canonical) + `"/>`)
	}
	writeEscapedMeta(&b, "property", "og:type", ogType)
	writeEscapedMeta(&b, "property", "og:site_name", meta.SiteName)
	writeEscapedMeta(&b, "property", "og:locale", locale)
	writeEscapedMeta(&b, "property", "og:title", meta.Title)
	writeEscapedMeta(&b, "property", "og:description", meta.Description)
	writeEscapedMeta(&b, "property", "og:url", meta.Canonical)
	writeEscapedMeta(&b, "property", "og:image", meta.OGImage)
	card := "summary"
	if strings.TrimSpace(meta.OGImage) != "" {
		card = "summary_large_image"
	}
	writeEscapedMeta(&b, "name", "twitter:card", card)
	writeEscapedMeta(&b, "name", "twitter:title", meta.Title)
	writeEscapedMeta(&b, "name", "twitter:description", meta.Description)
	writeEscapedMeta(&b, "name", "twitter:image", meta.OGImage)
	if meta.JSONLD != "" {
		b.WriteString(`<script type="application/ld+json">`)
		b.WriteString(meta.JSONLD)
		b.WriteString(`</script>`)
	}
	b.WriteString(`<style>
body{font-family:system-ui,sans-serif;line-height:1.6;max-width:800px;margin:24px auto;padding:0 16px;color:#222}
a{color:#2d6a4f}img{max-width:100%;height:auto}
.meta{color:#666;font-size:14px;margin:8px 0 20px}
.nav{margin:32px 0;font-size:14px}
</style>`)
	b.WriteString("</head><body>")
	b.WriteString(bodyInner)
	b.WriteString(`<p class="nav"><a href="/">← 返回首页</a></p>`)
	b.WriteString("</body></html>")
	return b.String()
}

func writeEscapedTag(b *strings.Builder, tag, text string) {
	text = strings.TrimSpace(text)
	if text == "" {
		return
	}
	b.WriteString("<" + tag + ">" + html.EscapeString(text) + "</" + tag + ">")
}

func writeEscapedMeta(b *strings.Builder, attr, key, content string) {
	content = strings.TrimSpace(content)
	if content == "" {
		return
	}
	b.WriteString("<meta " + attr + "=\"" + html.EscapeString(key) + "\" content=\"" + html.EscapeString(content) + "\"/>")
}

func (h *Handlers) botBoardHTML(meta *seo.PageMeta, board models.Board) string {
	desc := strings.TrimSpace(board.Description)
	if desc == "" {
		desc = meta.Description
	}
	body := fmt.Sprintf(`<h1>%s</h1><p class="meta">%s</p>`,
		html.EscapeString(board.Name),
		html.EscapeString(desc),
	)
	return renderBotHTML(meta, body)
}

func (h *Handlers) botHomeHTML(meta *seo.PageMeta, brand services.SiteBranding) string {
	name := strings.TrimSpace(brand.Name)
	if name == "" {
		name = "姜十三论坛"
	}
	intro := brand.MetaDescription()
	if intro == "" {
		intro = brand.Slogan
	}
	var body strings.Builder
	body.WriteString("<h1>" + html.EscapeString(name) + "</h1>")
	if intro != "" {
		body.WriteString("<p>" + html.EscapeString(intro) + "</p>")
	}
	body.WriteString(`<p><a href="/projects">浏览项目</a></p>`)
	return renderBotHTML(meta, body.String())
}

func (h *Handlers) botPostHTML(base, siteName, defaultImage, keywords string, post *models.Post) string {
	meta := attachSiteSEO(h.postPageMeta(base, siteName, defaultImage, post), siteName, keywords)
	content := services.SanitizePostHTML(services.RedactGatedPostHTML(post.Content))
	author := services.DisplayName(&post.User)
	var body strings.Builder
	body.WriteString("<article>")
	body.WriteString("<h1>" + html.EscapeString(post.Title) + "</h1>")
	body.WriteString(`<p class="meta">`)
	body.WriteString(html.EscapeString(author))
	body.WriteString(" · ")
	body.WriteString(html.EscapeString(post.CreatedAt.Local().Format("2006-01-02 15:04")))
	if post.Board.Name != "" {
		body.WriteString(" · ")
		body.WriteString(html.EscapeString(post.Board.Name))
	}
	body.WriteString("</p>")
	body.WriteString(content)
	body.WriteString("</article>")
	return renderBotHTML(meta, body.String())
}

func (h *Handlers) botUserHTML(base, siteName, defaultImage, keywords string, user *models.User) string {
	meta := attachSiteSEO(h.userPageMeta(base, siteName, defaultImage, user), siteName, keywords)
	name := services.DisplayName(user)
	sig := strings.TrimSpace(user.Signature)
	var body strings.Builder
	body.WriteString("<h1>" + html.EscapeString(name) + " 的主页</h1>")
	if sig != "" {
		body.WriteString("<p>" + html.EscapeString(sig) + "</p>")
	}
	body.WriteString(fmt.Sprintf(`<p class="meta">加入于 %s</p>`, html.EscapeString(user.CreatedAt.Local().Format(time.DateOnly))))
	return renderBotHTML(meta, body.String())
}

func botNotFoundHTML(base, siteName, keywords, path string) string {
	meta := notFoundPageMeta(base, siteName, keywords, path)
	body := `<h1>页面不存在</h1><p>您访问的页面不存在或已删除。</p>`
	return renderBotHTML(meta, body)
}

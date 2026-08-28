package services

import (
	"html"
	"regexp"
	"strings"
)

var (
	mdImageRe = regexp.MustCompile(`!\[([^\]]*)\]\(([^)]+)\)`)
	mdLinkRe  = regexp.MustCompile(`\[([^\]]+)\]\(([^)]+)\)`)
)

// ComposeBodyToHTML 将发帖表单正文转为可消毒 HTML。
// 若已含块级 HTML / 门控标签则原样交 Sanitize；否则按纯文本/轻量 Markdown 转段落。
func ComposeBodyToHTML(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	lower := strings.ToLower(raw)
	if strings.Contains(lower, "<p") || strings.Contains(lower, "<div") ||
		strings.Contains(lower, "<h1") || strings.Contains(lower, "<ul") ||
		strings.Contains(lower, "<ol") || strings.Contains(lower, "<pre") ||
		strings.Contains(lower, "<blockquote") ||
		strings.Contains(lower, "<members-only") || strings.Contains(lower, "<reply-only") ||
		strings.Contains(lower, "<points-only") {
		return raw
	}

	// 先转义，再恢复轻量 md 图片/链接
	esc := html.EscapeString(raw)
	esc = mdImageRe.ReplaceAllStringFunc(esc, func(m string) string {
		sub := mdImageRe.FindStringSubmatch(m)
		if len(sub) != 3 {
			return m
		}
		alt, src := sub[1], sub[2]
		// 仅允许站内 uploads 或 http(s)
		if !safeComposeURL(src) {
			return m
		}
		return `<p><img src="` + html.EscapeString(src) + `" alt="` + alt + `"></p>`
	})
	esc = mdLinkRe.ReplaceAllStringFunc(esc, func(m string) string {
		sub := mdLinkRe.FindStringSubmatch(m)
		if len(sub) != 3 {
			return m
		}
		text, href := sub[1], sub[2]
		if !safeComposeURL(href) {
			return m
		}
		return `<a href="` + html.EscapeString(href) + `" rel="noopener noreferrer">` + text + `</a>`
	})

	parts := strings.Split(esc, "\n\n")
	var b strings.Builder
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		// 已是独立 img 段
		if strings.HasPrefix(p, "<p><img ") {
			b.WriteString(p)
			continue
		}
		p = strings.ReplaceAll(p, "\n", "<br>\n")
		b.WriteString("<p>")
		b.WriteString(p)
		b.WriteString("</p>\n")
	}
	return b.String()
}

func safeComposeURL(u string) bool {
	u = strings.TrimSpace(u)
	if strings.HasPrefix(u, "/uploads/") || strings.HasPrefix(u, "/media/") {
		return true
	}
	return strings.HasPrefix(u, "https://") || strings.HasPrefix(u, "http://")
}

// HTMLToComposePlain 编辑页回显：去掉简单标签便于 textarea 编辑（尽力而为）
func HTMLToComposePlain(htmlBody string) string {
	s := strings.TrimSpace(htmlBody)
	if s == "" {
		return ""
	}
	lower := strings.ToLower(s)
	// 含门控块时保留 HTML，避免编辑丢失
	if strings.Contains(lower, "<members-only") || strings.Contains(lower, "<reply-only") ||
		strings.Contains(lower, "<points-only") {
		return s
	}
	// img → markdown
	imgRe := regexp.MustCompile(`(?i)<img[^>]+src="([^"]+)"[^>]*>`)
	s = imgRe.ReplaceAllString(s, "![]($1)")
	s = regexp.MustCompile(`(?i)</p>\s*<p>`).ReplaceAllString(s, "\n\n")
	s = regexp.MustCompile(`(?i)<br\s*/?>`).ReplaceAllString(s, "\n")
	s = regexp.MustCompile(`(?i)</?p[^>]*>`).ReplaceAllString(s, "")
	s = regexp.MustCompile(`(?i)<[^>]+>`).ReplaceAllString(s, "")
	return strings.TrimSpace(html.UnescapeString(s))
}

package services

import (
	"html"
	"regexp"
	"strings"
)

var (
	mdImageRe      = regexp.MustCompile(`!\[([^\]]*)\]\(([^)]+)\)`)
	mdLinkRe       = regexp.MustCompile(`\[([^\]]+)\]\(([^)]+)\)`)
	mdBoldRe       = regexp.MustCompile(`\*\*([^*]+)\*\*`)
	mdStrikeRe     = regexp.MustCompile(`~~([^~]+)~~`)
	mdItalicRe     = regexp.MustCompile(`\*([^*\n]+)\*`)
	mdInlineCodeRe = regexp.MustCompile("`([^`\n]+)`")
	mdLangRe       = regexp.MustCompile(`^[a-zA-Z0-9_+-]+$`)
)

// ComposeBodyToHTML 将发帖/评论表单正文转为可消毒 HTML。
// 若已含块级 HTML / 门控标签则原样交 Sanitize；否则按轻量 Markdown 转换。
func ComposeBodyToHTML(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if looksLikeRichHTML(raw) {
		return raw
	}
	return mdDocumentToHTML(raw)
}

func looksLikeRichHTML(raw string) bool {
	lower := strings.ToLower(raw)
	markers := []string{
		"<p", "<div", "<h1", "<h2", "<h3", "<ul", "<ol", "<pre", "<blockquote",
		"<table", "<members-only", "<reply-only", "<points-only",
	}
	for _, m := range markers {
		if strings.Contains(lower, m) {
			return true
		}
	}
	return false
}

func mdDocumentToHTML(raw string) string {
	lines := strings.Split(strings.ReplaceAll(raw, "\r\n", "\n"), "\n")
	var b strings.Builder
	i := 0
	for i < len(lines) {
		line := lines[i]
		trim := strings.TrimSpace(line)

		// 围栏代码块
		if strings.HasPrefix(trim, "```") {
			lang := strings.TrimSpace(strings.TrimPrefix(trim, "```"))
			lang = strings.TrimSpace(strings.Split(lang, " ")[0])
			i++
			var code []string
			for i < len(lines) {
				if strings.TrimSpace(lines[i]) == "```" {
					i++
					break
				}
				code = append(code, lines[i])
				i++
			}
			b.WriteString("<pre><code")
			if lang != "" && mdLangRe.MatchString(lang) {
				b.WriteString(` class="language-`)
				b.WriteString(html.EscapeString(lang))
				b.WriteString(`"`)
			}
			b.WriteString(">")
			b.WriteString(html.EscapeString(strings.Join(code, "\n")))
			b.WriteString("</code></pre>\n")
			continue
		}

		// 空行跳过
		if trim == "" {
			i++
			continue
		}

		// 标题：#–###### → h2–h6（禁止 h1）
		if level, title, ok := parseMDHeading(trim); ok {
			b.WriteString("<h")
			b.WriteString(string(rune('0' + level)))
			b.WriteString(">")
			b.WriteString(mdInlineToHTML(title))
			b.WriteString("</h")
			b.WriteString(string(rune('0' + level)))
			b.WriteString(">\n")
			i++
			continue
		}

		// 引用
		if strings.HasPrefix(trim, "> ") || trim == ">" {
			var quote []string
			for i < len(lines) {
				t := strings.TrimSpace(lines[i])
				if t == ">" {
					quote = append(quote, "")
					i++
					continue
				}
				if strings.HasPrefix(t, "> ") {
					quote = append(quote, strings.TrimPrefix(t, "> "))
					i++
					continue
				}
				break
			}
			b.WriteString("<blockquote><p>")
			b.WriteString(mdInlineToHTML(strings.Join(quote, "<br>\n")))
			b.WriteString("</p></blockquote>\n")
			continue
		}

		// 无序列表
		if isMDUL(trim) {
			b.WriteString("<ul>\n")
			for i < len(lines) {
				t := strings.TrimSpace(lines[i])
				if !isMDUL(t) {
					break
				}
				item := strings.TrimSpace(t[1:])
				if strings.HasPrefix(t, "- ") || strings.HasPrefix(t, "* ") || strings.HasPrefix(t, "+ ") {
					item = strings.TrimSpace(t[2:])
				}
				b.WriteString("<li>")
				b.WriteString(mdInlineToHTML(item))
				b.WriteString("</li>\n")
				i++
			}
			b.WriteString("</ul>\n")
			continue
		}

		// 有序列表
		if isMDOL(trim) {
			b.WriteString("<ol>\n")
			for i < len(lines) {
				t := strings.TrimSpace(lines[i])
				if !isMDOL(t) {
					break
				}
				idx := strings.Index(t, ". ")
				item := strings.TrimSpace(t[idx+2:])
				b.WriteString("<li>")
				b.WriteString(mdInlineToHTML(item))
				b.WriteString("</li>\n")
				i++
			}
			b.WriteString("</ol>\n")
			continue
		}

		// 普通段落（连续非空、非特殊行）
		var para []string
		for i < len(lines) {
			t := strings.TrimSpace(lines[i])
			if t == "" || strings.HasPrefix(t, "```") || isMDUL(t) || isMDOL(t) ||
				strings.HasPrefix(t, "> ") || t == ">" {
				break
			}
			if _, _, ok := parseMDHeading(t); ok {
				break
			}
			para = append(para, lines[i])
			i++
		}
		joined := strings.Join(para, "\n")
		// 整段已是图片行则单独输出
		if m := mdImageRe.FindStringSubmatch(strings.TrimSpace(joined)); len(m) == 3 && strings.TrimSpace(joined) == m[0] && safeComposeURL(m[2]) {
			b.WriteString(`<p><img src="`)
			b.WriteString(html.EscapeString(m[2]))
			b.WriteString(`" alt="`)
			b.WriteString(m[1])
			b.WriteString(`"></p>` + "\n")
			continue
		}
		b.WriteString("<p>")
		b.WriteString(mdInlineToHTML(strings.ReplaceAll(joined, "\n", "<br>\n")))
		b.WriteString("</p>\n")
	}
	return b.String()
}

func parseMDHeading(trim string) (level int, title string, ok bool) {
	n := 0
	for n < len(trim) && trim[n] == '#' {
		n++
	}
	if n < 1 || n > 6 {
		return 0, "", false
	}
	if n >= len(trim) || trim[n] != ' ' {
		return 0, "", false
	}
	title = strings.TrimSpace(trim[n+1:])
	if title == "" {
		return 0, "", false
	}
	level = n
	if level == 1 {
		level = 2 // 帖正文禁止 h1
	}
	return level, title, true
}

func isMDUL(trim string) bool {
	return strings.HasPrefix(trim, "- ") || strings.HasPrefix(trim, "* ") || strings.HasPrefix(trim, "+ ")
}

var mdOLRe = regexp.MustCompile(`^\d+\. `)

func isMDOL(trim string) bool {
	return mdOLRe.MatchString(trim)
}

func mdInlineToHTML(s string) string {
	// 先抽出行内代码，避免其它规则干扰
	type ph struct{ key, html string }
	var phs []ph
	s = mdInlineCodeRe.ReplaceAllStringFunc(s, func(m string) string {
		sub := mdInlineCodeRe.FindStringSubmatch(m)
		if len(sub) != 2 {
			return m
		}
		key := "\x00CODE" + string(rune('A'+len(phs))) + "\x00"
		phs = append(phs, ph{key: key, html: "<code>" + html.EscapeString(sub[1]) + "</code>"})
		return key
	})

	s = html.EscapeString(s)
	// 占位符被 escape 了，还原 key
	for i := range phs {
		escKey := html.EscapeString(phs[i].key)
		s = strings.ReplaceAll(s, escKey, phs[i].key)
	}

	s = mdImageRe.ReplaceAllStringFunc(s, func(m string) string {
		sub := mdImageRe.FindStringSubmatch(m)
		if len(sub) != 3 || !safeComposeURL(sub[2]) {
			return m
		}
		return `<img src="` + html.EscapeString(sub[2]) + `" alt="` + sub[1] + `">`
	})
	s = mdLinkRe.ReplaceAllStringFunc(s, func(m string) string {
		sub := mdLinkRe.FindStringSubmatch(m)
		if len(sub) != 3 || !safeComposeURL(sub[2]) {
			return m
		}
		return `<a href="` + html.EscapeString(sub[2]) + `" rel="noopener noreferrer">` + sub[1] + `</a>`
	})
	s = mdBoldRe.ReplaceAllString(s, `<strong>$1</strong>`)
	s = mdStrikeRe.ReplaceAllString(s, `<s>$1</s>`)
	s = mdItalicRe.ReplaceAllString(s, `<em>$1</em>`)

	for _, p := range phs {
		s = strings.ReplaceAll(s, p.key, p.html)
	}
	return s
}

func safeComposeURL(u string) bool {
	u = strings.TrimSpace(u)
	if strings.HasPrefix(u, "/uploads/") || strings.HasPrefix(u, "/media/") {
		return true
	}
	return strings.HasPrefix(u, "https://") || strings.HasPrefix(u, "http://")
}

// HTMLToComposePlain 编辑页回显：尽力还原为 Markdown / 纯文本；含门控时保留 HTML。
func HTMLToComposePlain(htmlBody string) string {
	s := strings.TrimSpace(htmlBody)
	if s == "" {
		return ""
	}
	lower := strings.ToLower(s)
	if strings.Contains(lower, "<members-only") || strings.Contains(lower, "<reply-only") ||
		strings.Contains(lower, "<points-only") {
		return s
	}

	// 代码块
	s = regexp.MustCompile(`(?is)<pre[^>]*>\s*<code(?:\s+class="language-([^"]*)")?[^>]*>([\s\S]*?)</code>\s*</pre>`).ReplaceAllStringFunc(s, func(m string) string {
		sub := regexp.MustCompile(`(?is)<pre[^>]*>\s*<code(?:\s+class="language-([^"]*)")?[^>]*>([\s\S]*?)</code>\s*</pre>`).FindStringSubmatch(m)
		if len(sub) != 3 {
			return m
		}
		lang, body := sub[1], html.UnescapeString(sub[2])
		return "```" + lang + "\n" + body + "\n```\n\n"
	})

	s = regexp.MustCompile(`(?i)<h([2-6])[^>]*>([\s\S]*?)</h[2-6]>`).ReplaceAllStringFunc(s, func(m string) string {
		sub := regexp.MustCompile(`(?i)<h([2-6])[^>]*>([\s\S]*?)</h[2-6]>`).FindStringSubmatch(m)
		if len(sub) != 3 {
			return m
		}
		level := sub[1][0] - '0'
		inner := stripTagsKeepText(sub[2])
		return strings.Repeat("#", int(level)) + " " + inner + "\n\n"
	})

	s = regexp.MustCompile(`(?i)<li[^>]*>([\s\S]*?)</li>`).ReplaceAllString(s, "- $1\n")
	s = regexp.MustCompile(`(?i)</?[uo]l[^>]*>`).ReplaceAllString(s, "\n")
	s = regexp.MustCompile(`(?i)<blockquote[^>]*>([\s\S]*?)</blockquote>`).ReplaceAllStringFunc(s, func(m string) string {
		sub := regexp.MustCompile(`(?i)<blockquote[^>]*>([\s\S]*?)</blockquote>`).FindStringSubmatch(m)
		if len(sub) != 2 {
			return m
		}
		inner := stripTagsKeepText(sub[1])
		lines := strings.Split(inner, "\n")
		for i := range lines {
			lines[i] = "> " + strings.TrimSpace(lines[i])
		}
		return strings.Join(lines, "\n") + "\n\n"
	})

	s = regexp.MustCompile(`(?i)<strong[^>]*>([\s\S]*?)</strong>`).ReplaceAllString(s, "**$1**")
	s = regexp.MustCompile(`(?i)<b[^>]*>([\s\S]*?)</b>`).ReplaceAllString(s, "**$1**")
	s = regexp.MustCompile(`(?i)<em[^>]*>([\s\S]*?)</em>`).ReplaceAllString(s, "*$1*")
	s = regexp.MustCompile(`(?i)<i[^>]*>([\s\S]*?)</i>`).ReplaceAllString(s, "*$1*")
	s = regexp.MustCompile(`(?i)<s[^>]*>([\s\S]*?)</s>`).ReplaceAllString(s, "~~$1~~")
	s = regexp.MustCompile(`(?i)<del[^>]*>([\s\S]*?)</del>`).ReplaceAllString(s, "~~$1~~")
	s = regexp.MustCompile(`(?i)<code[^>]*>([\s\S]*?)</code>`).ReplaceAllString(s, "`$1`")
	s = regexp.MustCompile(`(?i)<img[^>]+src="([^"]+)"[^>]*>`).ReplaceAllString(s, "![]($1)")
	s = regexp.MustCompile(`(?i)<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)</a>`).ReplaceAllString(s, "[$2]($1)")
	s = regexp.MustCompile(`(?i)</p>\s*<p>`).ReplaceAllString(s, "\n\n")
	s = regexp.MustCompile(`(?i)<br\s*/?>`).ReplaceAllString(s, "\n")
	s = regexp.MustCompile(`(?i)</?p[^>]*>`).ReplaceAllString(s, "")
	s = regexp.MustCompile(`(?i)<[^>]+>`).ReplaceAllString(s, "")
	return strings.TrimSpace(html.UnescapeString(s))
}

func stripTagsKeepText(s string) string {
	s = regexp.MustCompile(`(?i)<br\s*/?>`).ReplaceAllString(s, "\n")
	s = regexp.MustCompile(`(?i)<[^>]+>`).ReplaceAllString(s, "")
	return strings.TrimSpace(html.UnescapeString(s))
}

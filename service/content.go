package service

import (
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

var (
	membersOnlyBlockRe = regexp.MustCompile(`(?is)<members-only\b[^>]*>([\s\S]*?)</members-only>`)
	// style/script 内文本不能进搜索/摘要，否则会出现 "* {color:red}" 之类噪声
	styleOrScriptRe = regexp.MustCompile(`(?is)<(style|script)\b[^>]*>[\s\S]*?</(style|script)>`)
	htmlTagRe       = regexp.MustCompile(`<[^>]+>`)
)

// RedactMembersOnlyHTML 未登录时移除会员专属区块内的正文，保留长度提示供前端展示
func RedactMembersOnlyHTML(html string) string {
	if html == "" {
		return html
	}
	return membersOnlyBlockRe.ReplaceAllStringFunc(html, func(full string) string {
		m := membersOnlyBlockRe.FindStringSubmatch(full)
		inner := ""
		if len(m) > 1 {
			inner = m[1]
		}
		length := membersContentLength(inner)
		return `<members-only data-locked="true" data-length="` + strconv.Itoa(length) + `"></members-only>`
	})
}

func membersContentLength(html string) int {
	text := strings.TrimSpace(htmlTagRe.ReplaceAllString(html, ""))
	if text == "" {
		return 0
	}
	return utf8.RuneCountInString(text)
}

// StripHTMLForSearch 剥离 HTML 标签，生成用于全文搜索的纯文本
func StripHTMLForSearch(html string) string {
	if html == "" {
		return ""
	}
	html = styleOrScriptRe.ReplaceAllString(html, " ")
	text := htmlTagRe.ReplaceAllString(html, " ")
	text = strings.ReplaceAll(text, "&nbsp;", " ")
	return strings.Join(strings.Fields(text), " ")
}

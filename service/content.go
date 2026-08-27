package service

import (
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

var (
	membersOnlyBlockRe = regexp.MustCompile(`(?is)<members-only\b[^>]*>([\s\S]*?)</members-only>`)
	replyOnlyBlockRe   = regexp.MustCompile(`(?is)<reply-only\b[^>]*>([\s\S]*?)</reply-only>`)
	pointsOnlyUnwrapRe = regexp.MustCompile(`(?is)<points-only\b[^>]*>([\s\S]*?)</points-only>`)
	// style/script 内文本不能进搜索/摘要，否则会出现 "* {color:red}" 之类噪声
	styleOrScriptRe = regexp.MustCompile(`(?is)<(style|script)\b[^>]*>[\s\S]*?</(style|script)>`)
	htmlTagRe       = regexp.MustCompile(`<[^>]+>`)
)

// UnwrapContentGateTags 剥离登录/回复/积分可见外壳，保留内部正文（单页等场景禁用门控）
func UnwrapContentGateTags(html string) string {
	if html == "" {
		return html
	}
	html = membersOnlyBlockRe.ReplaceAllString(html, "$1")
	html = replyOnlyBlockRe.ReplaceAllString(html, "$1")
	html = pointsOnlyUnwrapRe.ReplaceAllString(html, "$1")
	return html
}

// RedactMembersOnlyHTML 未登录时移除会员专属区块内的正文，保留长度提示供前端展示
func RedactMembersOnlyHTML(html string) string {
	return redactGatedBlocks(html, membersOnlyBlockRe, "members-only")
}

// RedactReplyOnlyHTML 未回复时移除「回复可见」区块内的正文，保留长度提示供前端展示
func RedactReplyOnlyHTML(html string) string {
	return redactGatedBlocks(html, replyOnlyBlockRe, "reply-only")
}

// RedactGatedPostHTML 搜索/SEO 等场景：同时遮盖登录可见、回复可见与积分解锁正文
func RedactGatedPostHTML(html string) string {
	return RedactPointsOnlyHTML(RedactReplyOnlyHTML(RedactMembersOnlyHTML(html)), nil)
}

func redactGatedBlocks(html string, re *regexp.Regexp, tag string) string {
	if html == "" {
		return html
	}
	return re.ReplaceAllStringFunc(html, func(full string) string {
		m := re.FindStringSubmatch(full)
		inner := ""
		if len(m) > 1 {
			inner = m[1]
		}
		length := gatedContentLength(inner)
		gate := "login"
		if tag == "reply-only" {
			gate = "reply"
		}
		return `<` + tag + ` data-gate="` + gate + `" data-locked="true" data-length="` + strconv.Itoa(length) + `"></` + tag + `>`
	})
}

func gatedContentLength(html string) int {
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

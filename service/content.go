package service

import (
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

var (
	membersOnlyBlockRe = regexp.MustCompile(`(?is)<members-only\b[^>]*>([\s\S]*?)</members-only>`)
	htmlTagRe          = regexp.MustCompile(`<[^>]+>`)
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

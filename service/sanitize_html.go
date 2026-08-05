package service

import (
	"sync"

	"github.com/microcosm-cc/bluemonday"
)

var (
	postHTMLPolicyOnce sync.Once
	postHTMLPolicy     *bluemonday.Policy
)

// postContentHTMLPolicy 帖子正文白名单：对齐前端编辑器产出，禁止 style/script 等泄漏或执行向量。
func postContentHTMLPolicy() *bluemonday.Policy {
	postHTMLPolicyOnce.Do(func() {
		p := bluemonday.UGCPolicy()

		// TipTap / Markdown 转换会用到的结构
		p.AllowElements("div", "span", "u", "s", "center", "members-only", "reply-only")
		p.AllowAttrs("class").OnElements(
			"p", "div", "span", "pre", "code", "img", "a",
			"h1", "h2", "h3", "h4", "h5", "h6",
			"blockquote", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td",
			"members-only", "reply-only",
		)
		p.AllowAttrs("colspan", "rowspan").OnElements("th", "td")
		p.AllowAttrs(
			"data-locked", "data-length", "data-gate",
			"data-code-copy", "data-code-fold", "data-lang", "data-full",
			"data-code-style", "data-line-numbers", "data-collapsed",
			"data-line-count", "data-lineno-digits",
			"data-image-group", "data-layout", "data-display",
			"data-clear-float",
		).Globally()
		p.AllowAttrs("target", "rel").OnElements("a")
		// bluemonday 默认会剥 style 标签与 style 属性；此处不再放行

		postHTMLPolicy = p
	})
	return postHTMLPolicy
}

// SanitizePostHTML 清洗帖子 HTML，防止 <style> 等污染整页或脚本注入。
func SanitizePostHTML(html string) string {
	if html == "" {
		return ""
	}
	return postContentHTMLPolicy().Sanitize(html)
}

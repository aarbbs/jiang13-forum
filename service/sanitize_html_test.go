package service

import (
	"strings"
	"testing"
)

func TestSanitizePostHTML_StripsStyleLeak(t *testing.T) {
	in := "<center>你好</center>\n<style>\n* {color:red}\n</style>"
	out := SanitizePostHTML(in)
	if strings.Contains(strings.ToLower(out), "<style") {
		t.Fatalf("应剥离 style 标签，得到: %q", out)
	}
	if strings.Contains(out, "color:red") {
		t.Fatalf("不应保留 CSS 文本，得到: %q", out)
	}
	if !strings.Contains(out, "你好") {
		t.Fatalf("应保留正文，得到: %q", out)
	}
}

func TestSanitizePostHTML_StripsInlineStyleAndScript(t *testing.T) {
	in := `<p style="color:red">段落</p><script>alert(1)</script><img src="/uploads/posts/a.jpg" data-display="wide" class="article-img">`
	out := SanitizePostHTML(in)
	if strings.Contains(strings.ToLower(out), "style=") {
		t.Fatalf("应剥离 style 属性，得到: %q", out)
	}
	if strings.Contains(strings.ToLower(out), "<script") {
		t.Fatalf("应剥离 script，得到: %q", out)
	}
	if !strings.Contains(out, "data-display") {
		t.Fatalf("应保留 data-display，得到: %q", out)
	}
}

func TestSanitizePostHTML_KeepsMembersOnlyAndImageGroup(t *testing.T) {
	in := `<members-only data-gate="login"><p>密</p></members-only>` +
		`<reply-only data-gate="reply"><p>回复可见</p></reply-only>` +
		`<div data-image-group data-layout="cols-2" class="image-group"><img src="/uploads/posts/a.jpg" alt="x"></div>` +
		`<p data-clear-float class="article-clear-float">清浮动</p>`
	out := SanitizePostHTML(in)
	for _, want := range []string{"members-only", "reply-only", "data-gate", "回复可见", "data-image-group", "data-layout", "data-clear-float", "清浮动"} {
		if !strings.Contains(out, want) {
			t.Fatalf("缺少 %q，得到: %q", want, out)
		}
	}
}

func TestStripHTMLForSearch_DropsStyleText(t *testing.T) {
	in := "<center>你好</center><style>* {color:red}</style>"
	out := StripHTMLForSearch(in)
	if strings.Contains(out, "color") || strings.Contains(out, "red") {
		t.Fatalf("摘要不应含 CSS，得到: %q", out)
	}
	if out != "你好" {
		t.Fatalf("期望 %q，得到 %q", "你好", out)
	}
}

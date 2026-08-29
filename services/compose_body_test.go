package services

import (
	"strings"
	"testing"
)

func TestComposeBodyToHTML_MarkdownBasics(t *testing.T) {
	in := strings.TrimSpace(`
## 标题

段落 **粗体** 与 *斜体* 和 ~~删除~~ 与 ` + "`code`" + `。

- 甲
- 乙

1. 一
2. 二

> 引用行

` + "```go\nfmt.Println(1)\n```" + `

[链接](https://example.com)
![图](/uploads/a.png)
`)
	out := ComposeBodyToHTML(in)
	checks := []string{
		"<h2>", "标题", "</h2>",
		"<strong>粗体</strong>",
		"<em>斜体</em>",
		"<s>删除</s>",
		"<code>code</code>",
		"<ul>", "<li>",
		"<ol>",
		"<blockquote>",
		`class="language-go"`,
		"fmt.Println(1)",
		`href="https://example.com"`,
		`src="/uploads/a.png"`,
	}
	for _, c := range checks {
		if !strings.Contains(out, c) {
			t.Fatalf("missing %q in:\n%s", c, out)
		}
	}
	if strings.Contains(out, "<h1>") {
		t.Fatal("must not emit h1")
	}
}

func TestComposeBodyToHTML_PassThroughGates(t *testing.T) {
	in := `<members-only data-gate="login"><p>隐</p></members-only>`
	if got := ComposeBodyToHTML(in); got != in {
		t.Fatalf("gate html should pass through, got %q", got)
	}
}

func TestComposeBodyToHTML_H1MapsToH2(t *testing.T) {
	out := ComposeBodyToHTML("# 顶标题")
	if !strings.Contains(out, "<h2>") || strings.Contains(out, "<h1>") {
		t.Fatalf("got %s", out)
	}
}

func TestHTMLToComposePlain_RoundTripLite(t *testing.T) {
	html := ComposeBodyToHTML("## Hi\n\n**x**")
	plain := HTMLToComposePlain(html)
	if !strings.Contains(plain, "## Hi") || !strings.Contains(plain, "**x**") {
		t.Fatalf("plain=%q", plain)
	}
}

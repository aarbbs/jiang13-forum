package services

import (
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestPageContainsLinkToHost(t *testing.T) {
	our, err := url.Parse("https://forum.example.com")
	if err != nil {
		t.Fatal(err)
	}
	page := "https://friend.example/links.html"
	host := "forum.example.com"

	if !pageContainsLinkToHost(`<a href="https://forum.example.com/">本站</a>`, page, our, host) {
		t.Fatal("应检测到绝对回链")
	}
	if pageContainsLinkToHost(`<a href="https://other.example/">其他</a>`, page, our, host) {
		t.Fatal("不应把外站当成回链")
	}
}

func TestPageContainsLinkToHost_LargeHTMLFast(t *testing.T) {
	our, err := url.Parse("https://forum.example.com")
	if err != nil {
		t.Fatal(err)
	}
	var b strings.Builder
	b.Grow(512 * 1024)
	for b.Len() < 400*1024 {
		b.WriteString(`<a href="https://noise.example/page">x</a>`)
	}
	b.WriteString(`<a href="https://forum.example.com/">本站</a>`)
	html := b.String()

	start := time.Now()
	if !pageContainsLinkToHost(html, "https://friend.example/", our, "forum.example.com") {
		t.Fatal("应在大量无关链接中找到回链")
	}
	if elapsed := time.Since(start); elapsed > 500*time.Millisecond {
		t.Fatalf("解析耗时过长: %s", elapsed)
	}
}

package service

import (
	"strings"
	"testing"
)

func TestNormalizeCountryCode(t *testing.T) {
	if normalizeCountryCode("cn") != "CN" {
		t.Fatal("expected CN")
	}
	if normalizeCountryCode("XX") != "" {
		t.Fatal("XX should be empty")
	}
	if normalizeCountryCode("USA") != "" {
		t.Fatal("USA should be empty")
	}
}

func TestShouldSkipDefaults(t *testing.T) {
	rules := DefaultMonitorExcludeRules()
	for _, path := range []string{
		"/health", "/uploads/a.png", "/api/admin/monitor/overview",
		"/assets/app.js", "/admin", "/admin/dashboard", "/api/me", "/api/site-branding",
	} {
		skip := false
		lower := strings.ToLower(path)
		for _, rule := range rules {
			r := strings.ToLower(strings.TrimSpace(rule))
			if r == "" {
				continue
			}
			if strings.HasPrefix(r, ".") {
				if strings.HasSuffix(lower, r) {
					skip = true
					break
				}
				continue
			}
			if strings.HasPrefix(lower, r) || lower == strings.TrimSuffix(r, "/") {
				skip = true
				break
			}
		}
		if !skip {
			t.Fatalf("expected skip for %s", path)
		}
	}
}

func TestNormalizePageViewPath(t *testing.T) {
	cases := []struct {
		in   string
		ok   bool
		want string
	}{
		{"/", true, "/"},
		{"/post/1", true, "/post/1"},
		{"/post/1?x=1", true, "/post/1?x=1"},
		{"/admin", false, ""},
		{"/admin/dashboard", false, ""},
		{"/login", false, ""},
		{"/api/posts", false, ""},
		{"https://evil.com/", false, ""},
		{"", false, ""},
	}
	for _, c := range cases {
		got, ok := NormalizePageViewPath(c.in)
		if ok != c.ok || got != c.want {
			t.Fatalf("NormalizePageViewPath(%q)=(%q,%v) want (%q,%v)", c.in, got, ok, c.want, c.ok)
		}
	}
}

func TestClassifyUA(t *testing.T) {
	if classifyUA("Mozilla/5.0 Chrome/120", "browser") != "Chrome" {
		t.Fatal("browser")
	}
	if classifyUA("Mozilla/5.0 (Windows NT 10.0)", "os") != "Windows" {
		t.Fatal("os")
	}
	if classifyUA("iPhone", "device") != "Mobile" {
		t.Fatal("device")
	}
}

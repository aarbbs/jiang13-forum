package service

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

const (
	SettingPermalinkEnabled = "permalink_enabled"
	SettingPermalinkExt     = "permalink_ext"
	DefaultPermalinkExt     = "html"
)

var (
	permalinkExtRe = regexp.MustCompile(`(?i)^[a-z0-9]{1,16}$`)
	slugPermalinkRe = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$`)
	// /post/123 或 /post/123.html
	postPermalinkRe = regexp.MustCompile(`^/post/(\d+)(?:\.([A-Za-z0-9]{1,16}))?/?$`)
	userPermalinkRe = regexp.MustCompile(`^/user/(\d+)(?:\.([A-Za-z0-9]{1,16}))?/?$`)
	boardPermalinkRe = regexp.MustCompile(`^/board/(\d+)(?:\.([A-Za-z0-9]{1,16}))?/?$`)
	pagePermalinkRe  = regexp.MustCompile(`^/page/([a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9])(?:\.([A-Za-z0-9]{1,16}))?/?$`)
)

// PermalinkConfig 伪静态（固定链接）配置
type PermalinkConfig struct {
	Enabled bool   `json:"permalink_enabled"`
	Ext     string `json:"permalink_ext"` // 不含点，如 html / htm
}

// NormalizePermalinkExt 规范化后缀：去点、小写、仅字母数字
func NormalizePermalinkExt(raw string) (string, bool) {
	ext := strings.TrimSpace(raw)
	ext = strings.TrimPrefix(ext, ".")
	ext = strings.ToLower(ext)
	if ext == "" {
		ext = DefaultPermalinkExt
	}
	if !permalinkExtRe.MatchString(ext) {
		return "", false
	}
	return ext, true
}

// Permalink 读取伪静态配置
func (s *ForumSettingsService) Permalink() PermalinkConfig {
	ext, ok := NormalizePermalinkExt(s.getString(SettingPermalinkExt, DefaultPermalinkExt))
	if !ok {
		ext = DefaultPermalinkExt
	}
	return PermalinkConfig{
		Enabled: s.getString(SettingPermalinkEnabled, "0") == "1",
		Ext:     ext,
	}
}

// Suffix 返回带点后缀（未启用时为空）
func (p PermalinkConfig) Suffix() string {
	if !p.Enabled {
		return ""
	}
	ext, ok := NormalizePermalinkExt(p.Ext)
	if !ok {
		ext = DefaultPermalinkExt
	}
	return "." + ext
}

// PostPath 帖子规范路径
func (p PermalinkConfig) PostPath(id uint) string {
	return fmt.Sprintf("/post/%d%s", id, p.Suffix())
}

// UserPath 用户规范路径
func (p PermalinkConfig) UserPath(id uint) string {
	return fmt.Sprintf("/user/%d%s", id, p.Suffix())
}

// BoardPath 板块规范路径
func (p PermalinkConfig) BoardPath(id uint) string {
	return fmt.Sprintf("/board/%d%s", id, p.Suffix())
}

// PagePath 自定义单页规范路径
func (p PermalinkConfig) PagePath(slug string) string {
	slug = strings.TrimSpace(strings.ToLower(slug))
	if slug == "" {
		return "/"
	}
	return fmt.Sprintf("/page/%s%s", slug, p.Suffix())
}

// NormalizePageSlug 校验单页 slug
func NormalizePageSlug(raw string) (string, bool) {
	slug := strings.TrimSpace(strings.ToLower(raw))
	if slug == "" || len(slug) > 64 {
		return "", false
	}
	if !slugPermalinkRe.MatchString(slug) {
		return "", false
	}
	return slug, true
}

// PermalinkMatch 路径解析结果
type PermalinkMatch struct {
	ID        uint
	Ext       string // 请求里的后缀（无点）；无后缀为空
	Canonical string // 当前配置下的规范路径
	OK        bool
}

// MatchPostPath 解析帖子公开路径（不含 /edit）
func (p PermalinkConfig) MatchPostPath(path string) PermalinkMatch {
	m := postPermalinkRe.FindStringSubmatch(path)
	if len(m) < 2 {
		return PermalinkMatch{}
	}
	id64, err := strconv.ParseUint(m[1], 10, 64)
	if err != nil || id64 == 0 {
		return PermalinkMatch{}
	}
	ext := ""
	if len(m) > 2 {
		ext = strings.ToLower(m[2])
	}
	id := uint(id64)
	return PermalinkMatch{
		ID:        id,
		Ext:       ext,
		Canonical: p.PostPath(id),
		OK:        true,
	}
}

// MatchBoardPath 解析板块公开路径
func (p PermalinkConfig) MatchBoardPath(path string) PermalinkMatch {
	m := boardPermalinkRe.FindStringSubmatch(path)
	if len(m) < 2 {
		return PermalinkMatch{}
	}
	id64, err := strconv.ParseUint(m[1], 10, 64)
	if err != nil || id64 == 0 {
		return PermalinkMatch{}
	}
	ext := ""
	if len(m) > 2 {
		ext = strings.ToLower(m[2])
	}
	id := uint(id64)
	return PermalinkMatch{
		ID:        id,
		Ext:       ext,
		Canonical: p.BoardPath(id),
		OK:        true,
	}
}

// PagePermalinkMatch slug 型路径解析结果
type PagePermalinkMatch struct {
	Slug      string
	Ext       string
	Canonical string
	OK        bool
}

// MatchPagePath 解析自定义单页路径
func (p PermalinkConfig) MatchPagePath(path string) PagePermalinkMatch {
	m := pagePermalinkRe.FindStringSubmatch(path)
	if len(m) < 2 {
		return PagePermalinkMatch{}
	}
	slug := strings.ToLower(m[1])
	ext := ""
	if len(m) > 2 {
		ext = strings.ToLower(m[2])
	}
	return PagePermalinkMatch{
		Slug:      slug,
		Ext:       ext,
		Canonical: p.PagePath(slug),
		OK:        true,
	}
}

// MatchUserPath 解析用户公开路径
func (p PermalinkConfig) MatchUserPath(path string) PermalinkMatch {
	m := userPermalinkRe.FindStringSubmatch(path)
	if len(m) < 2 {
		return PermalinkMatch{}
	}
	id64, err := strconv.ParseUint(m[1], 10, 64)
	if err != nil || id64 == 0 {
		return PermalinkMatch{}
	}
	ext := ""
	if len(m) > 2 {
		ext = strings.ToLower(m[2])
	}
	id := uint(id64)
	return PermalinkMatch{
		ID:        id,
		Ext:       ext,
		Canonical: p.UserPath(id),
		OK:        true,
	}
}

// NeedsCanonicalRedirect 当前请求路径是否应 301 到规范 URL
func (m PermalinkMatch) NeedsCanonicalRedirect(requestPath string) bool {
	if !m.OK {
		return false
	}
	// 去掉末尾 / 再比
	req := strings.TrimSuffix(requestPath, "/")
	can := strings.TrimSuffix(m.Canonical, "/")
	return req != can
}

package service

import (
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"git.iioio.com/freefire/jiang13-forum/model"
)

var (
	imgSrcRe = regexp.MustCompile(`(?i)<img[^>]+src=["']([^"']+)["']`)
)

// SitemapURL 站点地图条目
type SitemapURL struct {
	Loc        string
	LastMod    time.Time
	ChangeFreq string
	Priority   string
}

// SitePublicBaseURL 公开站点根地址（无尾斜杠）
// 优先管理后台 OIDC 中的 ROOT_URL，否则根据请求 Host 推断
func (s *ForumSettingsService) SitePublicBaseURL(requestOrigin string) string {
	root := normalizeRootURL(s.getString(SettingOIDCRootURL, ""))
	if root == "" {
		root = normalizeRootURL(requestOrigin)
	}
	return strings.TrimRight(root, "/")
}

// AbsoluteURL 将相对路径拼成绝对 URL。
// base 为空或非 http(s) 时返回空串，避免邮件等场景出现无法点击的相对路径。
func AbsoluteURL(base, pathOrURL string) string {
	pathOrURL = strings.TrimSpace(pathOrURL)
	if pathOrURL == "" {
		return ""
	}
	if strings.HasPrefix(pathOrURL, "http://") || strings.HasPrefix(pathOrURL, "https://") {
		return pathOrURL
	}
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	if base == "" || (!strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://")) {
		return ""
	}
	if !strings.HasPrefix(pathOrURL, "/") {
		pathOrURL = "/" + pathOrURL
	}
	return base + pathOrURL
}

// TruncateRunes 按 rune 截断并加省略号
func TruncateRunes(s string, max int) string {
	s = strings.TrimSpace(s)
	if max <= 0 || s == "" {
		return s
	}
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	runes := []rune(s)
	if max < 2 {
		return string(runes[:max])
	}
	return string(runes[:max-1]) + "…"
}

// ExcerptFromHTML 从 HTML 生成摘要（剥离标签）
func ExcerptFromHTML(htmlContent string, maxRunes int) string {
	plain := StripHTMLForSearch(htmlContent)
	return TruncateRunes(plain, maxRunes)
}

// FirstImageURL 提取正文中第一张图片的 src
func FirstImageURL(htmlContent string) string {
	m := imgSrcRe.FindStringSubmatch(htmlContent)
	if len(m) < 2 {
		return ""
	}
	src := strings.TrimSpace(m[1])
	// 忽略 data: 内联图
	if strings.HasPrefix(src, "data:") {
		return ""
	}
	return src
}

// DisplayName 用户展示名
func DisplayName(u *model.User) string {
	if u == nil {
		return ""
	}
	if n := strings.TrimSpace(u.Nickname); n != "" {
		return n
	}
	return strings.TrimSpace(u.Username)
}

// QueryBoardHome 板块首页相对路径
func QueryBoardHome(boardID uint) string {
	if boardID == 0 {
		return "/"
	}
	return "/?board=" + url.QueryEscape(itoaUint(boardID))
}

func itoaUint(n uint) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}

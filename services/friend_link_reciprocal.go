package services

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const (
	reciprocalCheckTimeout = 8 * time.Second // 整次检测硬上限（DNS / 抓取 / 解析）
	reciprocalFetchTimeout = 5 * time.Second
	reciprocalMaxBodyBytes = 512 * 1024
	reciprocalMaxHrefs     = 4000
)

var hrefRe = regexp.MustCompile(`(?i)<a[^>]+href=["']([^"']+)["']`)

// VerifyReciprocalLink 检测页面 HTML 是否包含指向本站的链接
func VerifyReciprocalLink(pageURL, ourSiteURL string) (verified bool, note string) {
	ctx, cancel := context.WithTimeout(context.Background(), reciprocalCheckTimeout)
	defer cancel()
	return verifyReciprocalLink(ctx, pageURL, ourSiteURL)
}

func verifyReciprocalLink(ctx context.Context, pageURL, ourSiteURL string) (verified bool, note string) {
	pageURL = strings.TrimSpace(pageURL)
	ourSiteURL = strings.TrimSpace(ourSiteURL)
	if pageURL == "" {
		return false, "未提供回链页地址"
	}
	if ourSiteURL == "" {
		return false, "本站 URL 未配置"
	}

	pageParsed, err := normalizeFriendLinkApplyURL(pageURL)
	if err != nil {
		return false, err.Error()
	}
	ourParsed, err := url.Parse(ourSiteURL)
	if err != nil || ourParsed.Host == "" {
		return false, "本站 URL 无效"
	}
	ourHost := strings.ToLower(strings.TrimSuffix(ourParsed.Host, ":443"))
	ourHost = strings.TrimSuffix(ourHost, ":80")

	if err := assertSafeFetchURL(ctx, pageParsed); err != nil {
		return false, err.Error()
	}

	body, err := fetchHTMLBody(ctx, pageParsed)
	if err != nil {
		if isTimeoutErr(err) || ctx.Err() != nil {
			return false, "访问回链页超时"
		}
		return false, fmt.Sprintf("无法访问回链页：%v", err)
	}
	if ctx.Err() != nil {
		return false, "访问回链页超时"
	}

	if pageContainsLinkToHost(body, pageParsed, ourParsed, ourHost) {
		return true, "已检测到本站链接"
	}
	return false, "未在该页面检测到指向本站的链接"
}

func isTimeoutErr(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return true
	}
	var ne net.Error
	return errors.As(err, &ne) && ne.Timeout()
}

func assertSafeFetchURL(ctx context.Context, raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("URL 无效")
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("仅支持 http/https")
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("URL 无效")
	}
	lower := strings.ToLower(host)
	if lower == "localhost" || strings.HasSuffix(lower, ".localhost") || lower == "0.0.0.0" {
		return fmt.Errorf("不允许访问内网地址")
	}
	ips, err := lookupHostIPs(ctx, host)
	if err != nil {
		if isTimeoutErr(err) {
			return fmt.Errorf("解析域名超时")
		}
		return fmt.Errorf("无法解析域名")
	}
	for _, ip := range ips {
		if isPrivateOrLoopbackIP(ip) {
			return fmt.Errorf("不允许访问内网地址")
		}
	}
	return nil
}

func lookupHostIPs(ctx context.Context, host string) ([]net.IP, error) {
	addrs, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		return nil, err
	}
	ips := make([]net.IP, 0, len(addrs))
	for _, a := range addrs {
		if a.IP != nil {
			ips = append(ips, a.IP)
		}
	}
	return ips, nil
}

func isPrivateOrLoopbackIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return true
	}
	if ip4 := ip.To4(); ip4 != nil {
		return ip4[0] == 10 ||
			(ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31) ||
			(ip4[0] == 192 && ip4[1] == 168) ||
			(ip4[0] == 127) ||
			(ip4[0] == 169 && ip4[1] == 254) ||
			(ip4[0] == 0)
	}
	return false
}

func fetchHTMLBody(ctx context.Context, rawURL string) (string, error) {
	client := &http.Client{
		Timeout: reciprocalFetchTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) >= 5 {
				return fmt.Errorf("重定向过多")
			}
			if err := assertSafeFetchURL(req.Context(), req.URL.String()); err != nil {
				return err
			}
			return nil
		},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	req.Close = true
	req.Header.Set("User-Agent", "Jiang13Forum-FriendLinkCheck/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 400 {
		return "", fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	limited := io.LimitReader(resp.Body, reciprocalMaxBodyBytes+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return "", err
	}
	if len(data) > reciprocalMaxBodyBytes {
		return "", fmt.Errorf("页面过大")
	}
	return string(data), nil
}

func pageContainsLinkToHost(html, pageURL string, ourURL *url.URL, ourHost string) bool {
	ourHost = strings.ToLower(ourHost)
	ourPath := strings.TrimSuffix(ourURL.Path, "/")
	if ourPath == "" {
		ourPath = "/"
	}

	base, err := url.Parse(pageURL)
	if err != nil {
		return false
	}

	checkHref := func(href string) bool {
		href = strings.TrimSpace(href)
		if href == "" || strings.HasPrefix(strings.ToLower(href), "javascript:") || strings.HasPrefix(strings.ToLower(href), "mailto:") {
			return false
		}
		resolved, err := url.Parse(href)
		if err != nil {
			return false
		}
		resolved = base.ResolveReference(resolved)
		host := strings.ToLower(resolved.Hostname())
		if host == "" {
			return false
		}
		host = strings.TrimSuffix(strings.TrimSuffix(host, ":443"), ":80")
		if host != ourHost {
			return false
		}
		path := strings.TrimSuffix(resolved.Path, "/")
		if path == "" {
			path = "/"
		}
		// 允许首页或完整路径匹配
		if ourPath == "/" || path == ourPath || strings.HasPrefix(path, ourPath+"/") {
			return true
		}
		return path == "/" || ourPath == path
	}

	// 逐条扫描，命中即停；限制条数避免超大页面占用过多 CPU
	rest := html
	for i := 0; i < reciprocalMaxHrefs; i++ {
		loc := hrefRe.FindStringSubmatchIndex(rest)
		if loc == nil {
			break
		}
		if loc[2] >= 0 && loc[3] >= loc[2] && checkHref(rest[loc[2]:loc[3]]) {
			return true
		}
		if loc[1] <= 0 {
			break
		}
		rest = rest[loc[1]:]
	}
	// 兜底：页面源码中包含本站域名
	lower := strings.ToLower(html)
	if strings.Contains(lower, ourHost) {
		return strings.Contains(lower, ourHost+"/") ||
			strings.Contains(lower, "://"+ourHost)
	}
	return false
}

func normalizeFriendLinkLogo(raw string) (string, error) {
	logo := strings.TrimSpace(raw)
	if logo == "" {
		return "", fmt.Errorf("请填写或上传网站 LOGO")
	}
	if len(logo) > maxFriendLinkURL {
		return "", fmt.Errorf("LOGO 地址过长")
	}
	if strings.HasPrefix(logo, "/uploads/") {
		return logo, nil
	}
	return normalizeFriendLinkApplyURL(logo)
}

// normalizeFriendLinkLogoOptional LOGO 可选（友链列表项）
func normalizeFriendLinkLogoOptional(raw string) string {
	logo, err := normalizeFriendLinkLogo(raw)
	if err != nil {
		return ""
	}
	return logo
}

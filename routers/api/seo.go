package api

import (
	"net/http"
	"strings"
	"time"

	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

const seoSitemapLimit = 5000

// RobotsTxt 搜索引擎抓取规则
func (h *Handlers) RobotsTxt(c *gin.Context) {
	base := h.publicBaseURL(c)
	var b strings.Builder
	b.WriteString("User-agent: *\n")
	b.WriteString("Allow: /\n")
	b.WriteString("Disallow: /api/\n")
	b.WriteString("Disallow: /admin\n")
	b.WriteString("Disallow: /install\n")
	b.WriteString("Disallow: /login\n")
	b.WriteString("Disallow: /compose\n")
	b.WriteString("Disallow: /oauth/\n")
	if base != "" {
		b.WriteString("\nSitemap: ")
		b.WriteString(base)
		b.WriteString("/sitemap.xml\n")
	}
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(b.String()))
}

// SitemapXML 公开页面站点地图（与 SSR 同源路径）
func (h *Handlers) SitemapXML(c *gin.Context) {
	base := h.publicBaseURL(c)
	if base == "" {
		c.String(http.StatusServiceUnavailable, "未配置站点 ROOT_URL，无法生成 sitemap")
		return
	}

	now := time.Now().UTC()
	permalink := h.Settings.Permalink()
	urls := []services.SitemapURL{
		{Loc: base + "/", LastMod: now, ChangeFreq: "hourly", Priority: "1.0"},
	}

	if boards, err := h.Board.List(); err == nil {
		for _, board := range boards {
			urls = append(urls, services.SitemapURL{
				Loc:        base + services.QueryBoardHome(board.ID, permalink),
				LastMod:    board.UpdatedAt.UTC(),
				ChangeFreq: "daily",
				Priority:   "0.7",
			})
		}
	}

	if posts, e1 := h.Post.ListSitemap(seoSitemapLimit); e1 == nil {
		for _, p := range posts {
			lm := p.UpdatedAt
			if lm.IsZero() {
				lm = p.CreatedAt
			}
			urls = append(urls, services.SitemapURL{
				Loc:        base + permalink.PostPath(p.ID),
				LastMod:    lm.UTC(),
				ChangeFreq: "weekly",
				Priority:   "0.8",
			})
		}
	}

	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>`)
	b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`)
	for _, u := range urls {
		b.WriteString("<url><loc>")
		b.WriteString(xmlEscape(u.Loc))
		b.WriteString("</loc>")
		if !u.LastMod.IsZero() {
			b.WriteString("<lastmod>")
			b.WriteString(u.LastMod.Format("2006-01-02"))
			b.WriteString("</lastmod>")
		}
		if u.ChangeFreq != "" {
			b.WriteString("<changefreq>")
			b.WriteString(u.ChangeFreq)
			b.WriteString("</changefreq>")
		}
		if u.Priority != "" {
			b.WriteString("<priority>")
			b.WriteString(u.Priority)
			b.WriteString("</priority>")
		}
		b.WriteString("</url>")
	}
	b.WriteString("</urlset>")
	c.Data(http.StatusOK, "application/xml; charset=utf-8", []byte(b.String()))
}

func (h *Handlers) publicBaseURL(c *gin.Context) string {
	return h.Settings.SitePublicBaseURL(requestOrigin(c))
}

func requestOrigin(c *gin.Context) string {
	proto := c.GetHeader("X-Forwarded-Proto")
	if proto == "" {
		if c.Request.TLS != nil {
			proto = "https"
		} else {
			proto = "http"
		}
	}
	host := c.GetHeader("X-Forwarded-Host")
	if host == "" {
		host = c.Request.Host
	}
	if host == "" {
		return ""
	}
	return proto + "://" + host
}

func xmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	s = strings.ReplaceAll(s, "'", "&apos;")
	return s
}

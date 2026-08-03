package handler

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"git.iioio.com/freefire/jiang13-forum/embed_static"
	"git.iioio.com/freefire/jiang13-forum/model"
	"git.iioio.com/freefire/jiang13-forum/service"
)

var (
	seoPostEditRe  = regexp.MustCompile(`^/post/(\d+)/edit/?$`)
	seoBoardPathRe = regexp.MustCompile(`^/board/(\d+)/?$`)
)

const (
	seoDescMax      = 160
	seoPrerenderMax = 4000
	seoSitemapLimit = 5000
)

// RobotsTxt 搜索引擎抓取规则
func (h *Handlers) RobotsTxt(c *gin.Context) {
	base := h.publicBaseURL(c)
	var b strings.Builder
	b.WriteString("User-agent: *\n")
	b.WriteString("Allow: /\n")
	b.WriteString("Disallow: /api/\n")
	b.WriteString("Disallow: /admin\n")
	b.WriteString("Disallow: /compose\n")
	b.WriteString("Disallow: /login\n")
	b.WriteString("Disallow: /register\n")
	b.WriteString("Disallow: /profile\n")
	b.WriteString("Disallow: /favorites\n")
	b.WriteString("Disallow: /oauth/\n")
	b.WriteString("Disallow: /media/\n")
	b.WriteString("Disallow: /*/edit\n")
	if base != "" {
		b.WriteString("\nSitemap: ")
		b.WriteString(base)
		b.WriteString("/sitemap.xml\n")
	}
	c.Data(http.StatusOK, "text/plain; charset=utf-8", []byte(b.String()))
}

// SitemapXML 公开页面站点地图
func (h *Handlers) SitemapXML(c *gin.Context) {
	base := h.publicBaseURL(c)
	if base == "" {
		c.String(http.StatusServiceUnavailable, "未配置站点 ROOT_URL，无法生成 sitemap")
		return
	}

	now := time.Now().UTC()
	urls := []service.SitemapURL{
		{Loc: base + "/", LastMod: now, ChangeFreq: "hourly", Priority: "1.0"},
		{Loc: base + "/projects", LastMod: now, ChangeFreq: "daily", Priority: "0.6"},
	}

	if boards, err := h.Board.List(); err == nil {
		for _, board := range boards {
			urls = append(urls, service.SitemapURL{
				Loc:        base + service.QueryBoardHome(board.ID),
				LastMod:    board.UpdatedAt.UTC(),
				ChangeFreq: "daily",
				Priority:   "0.7",
			})
		}
	}

	permalink := h.Settings.Permalink()
	if posts, err := h.Post.ListSitemap(seoSitemapLimit); err == nil {
		for _, p := range posts {
			lm := p.UpdatedAt
			if lm.IsZero() {
				lm = p.CreatedAt
			}
			urls = append(urls, service.SitemapURL{
				Loc:        base + permalink.PostPath(p.ID),
				LastMod:    lm.UTC(),
				ChangeFreq: "weekly",
				Priority:   "0.8",
			})
		}
	}

	if users, err := h.User.ListSitemap(seoSitemapLimit); err == nil {
		for _, u := range users {
			urls = append(urls, service.SitemapURL{
				Loc:        base + permalink.UserPath(u.ID),
				LastMod:    u.UpdatedAt.UTC(),
				ChangeFreq: "weekly",
				Priority:   "0.5",
			})
		}
	}

	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>`)
	b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`)
	for _, u := range urls {
		b.WriteString("<url>")
		b.WriteString("<loc>")
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

// ServePublicSPA 公开页入口：
// - 普通用户：干净 SPA + <head> meta（无正文预渲染，避免刷新闪屏）
// - 搜索/社交爬虫：服务端 HTML（动态渲染）
// - 伪静态：按后台配置的后缀做规范 URL，非规范路径 301
func (h *Handlers) ServePublicSPA(c *gin.Context) {
	path := c.Request.URL.Path

	if m := seoBoardPathRe.FindStringSubmatch(path); len(m) == 2 {
		c.Redirect(http.StatusMovedPermanently, "/?board="+m[1])
		return
	}

	brand := h.Settings.SiteBranding()
	base := h.publicBaseURL(c)
	siteName := strings.TrimSpace(brand.Name)
	if siteName == "" {
		siteName = "姜十三论坛"
	}
	defaultImage := service.AbsoluteURL(base, brand.DefaultShareImage())
	siteKeywords := brand.MetaKeywords()
	permalink := h.Settings.Permalink()

	isBot := service.IsSEOCrawler(c.Request.UserAgent())
	if isBot {
		c.Header("Vary", "User-Agent")
	}

	// 帖子详情（含可选伪静态后缀）
	if pm := permalink.MatchPostPath(path); pm.OK {
		if pm.NeedsCanonicalRedirect(path) {
			c.Redirect(http.StatusMovedPermanently, pm.Canonical)
			return
		}
		post, err := h.Post.FindByID(pm.ID)
		if err != nil || !service.CanViewPost(post, h.currentUserID(c), h.isAdmin(c)) {
			h.serveNotFound(c, base, siteName, siteKeywords, path, isBot)
			return
		}
		postKeywords := service.JoinSEOKeywords(post.Board.Name, siteKeywords)
		if isBot {
			c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(h.botPostHTML(base, siteName, defaultImage, postKeywords, post)))
			return
		}
		embed_static.ServeSPAWithMeta(c, attachSiteSEO(h.postPageMeta(base, siteName, defaultImage, post), siteName, postKeywords))
		return
	}

	// 用户主页
	if um := permalink.MatchUserPath(path); um.OK {
		if um.NeedsCanonicalRedirect(path) {
			c.Redirect(http.StatusMovedPermanently, um.Canonical)
			return
		}
		user, err := h.User.GetByID(um.ID)
		if err != nil || user.Banned {
			h.serveNotFound(c, base, siteName, siteKeywords, path, isBot)
			return
		}
		if isBot {
			c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(h.botUserHTML(base, siteName, defaultImage, siteKeywords, user)))
			return
		}
		embed_static.ServeSPAWithMeta(c, attachSiteSEO(h.userPageMeta(base, siteName, defaultImage, user), siteName, siteKeywords))
		return
	}

	// 未知路径 → 404
	if !isKnownPublicPath(path) {
		h.serveNotFound(c, base, siteName, siteKeywords, path, isBot)
		return
	}

	// 其余已知路由：SPA + head meta；首页对爬虫额外返回可读正文
	meta := h.buildSPAPageMeta(c, path, brand, base, siteName, defaultImage)
	if isBot && (path == "/" || path == "") {
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(h.botHomeHTML(meta, brand)))
		return
	}
	embed_static.ServeSPAWithMeta(c, meta)
}

func (h *Handlers) serveNotFound(c *gin.Context, base, siteName, keywords, path string, isBot bool) {
	if isBot {
		c.Header("Vary", "User-Agent")
		c.Data(http.StatusNotFound, "text/html; charset=utf-8", []byte(botNotFoundHTML(base, siteName, keywords, path)))
		return
	}
	embed_static.ServeSPAWithMeta(c, notFoundPageMeta(base, siteName, keywords, path))
}

func notFoundPageMeta(base, siteName, keywords, path string) *embed_static.SPAPageMeta {
	return attachSiteSEO(&embed_static.SPAPageMeta{
		Title:       pageTitle("页面不存在", siteName),
		Description: "您访问的页面不存在或已删除",
		Canonical:   service.AbsoluteURL(base, path),
		OGType:      "website",
		Robots:      "noindex,follow",
		Status:      http.StatusNotFound,
	}, siteName, keywords)
}

// attachSiteSEO 填充站点级 keywords / og:site_name / og:locale
func attachSiteSEO(meta *embed_static.SPAPageMeta, siteName, keywords string) *embed_static.SPAPageMeta {
	if meta == nil {
		return nil
	}
	meta.SiteName = strings.TrimSpace(siteName)
	if strings.TrimSpace(meta.Keywords) == "" {
		meta.Keywords = strings.TrimSpace(keywords)
	}
	meta.Locale = "zh_CN"
	return meta
}

func isKnownPublicPath(path string) bool {
	switch path {
	case "/", "/login", "/register", "/compose", "/profile", "/favorites", "/projects", "/boards":
		return true
	}
	if seoPostEditRe.MatchString(path) {
		return true
	}
	return false
}

func (h *Handlers) buildSPAPageMeta(c *gin.Context, path string, brand service.SiteBranding, base, siteName, defaultImage string) *embed_static.SPAPageMeta {
	siteTitle := brand.DocumentTitle()
	homeDesc := service.TruncateRunes(brand.MetaDescription(), seoDescMax)
	siteKeywords := brand.MetaKeywords()
	meta := attachSiteSEO(&embed_static.SPAPageMeta{
		Title:       siteTitle,
		Description: homeDesc,
		Keywords:    siteKeywords,
		Canonical:   service.AbsoluteURL(base, pathWithQuery(c)),
		OGType:      "website",
		OGImage:     defaultImage,
	}, siteName, siteKeywords)

	if isNoIndexPath(path) {
		meta.Robots = "noindex,nofollow"
		meta.Title = pageTitle(pathLabel(path), siteName)
		return meta
	}

	if path == "/" || path == "" {
		boardID, _ := strconv.ParseUint(c.Query("board"), 10, 64)
		if boardID > 0 {
			if board, err := h.Board.GetByID(uint(boardID)); err == nil {
				desc := strings.TrimSpace(board.Description)
				if desc == "" {
					desc = brand.MetaDescription()
				}
				meta.Title = pageTitle(board.Name, siteName)
				meta.Description = service.TruncateRunes(desc, seoDescMax)
				meta.Canonical = service.AbsoluteURL(base, service.QueryBoardHome(board.ID))
				meta.Keywords = service.JoinSEOKeywords(board.Name, siteKeywords)
				return meta
			}
			// 无效板块 id：仍显示首页，但可标记 noindex
			meta.Robots = "noindex,follow"
			return meta
		}
		meta.JSONLD = mustJSON(map[string]any{
			"@context":    "https://schema.org",
			"@type":       "WebSite",
			"name":        siteName,
			"description": meta.Description,
			"url":         service.AbsoluteURL(base, "/"),
		})
	}

	if path == "/projects" {
		meta.Title = pageTitle("项目", siteName)
		meta.Description = service.TruncateRunes(siteName+" 的公开项目列表", seoDescMax)
		meta.Keywords = service.JoinSEOKeywords("项目", siteKeywords)
	}

	return meta
}

func (h *Handlers) postPageMeta(base, siteName, defaultImage string, post *model.Post) *embed_static.SPAPageMeta {
	permalink := h.Settings.Permalink()
	content := service.RedactMembersOnlyHTML(post.Content)
	plain := post.ContentPlain
	if plain == "" {
		plain = service.StripHTMLForSearch(content)
	}
	desc := service.TruncateRunes(plain, seoDescMax)
	author := service.DisplayName(&post.User)
	canonical := service.AbsoluteURL(base, permalink.PostPath(post.ID))
	ogImage := service.AbsoluteURL(base, service.FirstImageURL(content))
	if ogImage == "" {
		ogImage = service.AbsoluteURL(base, post.User.Avatar)
	}
	if ogImage == "" {
		ogImage = defaultImage
	}

	jsonld := map[string]any{
		"@context":         "https://schema.org",
		"@type":            "DiscussionForumPosting",
		"headline":         post.Title,
		"description":      desc,
		"datePublished":    post.CreatedAt.UTC().Format(time.RFC3339),
		"dateModified":     post.UpdatedAt.UTC().Format(time.RFC3339),
		"url":              canonical,
		"mainEntityOfPage": canonical,
		"author": map[string]any{
			"@type": "Person",
			"name":  author,
			"url":   service.AbsoluteURL(base, permalink.UserPath(post.UserID)),
		},
		"interactionStatistic": map[string]any{
			"@type":                "InteractionCounter",
			"interactionType":      "https://schema.org/ViewAction",
			"userInteractionCount": post.ViewCount,
		},
	}
	if post.Board.Name != "" {
		jsonld["articleSection"] = post.Board.Name
	}
	if ogImage != "" {
		jsonld["image"] = []string{ogImage}
	}
	body := service.TruncateRunes(plain, seoPrerenderMax)
	if body != "" {
		jsonld["articleBody"] = body
	}

	return &embed_static.SPAPageMeta{
		Title:       pageTitle(post.Title, siteName),
		Description: desc,
		Canonical:   canonical,
		OGType:      "article",
		OGImage:     ogImage,
		JSONLD:      mustJSON(jsonld),
	}
}

func (h *Handlers) userPageMeta(base, siteName, defaultImage string, user *model.User) *embed_static.SPAPageMeta {
	permalink := h.Settings.Permalink()
	name := service.DisplayName(user)
	desc := strings.TrimSpace(user.Signature)
	if desc == "" {
		desc = name + " 的主页"
	}
	desc = service.TruncateRunes(desc, seoDescMax)
	canonical := service.AbsoluteURL(base, permalink.UserPath(user.ID))
	ogImage := service.AbsoluteURL(base, user.Avatar)
	if ogImage == "" {
		ogImage = defaultImage
	}

	jsonld := map[string]any{
		"@context": "https://schema.org",
		"@type":    "ProfilePage",
		"url":      canonical,
		"mainEntity": map[string]any{
			"@type":       "Person",
			"name":        name,
			"description": desc,
			"url":         canonical,
		},
	}
	if ogImage != "" {
		jsonld["mainEntity"].(map[string]any)["image"] = ogImage
	}

	return &embed_static.SPAPageMeta{
		Title:       pageTitle(name+" 的主页", siteName),
		Description: desc,
		Canonical:   canonical,
		OGType:      "profile",
		OGImage:     ogImage,
		JSONLD:      mustJSON(jsonld),
	}
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

func pathWithQuery(c *gin.Context) string {
	path := c.Request.URL.Path
	if path == "" {
		path = "/"
	}
	if q := c.Request.URL.RawQuery; q != "" {
		// 首页排序/搜索不作为 canonical；板块筛选保留
		if path == "/" {
			board := c.Query("board")
			if board != "" {
				return service.QueryBoardHome(uint(parseUintOrZero(board)))
			}
			return "/"
		}
		return path + "?" + q
	}
	return path
}

func parseUintOrZero(s string) uint64 {
	n, _ := strconv.ParseUint(s, 10, 64)
	return n
}

func isNoIndexPath(path string) bool {
	switch {
	case path == "/login", path == "/register", path == "/compose",
		path == "/profile", path == "/favorites":
		return true
	case strings.HasPrefix(path, "/admin"):
		return true
	case strings.HasSuffix(path, "/edit"):
		return true
	default:
		return false
	}
}

func pathLabel(path string) string {
	switch {
	case path == "/login":
		return "登录"
	case path == "/register":
		return "注册"
	case path == "/compose":
		return "发帖"
	case path == "/profile":
		return "个人中心"
	case path == "/favorites":
		return "我的收藏"
	case strings.HasSuffix(path, "/edit"):
		return "编辑帖子"
	case strings.HasPrefix(path, "/admin"):
		return "管理后台"
	default:
		return ""
	}
}

func pageTitle(page, siteName string) string {
	page = strings.TrimSpace(page)
	siteName = strings.TrimSpace(siteName)
	switch {
	case page == "" && siteName == "":
		return "姜十三论坛"
	case page == "":
		return siteName
	case siteName == "":
		return page
	default:
		return page + " - " + siteName
	}
}

func mustJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return string(b)
}

func xmlEscape(s string) string {
	r := strings.NewReplacer(
		`&`, "&amp;",
		`<`, "&lt;",
		`>`, "&gt;",
		`"`, "&quot;",
		`'`, "&apos;",
	)
	return r.Replace(s)
}

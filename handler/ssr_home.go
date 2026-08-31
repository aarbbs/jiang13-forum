package handler

import (
	"encoding/json"
	"fmt"
	"html"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"git.iioio.com/freefire/jiang13-forum/embed_static"
	"git.iioio.com/freefire/jiang13-forum/model"
	"git.iioio.com/freefire/jiang13-forum/service"
	"github.com/gin-gonic/gin"
)

var firstImgSrcRe = regexp.MustCompile(`(?i)<img[^>]+src=["']([^"']+)["']`)

// homeBootPayload 与前端 __J13_HOME_BOOT__ 对齐，供冷启动灌缓存
type homeBootPayload struct {
	BoardID        uint                            `json:"board_id"`
	Sort           string                          `json:"sort"`
	Keyword        string                          `json:"keyword"`
	Tag            string                          `json:"tag"`
	Author         string                          `json:"author"`
	TitleOnly      bool                            `json:"title_only"`
	Posts          []service.PostListItem          `json:"posts"`
	PostTotal      int64                           `json:"post_total"`
	Page           int                             `json:"page"`
	Boards         []service.BoardWithStats        `json:"boards"`
	Stats          homeBootStats                   `json:"stats"`
	RecentComments []service.RecentCommentItem     `json:"recent_comments"`
	RecentUsers    []service.RecentUserItem        `json:"recent_users"`
	Tags           []service.TagCount              `json:"tags"`
	Showcase       []service.CommunityShowcaseItem `json:"showcase"`
	Pages          []service.SitePageSummary       `json:"pages"`
	Limits         service.ForumLimitsPublic       `json:"limits"`
	Branding       service.SiteBranding            `json:"branding"`
	User           *model.UserSelf                 `json:"user"`
	UnreadMessages int                             `json:"unread_messages"`
	CheckIn        *service.CheckInStatus          `json:"check_in"`
}

type homeBootStats struct {
	Users    int64 `json:"users"`
	Posts    int64 `json:"posts"`
	Boards   int64 `json:"boards"`
	Comments int64 `json:"comments"`
}

type homeSSRData struct {
	boot homeBootPayload
	meta homeSSRMeta
}

type homeSSRMeta struct {
	boardName string
	permalink service.PermalinkConfig
	listStyle string
	defSort   string
}

// serveFeedDocument 首页/板块：文档 SSR + boot；失败则回退空 root SPA
func (h *Handlers) serveFeedDocument(c *gin.Context, meta *embed_static.SPAPageMeta, boardID uint) {
	data, err := h.gatherHomeSSR(c, boardID)
	if err != nil {
		embed_static.ServeSPAWithMeta(c, meta)
		return
	}
	bootJSON, err := json.Marshal(data.boot)
	if err != nil {
		embed_static.ServeSPAWithMeta(c, meta)
		return
	}
	meta.RootHTML = renderHomeSSRHTML(data)
	meta.BootJSON = bootJSON
	embed_static.ServeSPAWithMeta(c, meta)
}

func (h *Handlers) gatherHomeSSR(c *gin.Context, boardID uint) (*homeSSRData, error) {
	limits := h.Settings.PublicLimits()
	brand := h.Settings.SiteBranding()
	brand.SiteURL = h.publicBaseURL(c)
	permalink := h.Settings.Permalink()
	defSort := h.Settings.DefaultFeedSort()

	sort := strings.TrimSpace(c.Query("sort"))
	if sort == "" {
		sort = defSort
	}
	keyword := strings.TrimSpace(c.Query("keyword"))
	tag := strings.TrimSpace(c.Query("tag"))
	author := strings.TrimSpace(c.Query("author"))
	titleOnly := c.Query("title_only") == "1" || strings.EqualFold(c.Query("title_only"), "true")
	if tag != "" {
		keyword = ""
		author = ""
		titleOnly = false
	}

	pageSize := h.Settings.PageSizeDefault()
	listStyle := limits.FeedListStyle
	if listStyle == "" {
		listStyle = "title"
	}

	out := &homeSSRData{
		boot: homeBootPayload{
			BoardID:   boardID,
			Sort:      sort,
			Keyword:   keyword,
			Tag:       tag,
			Author:    author,
			TitleOnly: titleOnly,
			Page:      1,
			Limits:    limits,
			Branding:  brand,
		},
		meta: homeSSRMeta{
			permalink: permalink,
			listStyle: listStyle,
			defSort:   defSort,
		},
	}

	var (
		postsErr, boardsErr error
		wg                  sync.WaitGroup
	)

	wg.Add(1)
	go func() {
		defer wg.Done()
		q := service.PostListQuery{
			BoardID:       boardID,
			Page:          1,
			Size:          pageSize,
			Sort:          sort,
			Keyword:       keyword,
			Tag:           tag,
			Author:        author,
			TitleOnly:     titleOnly,
			ViewerID:      h.currentUserID(c),
			ViewerIsAdmin: h.isAdmin(c),
		}
		items, total, err := h.Post.ListItems(q)
		if err != nil {
			postsErr = err
			return
		}
		if items == nil {
			items = []service.PostListItem{}
		}
		if h.Badge != nil {
			users := make([]*model.User, 0, len(items))
			for i := range items {
				if items[i].User.ID > 0 {
					users = append(users, &items[i].User)
				}
			}
			h.Badge.AttachBadgeSummaries(users, 2)
		}
		out.boot.Posts = items
		out.boot.PostTotal = total
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		boards, err := h.Board.ListWithStats()
		if err != nil {
			boardsErr = err
			return
		}
		if boards == nil {
			boards = []service.BoardWithStats{}
		}
		out.boot.Boards = boards
		for _, board := range boards {
			if board.ID == boardID {
				out.meta.boardName = board.Name
				break
			}
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		var users, posts, boardsN, comments int64
		model.DB.Model(&model.User{}).Count(&users)
		model.DB.Model(&model.Post{}).Where("status = ?", model.ContentStatusPublished).Count(&posts)
		model.DB.Model(&model.Board{}).Count(&boardsN)
		model.DB.Model(&model.Comment{}).Where("status = ?", model.ContentStatusPublished).Count(&comments)
		out.boot.Stats = homeBootStats{Users: users, Posts: posts, Boards: boardsN, Comments: comments}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		pages, err := h.SitePage.ListPublished()
		if err != nil || pages == nil {
			pages = []service.SitePageSummary{}
		}
		out.boot.Pages = pages
	}()

	widgetEnabled := map[string]bool{}
	for _, w := range limits.AsideWidgets {
		widgetEnabled[w.ID] = w.Enabled
	}

	if widgetEnabled[service.AsideWidgetRecentComments] {
		wg.Add(1)
		go func() {
			defer wg.Done()
			items, err := h.Comment.ListRecentPublic(8)
			if err != nil || items == nil {
				items = []service.RecentCommentItem{}
			}
			out.boot.RecentComments = items
		}()
	} else {
		out.boot.RecentComments = []service.RecentCommentItem{}
	}

	if widgetEnabled[service.AsideWidgetRecentUsers] {
		wg.Add(1)
		go func() {
			defer wg.Done()
			items, err := h.User.ListRecentRegistered(8)
			if err != nil || items == nil {
				items = []service.RecentUserItem{}
			}
			out.boot.RecentUsers = items
		}()
	} else {
		out.boot.RecentUsers = []service.RecentUserItem{}
	}

	if widgetEnabled[service.AsideWidgetTagCloud] {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tags, err := h.Post.PopularTags(40)
			if err != nil || tags == nil {
				tags = []service.TagCount{}
			}
			out.boot.Tags = tags
		}()
	} else {
		out.boot.Tags = []service.TagCount{}
	}

	if widgetEnabled[service.AsideWidgetShowcase] && h.Community != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			items, err := h.Community.ListShowcase(c.Request.Host)
			if err != nil || items == nil {
				items = []service.CommunityShowcaseItem{}
			}
			out.boot.Showcase = items
		}()
	} else {
		out.boot.Showcase = []service.CommunityShowcaseItem{}
	}

	uid := h.currentUserID(c)
	if uid > 0 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			user, err := h.User.GetByID(uid)
			if err != nil || user == nil {
				return
			}
			view := user.ToSelf()
			if h.Badge != nil {
				_ = h.Badge.EvaluateAuto(user.ID)
				if badges, bErr := h.Badge.ListUserBadges(user.ID); bErr == nil {
					view.Badges = service.BadgeViews(badges, 0)
				}
			}
			out.boot.User = &view
		}()
		if h.Message != nil {
			wg.Add(1)
			go func() {
				defer wg.Done()
				total, _, _, err := h.Message.UnreadCounts(uid)
				if err == nil {
					out.boot.UnreadMessages = int(total)
				}
			}()
		}
		if h.Points != nil {
			wg.Add(1)
			go func() {
				defer wg.Done()
				st, err := h.Points.GetCheckInStatus(uid)
				if err == nil {
					out.boot.CheckIn = &st
				}
			}()
		}
	}

	wg.Wait()
	if postsErr != nil {
		return nil, postsErr
	}
	if boardsErr != nil {
		return nil, boardsErr
	}
	return out, nil
}

func renderHomeSSRHTML(data *homeSSRData) string {
	b := &strings.Builder{}
	b.Grow(64 * 1024)
	boot := data.boot
	meta := data.meta
	brandName := strings.TrimSpace(boot.Branding.Name)
	if brandName == "" {
		brandName = "姜十三论坛"
	}
	logoMark := strings.TrimSpace(boot.Branding.LogoMark)
	if logoMark == "" {
		if r, _ := utf8.DecodeRuneInString(brandName); r != utf8.RuneError {
			logoMark = string(r)
		} else {
			logoMark = "姜"
		}
	}
	loggedIn := boot.User != nil && boot.User.ID > 0

	b.WriteString(`<div class="app-shell ssr-home"><div class="app-frame">`)

	b.WriteString(`<header class="app-header"><div class="header-inner">`)
	b.WriteString(`<a class="header-brand" href="/">`)
	if logo := strings.TrimSpace(boot.Branding.Logo); logo != "" {
		b.WriteString(`<img class="header-logo-mark" src="` + html.EscapeString(logo) + `" alt=""/>`)
	} else {
		b.WriteString(`<span class="header-logo-mark">` + html.EscapeString(logoMark) + `</span>`)
	}
	b.WriteString(`<span class="header-logo-text">` + html.EscapeString(brandName) + `</span></a>`)

	b.WriteString(`<form class="header-search-wrap" role="search" action="/" method="get"><div class="header-search-row">`)
	b.WriteString(ssrIconSearch())
	b.WriteString(`<input class="header-search-input" type="search" name="keyword" placeholder="搜索帖子…" aria-label="搜索帖子" value="` + html.EscapeString(boot.Keyword) + `"/>`)
	b.WriteString(`<button type="submit" class="header-search-filter-btn" aria-label="搜索筛选" title="筛选">`)
	b.WriteString(ssrIconSliders())
	b.WriteString(`</button>`)
	b.WriteString(`<kbd class="header-search-kbd" aria-hidden="true">Ctrl K</kbd>`)
	b.WriteString(`</div></form>`)

	b.WriteString(`<div class="header-actions">`)
	composeHref := "/login?from=%2Fcompose"
	if loggedIn {
		composeHref = "/compose"
	}
	b.WriteString(`<a class="header-compose-btn" href="` + composeHref + `" aria-label="发帖">`)
	b.WriteString(ssrIconPlus())
	b.WriteString(`<span>发帖</span></a>`)

	b.WriteString(`<div class="header-action-group">`)
	// 主题：双图标 + CSS，配合 documentElement.dark
	b.WriteString(`<button type="button" class="header-icon-btn" aria-label="切换主题" title="切换主题">`)
	b.WriteString(`<span class="ssr-theme-icon ssr-theme-icon--moon">` + ssrIconMoon() + `</span>`)
	b.WriteString(`<span class="ssr-theme-icon ssr-theme-icon--sun">` + ssrIconSun() + `</span>`)
	b.WriteString(`</button>`)

	if loggedIn {
		u := boot.User
		msgTitle := "站内消息"
		if boot.UnreadMessages > 0 {
			msgTitle = strconv.Itoa(boot.UnreadMessages) + " 条未读消息"
		}
		b.WriteString(`<a class="header-icon-btn header-msg-btn" href="/messages" title="` + html.EscapeString(msgTitle) + `" aria-label="` + html.EscapeString(msgTitle) + `">`)
		b.WriteString(ssrIconMail())
		if boot.UnreadMessages > 0 {
			badge := strconv.Itoa(boot.UnreadMessages)
			if boot.UnreadMessages > 99 {
				badge = "99+"
			}
			b.WriteString(`<span class="header-msg-badge">` + badge + `</span>`)
		}
		b.WriteString(`</a>`)
		nick := strings.TrimSpace(u.Nickname)
		if nick == "" {
			nick = u.Username
		}
		initial := "?"
		if r, _ := utf8.DecodeRuneInString(nick); r != utf8.RuneError {
			initial = string(r)
		}
		b.WriteString(`<a class="header-user-btn" href="/profile" title="` + html.EscapeString(nick) + `" aria-label="用户菜单：` + html.EscapeString(nick) + `">`)
		if u.Avatar != "" {
			b.WriteString(`<img src="` + html.EscapeString(u.Avatar) + `" alt="" class="header-user-avatar" loading="lazy" decoding="async"/>`)
		} else {
			b.WriteString(`<span class="header-user-initial">` + html.EscapeString(initial) + `</span>`)
		}
		b.WriteString(`</a>`)
	} else {
		b.WriteString(`<a class="header-login-btn" href="/login">登录</a>`)
	}
	b.WriteString(`</div></div></div></header>`)

	b.WriteString(`<div class="app-body">`)
	writeSSRSidebar(b, boot, meta)
	b.WriteString(`<div class="content-workspace"><main class="main-content">`)
	writeSSRFeed(b, boot, meta)
	b.WriteString(`</main>`)
	writeSSRAside(b, boot)
	b.WriteString(`</div></div>`)
	writeSSRFooter(b, boot, meta)
	b.WriteString(`</div></div>`)
	return b.String()
}

func ssrFeedURL(boardID uint, sort, defSort string, pl service.PermalinkConfig, extra url.Values) string {
	var path string
	if boardID > 0 {
		path = pl.BoardPath(boardID)
	} else {
		path = "/"
	}
	q := url.Values{}
	for k, vs := range extra {
		for _, v := range vs {
			if strings.TrimSpace(v) != "" {
				q.Add(k, v)
			}
		}
	}
	if sort != "" && sort != defSort {
		q.Set("sort", sort)
	}
	enc := q.Encode()
	if enc == "" {
		return path
	}
	return path + "?" + enc
}

func writeSSRSidebar(b *strings.Builder, boot homeBootPayload, meta homeSSRMeta) {
	loggedIn := boot.User != nil && boot.User.ID > 0
	isAdmin := loggedIn && boot.User.Role == model.RoleAdmin

	b.WriteString(`<aside class="sidebar"><div class="sidebar-section">浏览</div><nav class="sidebar-nav">`)
	allActive := ""
	if boot.BoardID == 0 && boot.Keyword == "" && boot.Tag == "" && boot.Author == "" {
		allActive = " active"
	}
	b.WriteString(`<a class="sidebar-nav-item` + allActive + `" href="` + html.EscapeString(ssrFeedURL(0, boot.Sort, meta.defSort, meta.permalink, nil)) + `">`)
	b.WriteString(ssrIconHome())
	b.WriteString(`<span class="flex-1 truncate">全部帖子</span></a>`)
	if loggedIn {
		b.WriteString(`<a class="sidebar-nav-item" href="/favorites">`)
		b.WriteString(ssrIconStar())
		b.WriteString(`<span class="flex-1 truncate">我的收藏</span></a>`)
	}
	b.WriteString(`<a class="sidebar-nav-item" href="/projects">`)
	b.WriteString(ssrIconFolderGit())
	b.WriteString(`<span class="flex-1 truncate">开源码桶</span></a></nav>`)

	if len(boot.Boards) > 0 {
		b.WriteString(`<div class="sidebar-section sidebar-section--boards">板块</div><nav class="sidebar-nav">`)
		for _, board := range boot.Boards {
			theme := boardThemeIndex(board.ColorIndex, board.ID)
			active := ""
			extraClass := ""
			if boot.BoardID == board.ID {
				active = " active"
				extraClass = fmt.Sprintf(" sidebar-nav-item--board-%d", theme)
			}
			href := ssrFeedURL(board.ID, boot.Sort, meta.defSort, meta.permalink, nil)
			b.WriteString(`<a class="sidebar-nav-item sidebar-nav-item--board` + active + extraClass + `" href="` + html.EscapeString(href) + `">`)
			b.WriteString(ssrBoardIconSVG(board.Icon, theme, `sidebar-board-icon sidebar-board-icon--`+strconv.Itoa(theme)))
			b.WriteString(`<span class="flex-1 truncate">` + html.EscapeString(board.Name) + `</span>`)
			if board.PostCount > 0 {
				b.WriteString(`<span class="sidebar-nav-item__meta">` + strconv.Itoa(board.PostCount) + ` 帖</span>`)
			}
			b.WriteString(`</a>`)
		}
		b.WriteString(`</nav>`)
	}

	navPages := make([]service.SitePageSummary, 0)
	for _, p := range boot.Pages {
		if p.ShowInNav {
			navPages = append(navPages, p)
		}
	}
	if boot.Limits.NavShowFriendLinks || boot.Limits.NavShowShowcase || len(navPages) > 0 {
		b.WriteString(`<div class="sidebar-section sidebar-section--spaced">站点</div><nav class="sidebar-nav">`)
		if boot.Limits.NavShowFriendLinks {
			b.WriteString(`<a class="sidebar-nav-item" href="/links">`)
			b.WriteString(ssrIconLink2())
			b.WriteString(`<span class="flex-1 truncate">友情链接</span></a>`)
		}
		if boot.Limits.NavShowShowcase {
			b.WriteString(`<a class="sidebar-nav-item" href="/showcase">`)
			b.WriteString(ssrIconEarth())
			b.WriteString(`<span class="flex-1 truncate">开源展柜</span></a>`)
		}
		for _, p := range navPages {
			b.WriteString(`<a class="sidebar-nav-item" href="` + html.EscapeString(meta.permalink.PagePath(p.Slug)) + `">`)
			b.WriteString(ssrIconFileText())
			b.WriteString(`<span class="flex-1 truncate">` + html.EscapeString(p.Title) + `</span></a>`)
		}
		b.WriteString(`</nav>`)
	}

	if isAdmin {
		b.WriteString(`<div class="sidebar-section sidebar-section--spaced">管理</div><nav class="sidebar-nav">`)
		b.WriteString(`<a class="sidebar-nav-item" href="/admin/dashboard">`)
		b.WriteString(ssrIconLayoutDashboard())
		b.WriteString(`<span class="flex-1 truncate">管理后台</span></a></nav>`)
	}
	b.WriteString(`</aside>`)
}

func writeSSRFeed(b *strings.Builder, boot homeBootPayload, meta homeSSRMeta) {
	b.WriteString(`<div class="page-wrap page-wrap--feed"><div class="feed-panel">`)
	b.WriteString(`<div class="feed-top"><div class="feed-top__bar">`)

	// 板块首页不输出 h1（与 React FeedHeader 一致）；仅搜索/标签/作者保留标题
	if boot.Keyword != "" || boot.Tag != "" || boot.Author != "" {
		title := "帖子列表"
		switch {
		case boot.Tag != "":
			title = "#" + boot.Tag
		case boot.Keyword != "":
			title = "搜索：" + boot.Keyword
		case boot.Author != "":
			title = "作者：" + boot.Author
		}
		b.WriteString(`<h1 class="feed-header-title">` + html.EscapeString(title) + `</h1>`)
	}

	showSort := boot.Keyword == "" && boot.Tag == "" && boot.Author == ""
	if showSort {
		tabs := boot.Limits.FeedSortTabs
		if len(tabs) == 0 {
			tabs = []service.FeedSortTab{
				{ID: service.FeedSortReply, Label: "新评论", Enabled: true},
				{ID: service.FeedSortLatest, Label: "新帖子", Enabled: true},
				{ID: service.FeedSortHot, Label: "推荐帖", Enabled: true},
			}
		}
		b.WriteString(`<div class="feed-toolbar"><div class="feed-sort-bar" role="tablist">`)
		for _, tab := range tabs {
			if !tab.Enabled {
				continue
			}
			active := ""
			if tab.ID == boot.Sort {
				active = " active"
			}
			href := ssrFeedURL(boot.BoardID, tab.ID, meta.defSort, meta.permalink, ssrFilterQuery(boot))
			b.WriteString(`<a class="feed-sort-tab` + active + `" href="` + html.EscapeString(href) + `" role="tab">`)
			switch tab.ID {
			case service.FeedSortReply:
				b.WriteString(ssrIconMessageCircle())
			case service.FeedSortHot:
				b.WriteString(ssrIconBadgeCheck())
			default:
				b.WriteString(ssrIconClock())
			}
			b.WriteString(`<span class="feed-sort-tab__label">` + html.EscapeString(tab.Label) + `</span></a>`)
		}
		b.WriteString(`</div>`)
		b.WriteString(`<span class="feed-toolbar__count">共 ` + strconv.FormatInt(boot.PostTotal, 10) + ` 条</span>`)
		b.WriteString(`</div>`)
	}

	b.WriteString(`</div></div>`)

	b.WriteString(`<div class="post-list-scroll post-list-scroll--ssr"><div class="content-surface content-surface--ssr">`)
	if len(boot.Posts) == 0 {
		b.WriteString(`<div class="feed-empty">暂无帖子</div>`)
	} else {
		titleOnly := meta.listStyle == "title"
		needExcerpt := meta.listStyle == "excerpt" || meta.listStyle == "thumbnail"
		needThumb := meta.listStyle == "thumbnail"
		for i := range boot.Posts {
			writeSSRPostRow(b, &boot.Posts[i], boot.BoardID, meta.permalink, boot.Sort, titleOnly, needExcerpt, needThumb)
		}
	}
	b.WriteString(`</div></div></div></div>`)
}

func ssrFilterQuery(boot homeBootPayload) url.Values {
	q := url.Values{}
	if boot.Tag != "" {
		q.Set("tag", boot.Tag)
		return q
	}
	if boot.Keyword != "" {
		q.Set("keyword", boot.Keyword)
		if boot.TitleOnly {
			q.Set("title_only", "1")
		}
	}
	if boot.Author != "" {
		q.Set("author", boot.Author)
	}
	return q
}

func writeSSRPostRow(
	b *strings.Builder,
	post *service.PostListItem,
	currentBoard uint,
	pl service.PermalinkConfig,
	sort string,
	titleOnly, needExcerpt, needThumb bool,
) {
	href := pl.PostPath(post.ID)
	author := service.DisplayName(&post.User)
	if author == "" {
		author = "用户"
	}
	initial := "?"
	if r, _ := utf8.DecodeRuneInString(author); r != utf8.RuneError {
		initial = string(r)
	}

	var excerpt, thumb string
	if needExcerpt || needThumb {
		plain := service.StripHTMLForSearch(service.RedactGatedPostHTML(post.Content))
		excerpt = service.TruncateRunes(plain, 120)
	}
	if needThumb {
		thumb = firstImageSrc(post.Content)
	}

	rowClass := "post-row post-row--v2"
	if titleOnly {
		rowClass += " post-row--title-only"
	}
	if thumb != "" {
		rowClass += " post-row--has-thumb"
	}

	b.WriteString(`<a class="` + rowClass + `" href="` + html.EscapeString(href) + `">`)
	if post.User.Avatar != "" {
		b.WriteString(`<span class="post-avatar user-link--avatar-only"><img src="` + html.EscapeString(post.User.Avatar) + `" alt="" loading="lazy" decoding="async"/></span>`)
	} else {
		b.WriteString(`<span class="post-avatar user-link--avatar-only">` + html.EscapeString(initial) + `</span>`)
	}

	if thumb != "" {
		b.WriteString(`<div class="post-main post-main--with-thumb"><div class="post-content">`)
	} else {
		b.WriteString(`<div class="post-main"><div class="post-text">`)
	}

	b.WriteString(`<div class="post-title-row">`)
	if post.Pinned {
		b.WriteString(`<span class="post-pin-badge" title="全局置顶">全局置顶</span>`)
	}
	if post.BoardPinned {
		b.WriteString(`<span class="post-pin-badge post-pin-badge--board" title="板块置顶">板块置顶</span>`)
	}
	if post.Featured {
		b.WriteString(`<span class="post-feature-badge" title="推荐">推荐</span>`)
	}
	if post.Status == model.ContentStatusPending {
		b.WriteString(`<span class="post-status-badge post-status-badge--pending" title="审核中">审核中</span>`)
	}
	if post.Status == model.ContentStatusRejected {
		b.WriteString(`<span class="post-status-badge post-status-badge--rejected" title="未通过">未通过</span>`)
	}
	b.WriteString(`<span class="post-title">` + html.EscapeString(post.Title) + `</span>`)
	hasTypeBadge := post.PostType == model.PostTypeQuestion ||
		post.PostType == model.PostTypePoll ||
		post.PostType == model.PostTypeLottery ||
		(post.PostType == model.PostTypeBounty && ((post.BountyStatus == model.BountyStatusOpen && post.BountyPoints > 0) ||
			post.BountyStatus == model.BountyStatusAwarded))
	if hasTypeBadge {
		b.WriteString(`<span class="post-title-type-badges">`)
		switch post.PostType {
		case model.PostTypeQuestion:
			if post.QuestionResolved {
				b.WriteString(`<span class="post-qa-badge post-qa-badge--resolved" title="已解决">已解决</span>`)
			} else {
				b.WriteString(`<span class="post-qa-badge post-qa-badge--open" title="未解决">未解决</span>`)
			}
		case model.PostTypePoll:
			b.WriteString(`<span class="post-type-badge post-type-badge--poll" title="投票">投票</span>`)
		case model.PostTypeBounty:
			if post.BountyStatus == model.BountyStatusOpen && post.BountyPoints > 0 {
				b.WriteString(`<span class="post-bounty-badge post-bounty-badge--open" title="悬赏">悬赏 ` + strconv.Itoa(post.BountyPoints) + `</span>`)
			} else if post.BountyStatus == model.BountyStatusAwarded {
				b.WriteString(`<span class="post-bounty-badge post-bounty-badge--awarded" title="已采纳">已采纳</span>`)
			}
		case model.PostTypeLottery:
			if post.LotteryStatus == model.PostLotteryStatusDrawn {
				b.WriteString(`<span class="post-type-badge post-type-badge--lottery" title="抽奖">已开奖</span>`)
			} else {
				b.WriteString(`<span class="post-type-badge post-type-badge--lottery" title="抽奖">抽奖</span>`)
			}
		}
		b.WriteString(`</span>`)
	}
	b.WriteString(`</div>`)
	if excerpt != "" {
		b.WriteString(`<p class="post-excerpt">` + html.EscapeString(excerpt) + `</p>`)
	}

	if thumb != "" {
		b.WriteString(`<div class="post-meta post-meta--inline">`)
	} else {
		b.WriteString(`</div><div class="post-meta">`)
	}

	b.WriteString(`<div class="post-meta-left">`)
	if currentBoard == 0 && post.Board.ID > 0 {
		theme := boardThemeIndex(post.Board.ColorIndex, post.Board.ID)
		// span 壳对齐 .post-list-board-btn 的 margin（外层已是 a，不能嵌 button）
		b.WriteString(`<span class="post-list-board-btn"><span class="post-list-board-badge board-badge board-badge--` + strconv.Itoa(theme) + `">` + html.EscapeString(post.Board.Name) + `</span></span>`)
	}
	b.WriteString(`<span class="post-meta-author">` + html.EscapeString(author) + `</span>`)
	b.WriteString(`<span class="post-meta-sep post-meta-sep--before-time" aria-hidden>·</span>`)
	timeLabel := formatSSRRelativeTime(post.CreatedAt)
	if sort == service.FeedSortReply && post.LastReplyAt == nil {
		timeLabel = "暂无回复"
	}
	b.WriteString(`<span class="post-meta-time post-meta-time--created">` + html.EscapeString(timeLabel) + `</span>`)
	lastName := ""
	if post.LastReplyUser != nil {
		lastName = service.DisplayName(post.LastReplyUser)
	}
	if lastName == "" {
		lastName = strings.TrimSpace(post.LastReplyGuestNick)
	}
	if post.LastReplyAt != nil && lastName != "" {
		// 外层已是 <a class="post-row">，回复人名只能用 span，禁止嵌套 a
		b.WriteString(`<span class="post-meta-last-reply">`)
		b.WriteString(`<span class="post-meta-last-reply-arrow" aria-hidden>←</span>`)
		b.WriteString(`<span class="post-meta-last-reply-user">` + html.EscapeString(lastName) + `</span>`)
		b.WriteString(`<span class="post-meta-last-reply-time">` + html.EscapeString(formatSSRRelativeTime(*post.LastReplyAt)) + `</span>`)
		b.WriteString(`</span>`)
	}
	b.WriteString(`</div>`)

	zero := ""
	if post.CommentCount == 0 {
		zero = " post-stat--zero"
	}
	b.WriteString(`<div class="post-stats"><span class="post-stat` + zero + `" title="评论">` + ssrIconMessageCircle() + strconv.Itoa(post.CommentCount) + `</span></div>`)

	if thumb != "" {
		b.WriteString(`</div></div><div class="post-aside"><div class="post-thumb" aria-hidden><img src="` + html.EscapeString(thumb) + `" alt="" loading="lazy" decoding="async"/></div></div>`)
	} else {
		b.WriteString(`</div>`)
	}
	b.WriteString(`</div></a>`)
}

func writeSSRAside(b *strings.Builder, boot homeBootPayload) {
	b.WriteString(`<aside class="aside-panel"><div class="aside-panel-inner">`)
	brandName := strings.TrimSpace(boot.Branding.Name)
	if brandName == "" {
		brandName = "姜十三论坛"
	}
	intro := strings.TrimSpace(boot.Branding.Description)
	if intro == "" {
		intro = strings.TrimSpace(boot.Branding.Slogan)
	}
	isSiteHome := boot.BoardID == 0 && boot.Keyword == "" && boot.Tag == "" && boot.Author == ""

	b.WriteString(`<div class="widget-card widget-card--about"><div class="widget-card-body"><div class="widget-about-text">`)
	if isSiteHome {
		b.WriteString(`<h1 class="widget-about-title">` + html.EscapeString(brandName) + `</h1>`)
	} else {
		b.WriteString(`<p class="widget-about-title">` + html.EscapeString(brandName) + `</p>`)
	}
	if intro != "" {
		b.WriteString(`<p class="widget-about-desc">` + html.EscapeString(intro) + `</p>`)
	}
	b.WriteString(`</div><div class="widget-stats" aria-label="论坛统计">`)
	b.WriteString(`<div class="widget-stat"><span class="widget-stat-value">` + strconv.FormatInt(boot.Stats.Posts, 10) + `</span><span class="widget-stat-label">帖子</span></div>`)
	b.WriteString(`<div class="widget-stat"><span class="widget-stat-value">` + strconv.FormatInt(boot.Stats.Comments, 10) + `</span><span class="widget-stat-label">回复</span></div>`)
	b.WriteString(`<div class="widget-stat"><span class="widget-stat-value">` + strconv.FormatInt(boot.Stats.Users, 10) + `</span><span class="widget-stat-label">用户</span></div>`)
	b.WriteString(`</div>`)
	writeSSRCheckIn(b, boot)
	b.WriteString(`</div></div>`)

	for _, w := range boot.Limits.AsideWidgets {
		if !w.Enabled {
			continue
		}
		switch w.ID {
		case service.AsideWidgetFriendLinks:
			writeSSRFriendLinks(b, boot)
		case service.AsideWidgetTagCloud:
			writeSSRTagCloud(b, boot)
		case service.AsideWidgetRecentComments:
			writeSSRRecentComments(b, boot)
		case service.AsideWidgetRecentUsers:
			writeSSRRecentUsers(b, boot)
		case service.AsideWidgetShowcase:
			writeSSRShowcase(b, boot)
		}
	}
	b.WriteString(`</div></aside>`)
}

func writeSSRCheckIn(b *strings.Builder, boot homeBootPayload) {
	loggedIn := boot.User != nil && boot.User.ID > 0
	if !loggedIn {
		b.WriteString(`<div class="widget-checkin"><div class="widget-checkin-panel widget-checkin-panel--guest">`)
		b.WriteString(`<div class="widget-checkin-main"><div class="widget-checkin-icon" aria-hidden="true">` + ssrIconCalendarCheck() + `</div>`)
		b.WriteString(`<div class="widget-checkin-info"><span class="widget-checkin-title">每日签到</span>`)
		b.WriteString(`<span class="widget-checkin-meta">登录后每日可得 5–15 积分</span></div></div>`)
		b.WriteString(`<a class="widget-checkin-action" href="/login">` + ssrIconGift() + `登录签到</a>`)
		b.WriteString(`</div></div>`)
		return
	}
	if boot.CheckIn == nil {
		return
	}
	st := boot.CheckIn
	checkedIn := st.CheckedIn
	panelClass := "widget-checkin-panel"
	if checkedIn {
		panelClass += " widget-checkin-panel--done"
	}
	b.WriteString(`<div class="widget-checkin"><div class="` + panelClass + `">`)
	b.WriteString(`<div class="widget-checkin-main"><div class="widget-checkin-icon" aria-hidden="true">`)
	if checkedIn {
		b.WriteString(ssrIconCheck())
	} else {
		b.WriteString(ssrIconCalendarCheck())
	}
	b.WriteString(`</div><div class="widget-checkin-info">`)
	title := "每日签到"
	if checkedIn {
		title = "今日已签到"
	}
	b.WriteString(`<span class="widget-checkin-title">` + title + `</span>`)
	var meta string
	if checkedIn {
		if st.Streak > 0 {
			meta = fmt.Sprintf("连续 %d 天 · 今日已获得 %d 积分", st.Streak, st.TodayPoints)
		} else {
			meta = fmt.Sprintf("今日已获得 %d 积分", st.TodayPoints)
		}
	} else if st.Streak > 0 {
		meta = fmt.Sprintf("连续 %d 天 · 今日可得 %d 积分", st.Streak, st.TodayPoints)
	} else {
		meta = fmt.Sprintf("今日签到可得 %d 积分", st.TodayPoints)
	}
	b.WriteString(`<span class="widget-checkin-meta">` + html.EscapeString(meta) + `</span></div>`)
	if !checkedIn {
		b.WriteString(`<span class="widget-checkin-reward" aria-hidden="true">` + strconv.Itoa(st.TodayPoints) + `</span>`)
	}
	b.WriteString(`</div>`)
	if !checkedIn {
		b.WriteString(`<button type="button" class="widget-checkin-action" disabled>` + ssrIconGift() + `立即签到</button>`)
	}
	b.WriteString(`</div></div>`)
}

func writeSSRFriendLinks(b *strings.Builder, boot homeBootPayload) {
	b.WriteString(`<div class="widget-card widget-card--friend-links">`)
	b.WriteString(`<div class="widget-card-head widget-card-head--split"><span class="widget-card-head-main">`)
	b.WriteString(ssrWidgetIconLink2())
	b.WriteString(`<a class="widget-friend-links-title" href="/links">友情链接</a></span>`)
	b.WriteString(`<a class="widget-friend-links-apply" href="/links?apply=1">申请</a></div>`)
	b.WriteString(`<div class="widget-card-body widget-card-body--friend-links">`)
	links := boot.Branding.FriendLinks
	shown := 0
	if len(links) == 0 {
		b.WriteString(`<div class="widget-empty">暂无友情链接</div>`)
	} else {
		b.WriteString(`<ul class="widget-friend-links-list">`)
		for _, link := range links {
			name := strings.TrimSpace(link.Name)
			u := strings.TrimSpace(link.URL)
			if name == "" || u == "" {
				continue
			}
			b.WriteString(`<li><a href="` + html.EscapeString(u) + `" target="_blank" rel="noopener noreferrer">` + html.EscapeString(name) + `</a></li>`)
			shown++
			if shown >= 8 {
				break
			}
		}
		b.WriteString(`</ul>`)
	}
	b.WriteString(`</div></div>`)
}

func writeSSRTagCloud(b *strings.Builder, boot homeBootPayload) {
	b.WriteString(`<div class="widget-card widget-card--tags"><div class="widget-card-head">`)
	b.WriteString(ssrWidgetIconTags())
	b.WriteString(`标签云</div>`)
	b.WriteString(`<div class="widget-card-body widget-card-body--tags">`)
	if len(boot.Tags) == 0 {
		b.WriteString(`<div class="widget-empty">暂无标签</div>`)
	} else {
		b.WriteString(`<div class="tag-cloud">`)
		for _, t := range boot.Tags {
			href := "/?tag=" + url.QueryEscape(t.Name)
			b.WriteString(`<a class="tag-cloud-item" href="` + html.EscapeString(href) + `">` + html.EscapeString(t.Name) + `</a>`)
		}
		b.WriteString(`</div>`)
	}
	b.WriteString(`</div></div>`)
}

func writeSSRRecentComments(b *strings.Builder, boot homeBootPayload) {
	b.WriteString(`<div class="widget-card"><div class="widget-card-head">`)
	b.WriteString(ssrWidgetIconMessageCircle())
	b.WriteString(`最新评论</div><div class="widget-card-body">`)
	list := boot.RecentComments
	if len(list) > 6 {
		list = list[:6]
	}
	if len(list) == 0 {
		b.WriteString(`<div class="widget-empty">暂无评论</div>`)
	} else {
		pl := boot.Limits
		permalink := service.PermalinkConfig{Enabled: pl.PermalinkEnabled, Ext: pl.PermalinkExt}
		for _, item := range list {
			href := permalink.PostPath(item.PostID)
			if item.Floor > 0 {
				href += "#floor-" + strconv.Itoa(item.Floor)
			}
			initial := "?"
			if r, _ := utf8.DecodeRuneInString(item.Author); r != utf8.RuneError {
				initial = string(r)
			}
			b.WriteString(`<div class="widget-item widget-item--comment">`)
			if item.Avatar != "" {
				b.WriteString(`<span class="widget-item-avatar"><img src="` + html.EscapeString(item.Avatar) + `" alt="" loading="lazy"/></span>`)
			} else {
				b.WriteString(`<span class="widget-item-avatar">` + html.EscapeString(initial) + `</span>`)
			}
			b.WriteString(`<a class="widget-item-comment-main" href="` + html.EscapeString(href) + `">`)
			b.WriteString(`<span class="widget-item-title">` + html.EscapeString(item.Excerpt) + `</span>`)
			b.WriteString(`<span class="widget-item-meta">`)
			if createdAt, err := time.Parse(time.RFC3339, item.CreatedAt); err == nil {
				b.WriteString(`<span class="widget-item-time" title="` + html.EscapeString(formatSSRShortDateTime(createdAt)) + `">` + html.EscapeString(formatSSRRelativeTime(createdAt)) + `</span>`)
			}
			if item.PostTitle != "" {
				b.WriteString(`<span class="widget-item-post-title">` + html.EscapeString(item.PostTitle) + `</span>`)
			}
			b.WriteString(`</span></a></div>`)
		}
	}
	b.WriteString(`</div></div>`)
}

func writeSSRRecentUsers(b *strings.Builder, boot homeBootPayload) {
	b.WriteString(`<div class="widget-card widget-card--users"><div class="widget-card-head">`)
	b.WriteString(ssrWidgetIconUserPlus())
	b.WriteString(`最新注册</div>`)
	b.WriteString(`<div class="widget-card-body widget-card-body--users">`)
	if len(boot.RecentUsers) == 0 {
		b.WriteString(`<div class="widget-empty">暂无用户</div>`)
	} else {
		pl := service.PermalinkConfig{Enabled: boot.Limits.PermalinkEnabled, Ext: boot.Limits.PermalinkExt}
		b.WriteString(`<div class="widget-recent-users-grid">`)
		for _, u := range boot.RecentUsers {
			initial := "?"
			if r, _ := utf8.DecodeRuneInString(u.Nickname); r != utf8.RuneError {
				initial = string(r)
			}
			b.WriteString(`<a class="widget-recent-user-cell" href="` + html.EscapeString(pl.UserPath(u.ID)) + `">`)
			b.WriteString(`<span class="widget-recent-user-avatar" aria-hidden>`)
			if u.Avatar != "" {
				b.WriteString(`<img src="` + html.EscapeString(u.Avatar) + `" alt="" loading="lazy"/>`)
			} else {
				b.WriteString(html.EscapeString(initial))
			}
			b.WriteString(`</span><span class="widget-recent-user-name">` + html.EscapeString(u.Nickname) + `</span></a>`)
		}
		b.WriteString(`</div>`)
	}
	b.WriteString(`</div></div>`)
}

func writeSSRShowcase(b *strings.Builder, boot homeBootPayload) {
	b.WriteString(`<div class="widget-card widget-card--showcase">`)
	b.WriteString(`<div class="widget-card-head widget-card-head--split"><span class="widget-card-head-main">`)
	b.WriteString(ssrWidgetIconEarth())
	b.WriteString(`<a class="widget-friend-links-title" href="/showcase">开源展柜</a></span>`)
	b.WriteString(`<a class="widget-friend-links-more" href="/showcase">全部</a></div>`)
	b.WriteString(`<div class="widget-card-body">`)
	if len(boot.Showcase) == 0 {
		b.WriteString(`<div class="widget-empty">暂无展柜站点</div>`)
	} else {
		n := len(boot.Showcase)
		if n > 6 {
			n = 6
		}
		for i := 0; i < n; i++ {
			item := boot.Showcase[i]
			b.WriteString(`<a class="widget-item" href="` + html.EscapeString(item.SiteURL) + `" target="_blank" rel="noopener noreferrer">`)
			b.WriteString(`<span class="widget-item-title">` + html.EscapeString(item.SiteName) + `</span>`)
			if item.Version != "" {
				b.WriteString(`<span class="widget-item-meta">` + html.EscapeString(item.Version) + `</span>`)
			}
			b.WriteString(`</a>`)
		}
	}
	b.WriteString(`</div></div>`)
}

func writeSSRFooter(b *strings.Builder, boot homeBootPayload, meta homeSSRMeta) {
	brandName := strings.TrimSpace(boot.Branding.Name)
	if brandName == "" {
		brandName = "姜十三论坛"
	}
	year := time.Now().Year()
	b.WriteString(`<footer class="site-footer"><div class="site-footer__inner">`)
	b.WriteString(`<div class="site-footer__meta"><span class="site-footer__copy">© ` + strconv.Itoa(year) + ` ` + html.EscapeString(brandName) + `</span>`)
	if s := strings.TrimSpace(boot.Branding.Slogan); s != "" {
		b.WriteString(`<span class="site-footer__sep" aria-hidden>·</span><span class="site-footer__slogan">` + html.EscapeString(s) + `</span>`)
	}
	b.WriteString(`</div><nav class="site-footer__nav" aria-label="站点链接">`)
	first := true
	writeSep := func() {
		if !first {
			b.WriteString(`<span class="site-footer__sep" aria-hidden>·</span>`)
		}
		first = false
	}
	if boot.Limits.FooterShowFriendLinks {
		writeSep()
		b.WriteString(`<span class="site-footer__friend"><a href="/links">友情链接</a></span>`)
	}
	if boot.Limits.FooterShowShowcase {
		writeSep()
		b.WriteString(`<span class="site-footer__friend"><a href="/showcase">开源展柜</a></span>`)
	}
	for _, p := range boot.Pages {
		if !p.ShowInFooter {
			continue
		}
		writeSep()
		b.WriteString(`<span class="site-footer__friend"><a href="` + html.EscapeString(meta.permalink.PagePath(p.Slug)) + `">` + html.EscapeString(p.Title) + `</a></span>`)
	}
	if icp := strings.TrimSpace(boot.Branding.ICPBeian); icp != "" {
		writeSep()
		icpURL := strings.TrimSpace(boot.Branding.ICPBeianURL)
		if icpURL == "" {
			icpURL = "https://beian.miit.gov.cn/"
		}
		b.WriteString(`<a class="site-footer__icp" href="` + html.EscapeString(icpURL) + `" target="_blank" rel="noopener noreferrer">` + html.EscapeString(icp) + `</a>`)
	}
	b.WriteString(`</nav></div></footer>`)
}

func boardThemeIndex(colorIndex int, id uint) int {
	const n = 8
	if colorIndex >= 0 {
		return colorIndex % n
	}
	return int(id % uint(n))
}

func firstImageSrc(htmlContent string) string {
	m := firstImgSrcRe.FindStringSubmatch(htmlContent)
	if len(m) < 2 {
		return ""
	}
	src := strings.TrimSpace(m[1])
	if src == "" || strings.HasPrefix(src, "data:") {
		return ""
	}
	return src
}

func formatSSRTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Local().Format("01-02 15:04")
}

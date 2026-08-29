package web

import (
	"strings"

	"git.iioio.com/freefire/jiang13-forum/modules/webctx"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

// Deps 页面依赖
type Deps struct {
	DataDir   string
	JWTSecret string
	Settings  *services.ForumSettingsService
	Auth      *services.AuthService
	User      *services.UserService
	Board     *services.BoardService
	Post      *services.PostService
	Comment   *services.CommentService
	Message   *services.MessageService
	Filter    *services.SensitiveFilter
	Limiter   *services.RateLimiter
	EmailCode *services.EmailCodeService
	Store      *services.UploadStore
	Points     *services.PointsService
	FriendLink *services.FriendLinkApplyService
	Mail       *services.MailService
	SitePage   *services.SitePageService
	Report     *services.ReportService
	Captcha    *services.CaptchaService
}

// SitePageLink 导航/页脚站点单页链接
type SitePageLink struct {
	Title string
	Slug  string
}

// BoardView 侧栏
type BoardView struct {
	ID   uint
	Name string
}

// RightAsideHotPost 右栏热门帖
type RightAsideHotPost struct {
	ID    uint
	Title string
}

// RightAsideTag 右栏标签
type RightAsideTag struct {
	Name  string
	Count int
}

// RightAsideComment 右栏最新评论
type RightAsideComment struct {
	PostID    uint
	Author    string
	Excerpt   string
	PostTitle string
}

// RightAsideUser 右栏最新用户
type RightAsideUser struct {
	ID       uint
	Nickname string
}

// RightAsideFriendLink 右栏友链
type RightAsideFriendLink struct {
	Name string
	URL  string
	Logo string
}

// RightAsideWidget 按 aside_widgets 顺序的一块（仅已开启）
type RightAsideWidget struct {
	Kind        string // tag_cloud | recent_comments | recent_users | friend_links
	Tags        []RightAsideTag
	Comments    []RightAsideComment
	Users       []RightAsideUser
	FriendLinks []RightAsideFriendLink
}

// RightAsideData 右栏：签到条 + 固定热门 + 可配置 widgets
type RightAsideData struct {
	ShowCheckIn    bool
	CheckedIn      bool
	CheckInStreak  int
	CheckInPoints  int // 已签实得或预计可得
	LotteryDrawn   bool
	LotteryPoints  int
	LotteryCost    int
	HotPosts       []RightAsideHotPost
	Widgets        []RightAsideWidget
}

// PageChrome 布局公共字段
type PageChrome struct {
	Title                 string
	Description           string
	SiteName              string
	Slogan                string
	LogoMark              string
	LoggedIn              bool
	IsAdmin               bool
	ViewerName            string
	Boards                []BoardView
	ActiveBoard           uint
	Path                  string // 当前请求路径，供侧栏高亮
	Inner                 string // 保留字段；入口模板已固定组合，不再动态 template
	CSRF                  string
	Flash                 string
	Error                 string
	UnreadCount           int64 // 登录用户未读私信/通知总数；未登录为 0
	ViewerPoints          int   // 登录用户当前积分；未登录为 0
	ShowFriendLinksNav    bool
	ShowFriendLinksFooter bool
	NavPages              []SitePageLink
	FooterPages           []SitePageLink
	RightAside            RightAsideData
}

func (d Deps) ctx(c *gin.Context) *webctx.Context {
	return webctx.New(c, d.JWTSecret)
}

func (d Deps) chrome(ctx *webctx.Context, title, desc, inner string) PageChrome {
	brand := d.Settings.SiteBranding()
	if title == "" {
		title = brand.DocumentTitle()
	}
	if desc == "" {
		desc = brand.MetaDescription()
	}
	name := "我的"
	if ctx.IsSigned() {
		name = strings.TrimSpace(ctx.Doer.Nickname)
		if name == "" {
			name = ctx.Doer.Username
		}
	}
	boards, _ := d.Board.List()
	bv := make([]BoardView, 0, len(boards))
	for _, b := range boards {
		bv = append(bv, BoardView{ID: b.ID, Name: b.Name})
	}
	var unread int64
	if ctx.IsSigned() && d.Message != nil {
		unread, _ = d.Message.UnreadCount(ctx.UserID())
	}
	viewerPoints := 0
	if ctx.IsSigned() && ctx.Doer != nil {
		viewerPoints = ctx.Doer.Points
	}
	path := ""
	if ctx.C != nil && ctx.C.Request != nil && ctx.C.Request.URL != nil {
		path = ctx.C.Request.URL.Path
	}
	navPages, footerPages := d.sitePageLinks()
	return PageChrome{
		Title:                 title,
		Description:           desc,
		SiteName:              brand.Name,
		Slogan:                brand.Slogan,
		LogoMark:              firstRuneOr(brand.LogoMark, "姜"),
		LoggedIn:              ctx.IsSigned(),
		IsAdmin:               ctx.IsAdmin(),
		ViewerName:            name,
		Boards:                bv,
		Path:                  path,
		Inner:                 inner,
		CSRF:                  ctx.EnsureCSRF(),
		Flash:                 ctx.TakeFlash(),
		UnreadCount:           unread,
		ViewerPoints:          viewerPoints,
		ShowFriendLinksNav:    d.Settings.NavShowFriendLinks(),
		ShowFriendLinksFooter: d.Settings.FooterShowFriendLinks(),
		NavPages:              navPages,
		FooterPages:           footerPages,
		RightAside:            d.loadRightAside(ctx, brand),
	}
}

func (d Deps) sitePageLinks() (nav, footer []SitePageLink) {
	nav, footer = []SitePageLink{}, []SitePageLink{}
	if d.SitePage == nil {
		return
	}
	list, err := d.SitePage.ListPublished()
	if err != nil {
		return
	}
	for _, p := range list {
		link := SitePageLink{Title: p.Title, Slug: p.Slug}
		if p.ShowInNav {
			nav = append(nav, link)
		}
		if p.ShowInFooter {
			footer = append(footer, link)
		}
	}
	return
}

const (
	rightAsideHotLimit     = 5
	rightAsideTagLimit     = 24
	rightAsideCommentLimit = 8
	rightAsideUserLimit    = 8
)

func (d Deps) loadRightAside(ctx *webctx.Context, brand services.SiteBranding) RightAsideData {
	out := RightAsideData{
		HotPosts: []RightAsideHotPost{},
		Widgets:  []RightAsideWidget{},
	}
	if ctx.IsSigned() && d.Points != nil {
		out.ShowCheckIn = true
		if st, err := d.Points.GetCheckInStatus(ctx.UserID()); err == nil {
			out.CheckedIn = st.CheckedIn
			out.CheckInStreak = st.Streak
			out.CheckInPoints = st.TodayPoints
		}
		if st, err := d.Points.GetLotteryStatus(ctx.UserID()); err == nil {
			out.LotteryDrawn = st.Drawn
			out.LotteryPoints = st.Points
			out.LotteryCost = st.Cost
		}
	}
	if d.Post != nil {
		if items, err := d.Post.HotPosts(rightAsideHotLimit); err == nil {
			for _, it := range items {
				out.HotPosts = append(out.HotPosts, RightAsideHotPost{ID: it.ID, Title: it.Title})
			}
		}
	}
	for _, w := range d.Settings.AsideWidgets() {
		if !w.Enabled {
			continue
		}
		block := RightAsideWidget{Kind: w.ID}
		switch w.ID {
		case services.AsideWidgetTagCloud:
			if d.Post != nil {
				if tags, err := d.Post.PopularTags(rightAsideTagLimit); err == nil {
					for _, t := range tags {
						block.Tags = append(block.Tags, RightAsideTag{Name: t.Name, Count: t.Count})
					}
				}
			}
		case services.AsideWidgetRecentComments:
			if d.Comment != nil {
				if list, err := d.Comment.ListRecentPublic(rightAsideCommentLimit); err == nil {
					for _, c := range list {
						block.Comments = append(block.Comments, RightAsideComment{
							PostID: c.PostID, Author: c.Author, Excerpt: c.Excerpt, PostTitle: c.PostTitle,
						})
					}
				}
			}
		case services.AsideWidgetRecentUsers:
			if d.User != nil {
				if list, err := d.User.ListRecentRegistered(rightAsideUserLimit); err == nil {
					for _, u := range list {
						block.Users = append(block.Users, RightAsideUser{ID: u.ID, Nickname: u.Nickname})
					}
				}
			}
		case services.AsideWidgetFriendLinks:
			for _, l := range brand.FriendLinks {
				block.FriendLinks = append(block.FriendLinks, RightAsideFriendLink{Name: l.Name, URL: l.URL, Logo: l.Logo})
			}
		default:
			continue
		}
		out.Widgets = append(out.Widgets, block)
	}
	return out
}

func firstRuneOr(s, fallback string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return fallback
	}
	for _, r := range s {
		return string(r)
	}
	return fallback
}

func stripIDParam(raw, permalinkExt string) string {
	raw = strings.TrimSpace(raw)
	if permalinkExt != "" {
		raw = strings.TrimSuffix(raw, "."+permalinkExt)
	}
	raw = strings.TrimSuffix(raw, ".html")
	raw = strings.TrimSuffix(raw, ".htm")
	return raw
}

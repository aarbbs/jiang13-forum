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
	Store     *services.UploadStore
	Points    *services.PointsService
}

// BoardView 侧栏
type BoardView struct {
	ID   uint
	Name string
}

// PageChrome 布局公共字段
type PageChrome struct {
	Title       string
	Description string
	SiteName    string
	Slogan      string
	LogoMark    string
	LoggedIn    bool
	IsAdmin     bool
	ViewerName  string
	Boards      []BoardView
	ActiveBoard uint
	Inner       string // 保留字段；入口模板已固定组合，不再动态 template
	CSRF        string
	Flash       string
	Error       string
	UnreadCount  int64 // 登录用户未读私信/通知总数；未登录为 0
	ViewerPoints int   // 登录用户当前积分；未登录为 0
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
	return PageChrome{
		Title:        title,
		Description:  desc,
		SiteName:     brand.Name,
		Slogan:       brand.Slogan,
		LogoMark:     firstRuneOr(brand.LogoMark, "姜"),
		LoggedIn:     ctx.IsSigned(),
		IsAdmin:      ctx.IsAdmin(),
		ViewerName:   name,
		Boards:       bv,
		Inner:        inner,
		CSRF:         ctx.EnsureCSRF(),
		Flash:        ctx.TakeFlash(),
		UnreadCount:  unread,
		ViewerPoints: viewerPoints,
	}
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

package web

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"git.iioio.com/freefire/jiang13-forum/middleware"
	"git.iioio.com/freefire/jiang13-forum/model"
	"git.iioio.com/freefire/jiang13-forum/modules/webrender"
	"git.iioio.com/freefire/jiang13-forum/service"
	"github.com/gin-gonic/gin"
)

// Deps 页面路由依赖（复用现有 service，避免 Phase 1 大搬家）
type Deps struct {
	Settings *service.ForumSettingsService
	Board    *service.BoardService
	Post     *service.PostService
}

// BoardView 侧栏板块
type BoardView struct {
	ID   uint
	Name string
}

// PostView 列表项
type PostView struct {
	ID           uint
	Title        string
	AuthorName   string
	BoardName    string
	Pinned       bool
	Featured     bool
	CommentCount int
	CreatedLabel string
}

// HomePageData 首页 / 板块 Feed
type HomePageData struct {
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
	BoardName   string
	Sort        string
	Posts       []PostView
	Page        int
	PrevPage    int
	NextPage    int
	HasPrev     bool
	HasMore     bool
}

// Register 注册已迁移的 SSR 页面（优先于 SPA）
func Register(r *gin.Engine, deps Deps, authMW *middleware.AuthMiddleware) {
	g := r.Group("/", authMW.OptionalAuth())
	g.GET("/", deps.Home)
	g.GET("/board/:id", deps.Home)
}

// Home SSR 首页与板块列表
func (d Deps) Home(c *gin.Context) {
	brand := d.Settings.SiteBranding()
	sort := c.DefaultQuery("sort", "latest")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	size := d.Settings.PageSizeDefault()

	var boardID uint
	var boardName string
	if idStr := c.Param("id"); idStr != "" {
		// 兼容伪静态后缀 123.html
		idStr = strings.TrimSuffix(idStr, "."+d.Settings.Permalink().Ext)
		idStr = strings.TrimSuffix(idStr, ".html")
		idStr = strings.TrimSuffix(idStr, ".htm")
		if n, err := strconv.ParseUint(idStr, 10, 64); err == nil {
			boardID = uint(n)
		}
	}

	boards, _ := d.Board.List()
	boardViews := make([]BoardView, 0, len(boards))
	for _, b := range boards {
		boardViews = append(boardViews, BoardView{ID: b.ID, Name: b.Name})
		if b.ID == boardID {
			boardName = b.Name
		}
	}

	var uid uint
	if v, ok := c.Get(middleware.CtxUserID); ok {
		uid, _ = v.(uint)
	}
	isAdmin := false
	if v, ok := c.Get(middleware.CtxRole); ok {
		switch r := v.(type) {
		case model.Role:
			isAdmin = r == model.RoleAdmin
		case string:
			isAdmin = r == string(model.RoleAdmin)
		}
	}
	username, _ := c.Get(middleware.CtxUsername)

	q := service.PostListQuery{
		BoardID:       boardID,
		Page:          page,
		Size:          size,
		Sort:          sort,
		ViewerID:      uid,
		ViewerIsAdmin: isAdmin,
	}
	items, total, err := d.Post.ListItems(q)
	if err != nil {
		c.String(http.StatusInternalServerError, "加载帖子失败")
		return
	}

	posts := make([]PostView, 0, len(items))
	for _, it := range items {
		author := strings.TrimSpace(it.User.Nickname)
		if author == "" {
			author = it.User.Username
		}
		bname := ""
		if it.Board.ID > 0 {
			bname = it.Board.Name
		}
		posts = append(posts, PostView{
			ID:           it.ID,
			Title:        it.Title,
			AuthorName:   author,
			BoardName:    bname,
			Pinned:       it.Pinned,
			Featured:     it.Featured,
			CommentCount: it.CommentCount,
			CreatedLabel: formatTime(it.CreatedAt),
		})
	}

	title := brand.DocumentTitle()
	if boardName != "" {
		title = boardName + " · " + brand.Name
	}

	data := HomePageData{
		Title:       title,
		Description: brand.MetaDescription(),
		SiteName:    brand.Name,
		Slogan:      brand.Slogan,
		LogoMark:    firstRuneOr(brand.LogoMark, "姜"),
		LoggedIn:    uid > 0,
		IsAdmin:     isAdmin,
		ViewerName:  fmtViewer(username),
		Boards:      boardViews,
		ActiveBoard: boardID,
		BoardName:   boardName,
		Sort:        normalizeSort(sort),
		Posts:       posts,
		Page:        page,
		PrevPage:    page - 1,
		NextPage:    page + 1,
		HasPrev:     page > 1,
		HasMore:     int64(page*size) < total,
	}

	c.Header("Content-Type", "text/html; charset=utf-8")
	c.Status(http.StatusOK)
	if err := webrender.Execute(c.Writer, "home", data); err != nil {
		c.String(http.StatusInternalServerError, "模板渲染失败: %v", err)
	}
}

func normalizeSort(s string) string {
	switch s {
	case "reply", "hot":
		return s
	default:
		return "latest"
	}
}

func formatTime(t time.Time) string {
	return t.Local().Format("2006-01-02 15:04")
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

func fmtViewer(v any) string {
	if v == nil {
		return "我的"
	}
	s, _ := v.(string)
	s = strings.TrimSpace(s)
	if s == "" {
		return "我的"
	}
	return s
}

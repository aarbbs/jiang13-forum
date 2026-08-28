package web

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"git.iioio.com/freefire/jiang13-forum/modules/auth"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

// Register 注册已安装后的 web 路由
func Register(r *gin.Engine, deps Deps, authMW *auth.AuthMiddleware) {
	g := r.Group("/", authMW.OptionalAuth())
	g.GET("/", deps.Home)
	g.GET("/board/:id", deps.Home)
	g.GET("/post/:id", deps.PostView)
	g.GET("/post/:id/edit", authMW.RequireAuth(), deps.PostEditGet)
	g.POST("/post/:id/edit", authMW.RequireAuth(), deps.PostEditPost)
	g.POST("/post/:id/comments", authMW.RequireAuth(), deps.PostComment)
	g.POST("/post/:id/like", authMW.RequireAuth(), deps.PostLike)
	g.POST("/post/:id/favorite", authMW.RequireAuth(), deps.PostFavorite)
	g.GET("/login", deps.LoginGet)
	g.POST("/login", deps.LoginPost)
	g.POST("/logout", deps.LogoutPost)
	g.GET("/register", deps.RegisterGet)
	g.POST("/register", deps.RegisterPost)
	g.POST("/register/send-code", deps.RegisterSendCode)
	g.GET("/compose", authMW.RequireAuth(), deps.ComposeGet)
	g.POST("/compose", authMW.RequireAuth(), deps.ComposePost)
	g.POST("/compose/upload", authMW.RequireAuth(), deps.ComposeUpload)
	g.GET("/admin/login", func(c *gin.Context) { c.Redirect(http.StatusFound, "/login?redirect=/admin/dashboard") })

	admin := g.Group("/admin", authMW.RequireAuth(), authMW.RequireAdmin())
	{
		admin.GET("", func(c *gin.Context) { c.Redirect(http.StatusFound, "/admin/dashboard") })
		admin.GET("/dashboard", deps.AdminDashboard)
		admin.GET("/boards", deps.AdminBoardsGet)
		admin.POST("/boards", deps.AdminBoardCreate)
		admin.POST("/boards/:id", deps.AdminBoardUpdate)
		admin.POST("/boards/:id/delete", deps.AdminBoardDelete)
		admin.GET("/moderation", deps.AdminModerationGet)
		admin.POST("/posts/:id/approve", deps.AdminPostApprove)
		admin.POST("/posts/:id/reject", deps.AdminPostReject)
		admin.POST("/comments/:id/approve", deps.AdminCommentApprove)
		admin.POST("/comments/:id/reject", deps.AdminCommentReject)
		admin.GET("/settings", deps.AdminSettingsGet)
		admin.POST("/settings/brand", deps.AdminSettingsBrandPost)
		admin.POST("/settings/limits", deps.AdminSettingsLimitsPost)
		admin.POST("/settings/filter-words", deps.AdminSettingsFilterWordsPost)
	}

	g.GET("/profile", deps.PendingPage)
	g.GET("/messages", deps.PendingPage)
	g.GET("/favorites", deps.PendingPage)
	g.GET("/projects", deps.PendingPage)
	g.GET("/links", deps.PendingPage)
	g.GET("/boards", deps.PendingPage)
}

// HomePageData Feed
type HomePageData struct {
	PageChrome
	BoardName string
	Sort      string
	Posts     []PostListItem
	Page      int
	PrevPage  int
	NextPage  int
	HasPrev   bool
	HasMore   bool
}

// PostListItem 列表项
type PostListItem struct {
	ID           uint
	Title        string
	AuthorName   string
	BoardName    string
	Pinned       bool
	Featured     bool
	CommentCount int
	CreatedLabel string
}

// Home 首页 / 板块
func (d Deps) Home(c *gin.Context) {
	ctx := d.ctx(c)
	sort := normalizeSort(c.DefaultQuery("sort", "latest"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	size := d.Settings.PageSizeDefault()

	var boardID uint
	var boardName string
	if idStr := c.Param("id"); idStr != "" {
		idStr = stripIDParam(idStr, d.Settings.Permalink().Ext)
		if n, err := strconv.ParseUint(idStr, 10, 64); err == nil {
			boardID = uint(n)
		}
	}

	chrome := d.chrome(ctx, "", "", "home/feed")
	chrome.ActiveBoard = boardID
	for _, b := range chrome.Boards {
		if b.ID == boardID {
			boardName = b.Name
			break
		}
	}
	if boardName != "" {
		chrome.Title = boardName + " · " + chrome.SiteName
	}

	items, total, err := d.Post.ListItems(services.PostListQuery{
		BoardID:       boardID,
		Page:          page,
		Size:          size,
		Sort:          sort,
		ViewerID:      ctx.UserID(),
		ViewerIsAdmin: ctx.IsAdmin(),
	})
	if err != nil {
		c.String(http.StatusInternalServerError, "加载帖子失败")
		return
	}

	posts := make([]PostListItem, 0, len(items))
	for _, it := range items {
		author := strings.TrimSpace(it.User.Nickname)
		if author == "" {
			author = it.User.Username
		}
		bname := ""
		if it.Board.ID > 0 {
			bname = it.Board.Name
		}
		posts = append(posts, PostListItem{
			ID: it.ID, Title: it.Title, AuthorName: author, BoardName: bname,
			Pinned: it.Pinned, Featured: it.Featured, CommentCount: it.CommentCount,
			CreatedLabel: it.CreatedAt.Local().Format("2006-01-02 15:04"),
		})
	}

	ctx.HTML(http.StatusOK, "home", HomePageData{
		PageChrome: chrome,
		BoardName:  boardName,
		Sort:       sort,
		Posts:      posts,
		Page:       page,
		PrevPage:   page - 1,
		NextPage:   page + 1,
		HasPrev:    page > 1,
		HasMore:    int64(page*size) < total,
	})
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

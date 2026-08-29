package web

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
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
	g.GET("/post/:id/revisions", authMW.RequireAuth(), deps.PostRevisionsGet)
	g.GET("/post/:id/revisions/:rid", authMW.RequireAuth(), deps.PostRevisionDetailGet)
	g.POST("/post/:id/comments", authMW.RequireAuth(), deps.PostComment)
	g.GET("/post/:id/comments/:cid/edit", authMW.RequireAuth(), deps.CommentEditGet)
	g.POST("/post/:id/comments/:cid/edit", authMW.RequireAuth(), deps.CommentEditPost)
	g.POST("/post/:id/comments/:cid/delete", authMW.RequireAuth(), deps.CommentDeletePost)
	g.POST("/post/:id/comments/:cid/like", authMW.RequireAuth(), deps.PostCommentLike)
	g.POST("/post/:id/like", authMW.RequireAuth(), deps.PostLike)
	g.POST("/post/:id/favorite", authMW.RequireAuth(), deps.PostFavorite)
	g.POST("/post/:id/poll/vote", authMW.RequireAuth(), deps.PostPollVote)
	g.POST("/post/:id/poll/close", authMW.RequireAuth(), deps.PostPollClose)
	g.POST("/post/:id/question/resolve", authMW.RequireAuth(), deps.PostQuestionResolvePost)
	g.POST("/post/:id/bounty/award", authMW.RequireAuth(), deps.PostBountyAwardPost)
	g.POST("/post/:id/bounty/refund", authMW.RequireAuth(), deps.PostBountyRefundPost)
	g.POST("/post/:id/lottery/draw", authMW.RequireAuth(), deps.PostLotteryDrawPost)
	g.POST("/post/:id/unlock", authMW.RequireAuth(), deps.PostUnlock)
	g.POST("/post/:id/report", authMW.RequireAuth(), deps.PostReportPost)
	g.POST("/post/:id/comments/:cid/report", authMW.RequireAuth(), deps.CommentReportPost)
	g.POST("/post/:id/admin/pin", authMW.RequireAuth(), authMW.RequireAdmin(), deps.AdminPostPinPost)
	g.POST("/post/:id/admin/board-pin", authMW.RequireAuth(), authMW.RequireAdmin(), deps.AdminPostBoardPinPost)
	g.POST("/post/:id/admin/feature", authMW.RequireAuth(), authMW.RequireAdmin(), deps.AdminPostFeaturePost)
	g.POST("/post/:id/admin/edit-lock", authMW.RequireAuth(), authMW.RequireAdmin(), deps.AdminPostEditLockPost)
	g.POST("/post/:id/admin/comments-lock", authMW.RequireAuth(), authMW.RequireAdmin(), deps.AdminPostCommentsLockPost)
	g.POST("/post/:id/admin/delete", authMW.RequireAuth(), authMW.RequireAdmin(), deps.AdminPostDeletePost)
	g.GET("/login", deps.LoginGet)
	g.POST("/login", deps.LoginPost)
	g.POST("/logout", deps.LogoutPost)
	g.GET("/register", deps.RegisterGet)
	g.POST("/register", deps.RegisterPost)
	g.POST("/register/send-code", deps.RegisterSendCode)
	g.GET("/forgot-password", deps.ForgotPasswordGet)
	g.POST("/forgot-password", deps.ForgotPasswordPost)
	g.POST("/forgot-password/send-code", deps.ForgotPasswordSendCode)
	g.GET("/compose", authMW.RequireAuth(), deps.ComposeGet)
	g.POST("/compose", authMW.RequireAuth(), deps.ComposePost)
	g.POST("/compose/upload", authMW.RequireAuth(), deps.ComposeUpload)
	g.POST("/compose/preview", authMW.RequireAuth(), deps.ComposePreview)
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
		admin.POST("/settings/brand/upload", deps.AdminSettingsBrandUploadPost)
		admin.POST("/settings/brand/clear", deps.AdminSettingsBrandClearPost)
		admin.POST("/settings/limits", deps.AdminSettingsLimitsPost)
		admin.POST("/settings/content-limits", deps.AdminSettingsContentLimitsPost)
		admin.POST("/settings/permalink", deps.AdminSettingsPermalinkPost)
		admin.POST("/settings/filter-words", deps.AdminSettingsFilterWordsPost)
		admin.POST("/settings/mail", deps.AdminSettingsMailPost)
		admin.POST("/settings/mail/test", deps.AdminSettingsMailTestPost)
		admin.POST("/settings/aside-widgets", deps.AdminSettingsAsideWidgetsPost)
		admin.POST("/settings/backup", deps.AdminSettingsBackupPost)
		admin.GET("/settings/backup/download/:name", deps.AdminSettingsBackupDownload)
		admin.GET("/friend-links", deps.AdminFriendLinksGet)
		admin.POST("/friend-links/settings", deps.AdminFriendLinksSettingsPost)
		admin.POST("/friend-links/brand", deps.AdminFriendLinksBrandAddPost)
		admin.POST("/friend-links/brand/delete", deps.AdminFriendLinksBrandDeletePost)
		admin.POST("/friend-links/applies/:id/approve", deps.AdminFriendLinkApprovePost)
		admin.POST("/friend-links/applies/:id/reject", deps.AdminFriendLinkRejectPost)
		admin.POST("/friend-links/applies/:id/recheck", deps.AdminFriendLinkRecheckPost)
		admin.GET("/pages", deps.AdminPagesGet)
		admin.POST("/pages", deps.AdminPageCreate)
		admin.GET("/pages/:id/edit", deps.AdminPageEditGet)
		admin.POST("/pages/:id", deps.AdminPageUpdate)
		admin.POST("/pages/:id/delete", deps.AdminPageDelete)
		admin.POST("/pages/:id/publish", deps.AdminPagePublishPost)
		admin.GET("/reports", deps.AdminReportsGet)
		admin.POST("/reports/:id/handle", deps.AdminReportHandlePost)
		admin.GET("/users", deps.AdminUsersGet)
		admin.POST("/users/:id/ban", deps.AdminUserBanPost)
		admin.POST("/users/:id/verify", deps.AdminUserVerifyPost)
		admin.POST("/users/:id/points", deps.AdminUserPointsPost)
		admin.POST("/users/:id/level", deps.AdminUserLevelPost)
		admin.GET("/badges", deps.AdminBadgesGet)
		admin.POST("/badges", deps.AdminBadgeCreate)
		admin.POST("/badges/award", deps.AdminBadgeAwardPost)
		admin.POST("/badges/revoke", deps.AdminBadgeRevokePost)
		admin.GET("/badges/:id/edit", deps.AdminBadgeEditGet)
		admin.POST("/badges/:id", deps.AdminBadgeUpdate)
		admin.POST("/badges/:id/delete", deps.AdminBadgeDelete)
		admin.GET("/media", deps.AdminMediaGet)
		admin.POST("/media/delete", deps.AdminMediaBatchDeletePost)
		admin.POST("/media/sync", deps.AdminMediaSyncPost)
		admin.POST("/media/:id/delete", deps.AdminMediaDeletePost)
		admin.GET("/trash", deps.AdminTrashGet)
		admin.POST("/trash/:id/restore", deps.AdminTrashRestorePost)
		admin.POST("/trash/:id/purge", deps.AdminTrashPurgePost)
	}

	g.GET("/user/:id", deps.UserPublic)
	g.GET("/profile", authMW.RequireAuth(), deps.ProfileGet)
	g.POST("/profile/nickname", authMW.RequireAuth(), deps.ProfileNicknamePost)
	g.POST("/profile/signature", authMW.RequireAuth(), deps.ProfileSignaturePost)
	g.POST("/profile/password", authMW.RequireAuth(), deps.ProfilePasswordPost)
	g.POST("/profile/avatar", authMW.RequireAuth(), deps.ProfileAvatarPost)
	g.POST("/profile/checkin", authMW.RequireAuth(), deps.ProfileCheckInPost)
	g.POST("/profile/lottery", authMW.RequireAuth(), deps.ProfileLotteryPost)
	g.GET("/favorites", authMW.RequireAuth(), deps.FavoritesGet)
	g.GET("/messages", authMW.RequireAuth(), deps.MessagesList)
	g.GET("/messages/with/:peerId", authMW.RequireAuth(), deps.MessagesThread)
	g.POST("/messages/with/:peerId", authMW.RequireAuth(), deps.MessagesSend)
	g.POST("/messages/read-all", authMW.RequireAuth(), deps.MessagesReadAll)
	g.GET("/links", deps.LinksGet)
	g.POST("/links/apply", authMW.RequireAuth(), deps.LinksApplyPost)
	g.POST("/links/apply/:id/cancel", authMW.RequireAuth(), deps.LinksApplyCancelPost)
	g.POST("/links/logo", authMW.RequireAuth(), deps.LinksLogoUpload)
	g.GET("/projects", deps.PendingPage)
	g.GET("/boards", deps.BoardsGet)
	g.GET("/page/:slug", deps.SitePageGet)
}

// HomePageData Feed
type HomePageData struct {
	PageChrome
	BoardName     string
	Sort          string
	Keyword       string
	Tag           string
	Author        string
	TitleOnly     bool
	HasSearch     bool
	SearchError   string
	FeedListStyle string // title|excerpt|thumbnail
	ShowExcerpt   bool
	Posts         []PostListItem
	Page          int
	PrevPage      int
	NextPage      int
	HasPrev       bool
	HasMore       bool
}

// PostListItem 列表项（对齐 main SPA post-row--v2）
type PostListItem struct {
	ID               uint
	Title            string
	Href             string
	AuthorID         uint
	AuthorName       string
	AuthorHref       string
	AvatarURL        string
	AuthorMark       string
	BoardID          uint
	BoardName        string
	BoardHref        string
	BoardColorSlot   int
	ShowBoardBadge   bool
	Excerpt          string
	ThumbURL         string
	Pinned           bool
	BoardPinned      bool
	Featured         bool
	CommentCount     int
	LikeCount        int
	ViewCount        int
	CreatedLabel     string
	LastReplyLabel   string
	LastReplyName    string
	LastReplyHref    string
	ShowLastReply    bool
}

// FormAction 搜索表单提交路径（当前 Feed）
func (d HomePageData) FormAction() string {
	if d.ActiveBoard > 0 {
		return fmt.Sprintf("/board/%d%s", d.ActiveBoard, d.PermalinkSuffix)
	}
	return "/"
}

// SortHref 排序链接，保留搜索参数
func (d HomePageData) SortHref(sort string) string {
	return buildFeedURL(d.ActiveBoard, d.PermalinkSuffix, sort, 0, d.Keyword, d.Tag, d.Author, d.TitleOnly)
}

// PageHref 分页链接，保留搜索与排序
func (d HomePageData) PageHref(page int) string {
	return buildFeedURL(d.ActiveBoard, d.PermalinkSuffix, d.Sort, page, d.Keyword, d.Tag, d.Author, d.TitleOnly)
}

func buildFeedURL(boardID uint, permalinkSuffix, sort string, page int, keyword, tag, author string, titleOnly bool) string {
	q := url.Values{}
	if sort != "" && sort != "latest" {
		q.Set("sort", sort)
	}
	if page > 1 {
		q.Set("page", strconv.Itoa(page))
	}
	if kw := strings.TrimSpace(keyword); kw != "" {
		q.Set("keyword", kw)
	}
	if t := strings.TrimSpace(tag); t != "" {
		q.Set("tag", t)
	}
	if a := strings.TrimSpace(author); a != "" {
		q.Set("author", a)
	}
	if titleOnly {
		q.Set("title_only", "1")
	}
	path := "/"
	if boardID > 0 {
		path = fmt.Sprintf("/board/%d%s", boardID, permalinkSuffix)
	}
	if enc := q.Encode(); enc != "" {
		return path + "?" + enc
	}
	return path
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
	keyword := strings.TrimSpace(c.Query("keyword"))
	tag := strings.TrimSpace(c.Query("tag"))
	author := strings.TrimSpace(c.Query("author"))
	titleOnly := c.Query("title_only") == "1" || strings.EqualFold(c.Query("title_only"), "true")
	hasSearch := keyword != "" || tag != "" || author != ""

	var boardID uint
	var boardName string
	if idStr := c.Param("id"); idStr != "" {
		idStr = stripIDParam(idStr, d.Settings.Permalink().Ext)
		if n, err := strconv.ParseUint(idStr, 10, 64); err == nil {
			boardID = uint(n)
		}
		if boardID > 0 {
			match := d.permalink().MatchBoardPath(c.Request.URL.Path)
			if d.redirectIfNotCanonical(c, match) {
				return
			}
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

	feedStyle := d.Settings.FeedListStyle()
	showExcerpt := feedStyle == "excerpt" || feedStyle == "thumbnail"

	data := HomePageData{
		PageChrome:    chrome,
		BoardName:     boardName,
		Sort:          sort,
		Keyword:       keyword,
		Tag:           tag,
		Author:        author,
		TitleOnly:     titleOnly,
		HasSearch:     hasSearch,
		FeedListStyle: feedStyle,
		ShowExcerpt:   showExcerpt,
		Page:          page,
		PrevPage:      page - 1,
		NextPage:      page + 1,
		HasPrev:       page > 1,
	}

	listKW := keyword
	if keyword != "" {
		kw, err := d.Settings.NormalizeSearchKeyword(keyword)
		if err != nil {
			data.SearchError = err.Error()
			data.Posts = []PostListItem{}
			ctx.HTML(http.StatusOK, "home", data)
			return
		}
		listKW = kw
		data.Keyword = kw
	}

	items, total, err := d.Post.ListItems(services.PostListQuery{
		BoardID:       boardID,
		Page:          page,
		Size:          size,
		Sort:          sort,
		Keyword:       listKW,
		Tag:           tag,
		Author:        author,
		TitleOnly:     titleOnly,
		ViewerID:      ctx.UserID(),
		ViewerIsAdmin: ctx.IsAdmin(),
	})
	if err != nil {
		if errors.Is(err, services.ErrSearchKeywordTooShort) || errors.Is(err, services.ErrSearchKeywordTooLong) {
			data.SearchError = err.Error()
			data.Posts = []PostListItem{}
			ctx.HTML(http.StatusOK, "home", data)
			return
		}
		c.String(http.StatusInternalServerError, "加载帖子失败")
		return
	}

	posts := make([]PostListItem, 0, len(items))
	pl := d.permalink()
	for _, it := range items {
		authorName := strings.TrimSpace(it.User.Nickname)
		if authorName == "" {
			authorName = it.User.Username
		}
		bname := ""
		boardHref := ""
		boardSlot := 0
		if it.Board.ID > 0 {
			bname = it.Board.Name
			boardHref = pl.BoardPath(it.Board.ID)
			boardSlot = it.Board.ColorIndex
			if boardSlot < 0 {
				boardSlot = int(it.Board.ID % 8)
			}
			boardSlot = boardSlot % 8
		}
		excerptSrc := ""
		thumbURL := ""
		if showExcerpt {
			excerptSrc = strings.TrimSpace(it.ContentPlain)
			if excerptSrc == "" {
				excerptSrc = services.ExcerptFromHTML(it.Content, 60)
			} else {
				excerptSrc = services.TruncateRunes(excerptSrc, 60)
			}
		}
		if feedStyle == "thumbnail" {
			thumbURL = services.FirstImageURL(it.Content)
		}
		avatar := strings.TrimSpace(it.User.Avatar)
		authorID := it.UserID
		authorHref := ""
		if authorID > 0 {
			authorHref = pl.UserPath(authorID)
		}
		createdLabel := formatRelativeTime(it.CreatedAt)
		if sort == "reply" && it.LastReplyAt == nil {
			createdLabel = "暂无回复"
		}
		lastReplyName := ""
		lastReplyHref := ""
		lastReplyLabel := ""
		showLast := false
		if it.LastReplyAt != nil {
			showLast = true
			lastReplyLabel = formatRelativeTime(*it.LastReplyAt)
			if it.LastReplyUser != nil {
				lastReplyName = strings.TrimSpace(it.LastReplyUser.Nickname)
				if lastReplyName == "" {
					lastReplyName = it.LastReplyUser.Username
				}
				if it.LastReplyUser.ID > 0 {
					lastReplyHref = pl.UserPath(it.LastReplyUser.ID)
				}
			} else {
				lastReplyName = strings.TrimSpace(it.LastReplyGuestNick)
			}
			if lastReplyName == "" {
				showLast = false
			}
		}
		posts = append(posts, PostListItem{
			ID: it.ID, Title: it.Title, Href: pl.PostPath(it.ID),
			AuthorID: authorID, AuthorName: authorName, AuthorHref: authorHref,
			AvatarURL: avatar, AuthorMark: firstRuneOr(authorName, "姜"),
			BoardID: it.BoardID, BoardName: bname, BoardHref: boardHref,
			BoardColorSlot: boardSlot, ShowBoardBadge: boardID == 0 && it.Board.ID > 0,
			Excerpt: excerptSrc, ThumbURL: thumbURL,
			Pinned: it.Pinned, BoardPinned: it.BoardPinned, Featured: it.Featured,
			CommentCount: it.CommentCount, LikeCount: it.LikeCount, ViewCount: it.ViewCount,
			CreatedLabel: createdLabel,
			LastReplyLabel: lastReplyLabel, LastReplyName: lastReplyName,
			LastReplyHref: lastReplyHref, ShowLastReply: showLast,
		})
	}

	data.Posts = posts
	data.HasMore = int64(page*size) < total
	ctx.HTML(http.StatusOK, "home", data)
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

// formatRelativeTime 列表用相对时间
func formatRelativeTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	now := time.Now()
	d := now.Sub(t)
	if d < 0 {
		d = 0
	}
	switch {
	case d < time.Minute:
		return "刚刚"
	case d < time.Hour:
		return fmt.Sprintf("%d 分钟前", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%d 小时前", int(d.Hours()))
	case d < 48*time.Hour:
		return "昨天"
	case d < 30*24*time.Hour:
		return fmt.Sprintf("%d 天前", int(d.Hours()/24))
	default:
		return t.Local().Format("2006-01-02")
	}
}

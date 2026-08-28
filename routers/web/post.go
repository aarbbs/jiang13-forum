package web

import (
	"fmt"
	"html"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

// PostPageData 帖详情
type PostPageData struct {
	PageChrome
	PostID         uint
	PostPath       string
	PostTitle      string
	AuthorName     string
	BoardID        uint
	BoardName      string
	Pinned         bool
	Featured       bool
	PostTypeLabel  string
	CreatedLabel   string
	ViewCount      int
	LikeCount      int
	Liked          bool
	Favorited      bool
	BodyHTML       string
	CommentCount   int
	Comments       []CommentView
	CommentsLocked bool
	CanEdit        bool
}

// CommentView 评论
type CommentView struct {
	Floor         int
	AuthorName    string
	CreatedLabel  string
	Content       string
	ContentHidden bool
}

// PostView GET /post/:id
func (d Deps) PostView(c *gin.Context) {
	ctx := d.ctx(c)
	idStr := stripIDParam(c.Param("id"), d.Settings.Permalink().Ext)
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || id == 0 {
		d.render404(ctx)
		return
	}
	post, err := d.Post.FindByID(uint(id))
	if err != nil || !services.CanViewPost(post, ctx.UserID(), ctx.IsAdmin()) {
		d.render404(ctx)
		return
	}
	if post.Status == models.ContentStatusPublished {
		d.Post.RecordView(uint(id))
	}

	hasReplied := ctx.UserID() > 0 && d.Comment.HasUserReplied(uint(id), ctx.UserID())
	body := services.ApplyPostContentGates(post.Content, post, ctx.UserID(), ctx.IsAdmin(), hasReplied)

	comments, _ := d.Comment.ListByPost(uint(id), ctx.UserID(), ctx.IsAdmin(), post.UserID, nil)
	cv := make([]CommentView, 0, len(comments))
	for _, cm := range comments {
		an := strings.TrimSpace(cm.User.Nickname)
		if an == "" {
			an = cm.User.Username
		}
		cv = append(cv, CommentView{
			Floor: cm.Floor, AuthorName: an, CreatedLabel: formatTime(cm.CreatedAt),
			Content: cm.Content, ContentHidden: cm.ContentHidden,
		})
	}

	author := strings.TrimSpace(post.User.Nickname)
	if author == "" {
		author = post.User.Username
	}
	boardName := ""
	if post.Board.ID > 0 {
		boardName = post.Board.Name
	}

	chrome := d.chrome(ctx, post.Title+" · "+d.Settings.SiteBranding().Name, "", "post/body")
	chrome.ActiveBoard = post.BoardID

	ctx.HTML(http.StatusOK, "post", PostPageData{
		PageChrome: chrome, PostID: post.ID,
		PostPath: url.QueryEscape(fmt.Sprintf("/post/%d", post.ID)),
		PostTitle: post.Title, AuthorName: author, BoardID: post.BoardID, BoardName: boardName,
		Pinned: post.Pinned || post.BoardPinned, Featured: post.Featured,
		PostTypeLabel: postTypeLabel(post.PostType), CreatedLabel: formatTime(post.CreatedAt),
		ViewCount: post.ViewCount, LikeCount: post.LikeCount,
		Liked: d.Post.IsLiked(ctx.UserID(), post.ID), Favorited: d.Post.IsFavorited(ctx.UserID(), post.ID),
		BodyHTML: body, CommentCount: len(cv), Comments: cv,
		CommentsLocked: post.CommentsLocked,
		CanEdit:        d.Post.CanUserEdit(post, ctx.UserID(), ctx.IsAdmin()),
	})
}

func postTypeLabel(t string) string {
	switch t {
	case models.PostTypeQuestion:
		return "问答"
	case models.PostTypePoll:
		return "投票"
	case models.PostTypeBounty:
		return "悬赏"
	case models.PostTypeLottery:
		return "抽奖"
	default:
		return ""
	}
}

// PostComment POST 评论
func (d Deps) PostComment(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect("/")
		return
	}
	id, err := parsePostID(c, d)
	if err != nil {
		d.render404(ctx)
		return
	}
	content := strings.TrimSpace(c.PostForm("content"))
	if content == "" {
		ctx.SetFlash("评论不能为空")
		ctx.Redirect(fmt.Sprintf("/post/%d#comments", id))
		return
	}
	safe := "<p>" + html.EscapeString(content) + "</p>"
	_, err = d.Comment.Create(services.CommentCreateInput{
		PostID: id, UserID: ctx.UserID(), Content: safe,
	})
	if err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(fmt.Sprintf("/post/%d#comments", id))
		return
	}
	ctx.Redirect(fmt.Sprintf("/post/%d#comments", id))
}

// PostLike 赞
func (d Deps) PostLike(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求")
		ctx.Redirect("/")
		return
	}
	id, err := parsePostID(c, d)
	if err != nil {
		d.render404(ctx)
		return
	}
	_, _ = d.Post.ToggleLike(ctx.UserID(), id)
	ctx.Redirect(fmt.Sprintf("/post/%d", id))
}

// PostFavorite 收藏
func (d Deps) PostFavorite(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求")
		ctx.Redirect("/")
		return
	}
	id, err := parsePostID(c, d)
	if err != nil {
		d.render404(ctx)
		return
	}
	_, _ = d.Post.ToggleFavorite(ctx.UserID(), id)
	ctx.Redirect(fmt.Sprintf("/post/%d", id))
}

func parsePostID(c *gin.Context, d Deps) (uint, error) {
	idStr := stripIDParam(c.Param("id"), d.Settings.Permalink().Ext)
	id, err := strconv.ParseUint(idStr, 10, 64)
	return uint(id), err
}

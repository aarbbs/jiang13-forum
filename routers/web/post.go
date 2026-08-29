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
	AuthorID       uint
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
	CanReportPost  bool
}

// CommentView 评论
type CommentView struct {
	ID             uint
	Floor          int
	AuthorName     string
	AuthorID       uint
	CreatedLabel   string
	Content        string
	ContentHidden  bool
	ReplyToID      uint
	ReplyToFloor   int
	ReplyToAuthor  string
	LikeCount      int
	Liked          bool
	IsPrivate      bool
	CanReport      bool
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
		view := CommentView{
			ID: cm.ID, Floor: cm.Floor, AuthorName: an, AuthorID: cm.UserID,
			CreatedLabel: formatTime(cm.CreatedAt),
			Content: cm.Content, ContentHidden: cm.ContentHidden,
			LikeCount: cm.LikeCount, Liked: cm.Liked, IsPrivate: cm.IsPrivate,
			CanReport: ctx.IsSigned() && (cm.UserID == 0 || cm.UserID != ctx.UserID()),
		}
		if cm.ReplyTarget != nil {
			view.ReplyToID = cm.ReplyTarget.ID
			view.ReplyToFloor = cm.ReplyTarget.Floor
			rn := strings.TrimSpace(cm.ReplyTarget.User.Nickname)
			if rn == "" {
				rn = cm.ReplyTarget.User.Username
			}
			if rn == "" {
				rn = cm.ReplyTarget.GuestNick
			}
			view.ReplyToAuthor = rn
		} else if cm.ReplyTo != nil {
			view.ReplyToID = *cm.ReplyTo
		}
		cv = append(cv, view)
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
		PostTitle: post.Title, AuthorName: author, AuthorID: post.UserID,
		BoardID: post.BoardID, BoardName: boardName,
		Pinned: post.Pinned || post.BoardPinned, Featured: post.Featured,
		PostTypeLabel: postTypeLabel(post.PostType), CreatedLabel: formatTime(post.CreatedAt),
		ViewCount: post.ViewCount, LikeCount: post.LikeCount,
		Liked: d.Post.IsLiked(ctx.UserID(), post.ID), Favorited: d.Post.IsFavorited(ctx.UserID(), post.ID),
		BodyHTML: body, CommentCount: len(cv), Comments: cv,
		CommentsLocked: post.CommentsLocked,
		CanEdit:        d.Post.CanUserEdit(post, ctx.UserID(), ctx.IsAdmin()),
		CanReportPost:  ctx.IsSigned() && post.UserID != ctx.UserID(),
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
	var replyTo *uint
	if raw := strings.TrimSpace(c.PostForm("reply_to")); raw != "" {
		rid, err := strconv.ParseUint(raw, 10, 64)
		if err == nil && rid > 0 {
			v := uint(rid)
			replyTo = &v
		}
	}
	isPrivate := c.PostForm("is_private") == "1" || c.PostForm("is_private") == "on"
	safe := "<p>" + html.EscapeString(content) + "</p>"
	cm, err := d.Comment.Create(services.CommentCreateInput{
		PostID: id, UserID: ctx.UserID(), Content: safe,
		ReplyTo: replyTo, IsPrivate: isPrivate,
	})
	if err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(fmt.Sprintf("/post/%d#comments", id))
		return
	}
	anchor := "#comments"
	if cm != nil && cm.Floor > 0 {
		anchor = fmt.Sprintf("#floor-%d", cm.Floor)
	}
	ctx.Redirect(fmt.Sprintf("/post/%d%s", id, anchor))
}

// PostCommentLike 评论点赞切换（PRG）
func (d Deps) PostCommentLike(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求")
		ctx.Redirect("/")
		return
	}
	postID, err := parsePostID(c, d)
	if err != nil {
		d.render404(ctx)
		return
	}
	cid, err := strconv.ParseUint(c.Param("cid"), 10, 64)
	if err != nil || cid == 0 {
		d.render404(ctx)
		return
	}
	cm, err := d.Comment.GetByID(uint(cid))
	if err != nil || cm.PostID != postID {
		d.render404(ctx)
		return
	}
	_, _, _ = d.Comment.ToggleLike(ctx.UserID(), uint(cid))
	ctx.Redirect(fmt.Sprintf("/post/%d#floor-%d", postID, cm.Floor))
}

// PostUnlock POST /post/:id/unlock — 积分解锁（JSON，供详情页渐进增强）
func (d Deps) PostUnlock(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效请求，请重试"})
		return
	}
	id, err := parsePostID(c, d)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "帖子不存在"})
		return
	}
	var req struct {
		BlockKey string `json:"block_key" form:"block_key"`
	}
	_ = c.ShouldBindJSON(&req)
	if req.BlockKey == "" {
		req.BlockKey = strings.TrimSpace(c.PostForm("block_key"))
	}
	if req.BlockKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 block_key"})
		return
	}
	res, err := services.UnlockPointsBlock(ctx.UserID(), id, req.BlockKey)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "解锁成功",
		"unlock":  res,
	})
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

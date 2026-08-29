package web

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/modules/webctx"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

type composeData struct {
	PageChrome
	IsEdit         bool
	PostID         uint
	FormAction     string
	BoardID        uint
	Title          string
	Tags           string
	Content        string
	PostType       string
	PollMulti      bool
	PollMaxChoices int
	PollEndsAt     string
	PollOptions    string
	BountyPoints   int
	LotteryWinners int
	Boards         []BoardView
	TitleMax       int
	TagsMax        int
	ContentMax     int
}

// ComposeGet 发帖页
func (d Deps) ComposeGet(c *gin.Context) {
	ctx := d.ctx(c)
	if err := d.ensureCanWrite(ctx); err != "" {
		ctx.SetFlash(err)
		ctx.Redirect("/")
		return
	}
	boardID, _ := strconv.ParseUint(c.Query("board"), 10, 64)
	d.renderCompose(ctx, "", composeForm{
		BoardID:        uint(boardID),
		PostType:       models.PostTypeNormal,
		PollMaxChoices: 1,
		BountyPoints:   1,
		LotteryWinners: 1,
	}, false, 0)
}

// ComposePost 发帖提交
func (d Deps) ComposePost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderCompose(ctx, "无效请求，请重试", composeFormFrom(c), false, 0)
		return
	}
	if msg := d.ensureCanWrite(ctx); msg != "" {
		ctx.SetFlash(msg)
		ctx.Redirect("/")
		return
	}
	if d.Limiter != nil && !d.Limiter.Allow("post", fmt.Sprintf("%d", ctx.UserID())) {
		d.renderCompose(ctx, "发帖过于频繁，请稍后再试", composeFormFrom(c), false, 0)
		return
	}
	form := composeFormFrom(c)
	htmlBody := services.ComposeBodyToHTML(form.Content)
	postType := normalizeComposePostType(form.PostType)
	post, err := d.Post.Create(ctx.UserID(), form.BoardID, form.Title, htmlBody, form.Tags, postType, ctx.SkipsModeration())
	if err != nil {
		d.renderCompose(ctx, err.Error(), form, false, 0)
		return
	}
	if post.PostType == models.PostTypePoll || post.PostType == models.PostTypeBounty || post.PostType == models.PostTypeLottery {
		var extras services.PostCreateExtras
		switch post.PostType {
		case models.PostTypePoll:
			pollJSON, err := services.BuildPollOptionsJSON(form.PollMulti, form.PollMaxChoices, form.PollEndsAt, form.PollOptions)
			if err != nil {
				_ = d.Post.Delete(ctx.UserID(), post.ID, true)
				d.renderCompose(ctx, err.Error(), form, false, 0)
				return
			}
			extras = services.ParsePostExtrasFromForm(pollJSON, "", "")
		case models.PostTypeBounty:
			extras = services.ParsePostExtrasFromForm("", strconv.Itoa(form.BountyPoints), "")
		case models.PostTypeLottery:
			extras = services.ParsePostExtrasFromForm("", "", strconv.Itoa(form.LotteryWinners))
		}
		if err := services.FinalizeSpecialPostCreate(post, ctx.UserID(), extras); err != nil {
			_ = d.Post.Delete(ctx.UserID(), post.ID, true)
			d.renderCompose(ctx, err.Error(), form, false, 0)
			return
		}
	}
	if post.Status == models.ContentStatusPending {
		ctx.SetFlash("帖子已提交，等待审核")
		if d.Notify != nil {
			d.Notify.AsyncNotifyPendingPost(post)
		}
	} else {
		ctx.SetFlash("发帖成功")
	}
	ctx.Redirect(fmt.Sprintf("/post/%d", post.ID))
}

// PostEditGet 编辑帖
func (d Deps) PostEditGet(c *gin.Context) {
	ctx := d.ctx(c)
	post, errMsg := d.loadEditablePost(ctx, c.Param("id"))
	if errMsg != "" {
		ctx.SetFlash(errMsg)
		ctx.Redirect("/")
		return
	}
	d.renderCompose(ctx, "", composeForm{
		BoardID:  post.BoardID,
		Title:    post.Title,
		Tags:     post.Tags,
		Content:  services.HTMLToComposePlain(post.Content),
		PostType: post.PostType,
	}, true, post.ID)
}

// PostEditPost 编辑提交
func (d Deps) PostEditPost(c *gin.Context) {
	ctx := d.ctx(c)
	post, errMsg := d.loadEditablePost(ctx, c.Param("id"))
	if errMsg != "" {
		ctx.SetFlash(errMsg)
		ctx.Redirect("/")
		return
	}
	if !ctx.CheckCSRF() {
		d.renderCompose(ctx, "无效请求，请重试", composeFormFrom(c), true, post.ID)
		return
	}
	if d.Limiter != nil && !d.Limiter.Allow("post", fmt.Sprintf("%d", ctx.UserID())) {
		d.renderCompose(ctx, "操作过于频繁，请稍后再试", composeFormFrom(c), true, post.ID)
		return
	}
	form := composeFormFrom(c)
	form.PostType = post.PostType // 编辑不可改类型
	htmlBody := services.ComposeBodyToHTML(form.Content)
	if err := d.Post.Update(ctx.UserID(), post.ID, ctx.IsAdmin(), ctx.SkipsModeration(), form.Title, htmlBody, form.Tags, post.PostType, form.BoardID); err != nil {
		d.renderCompose(ctx, err.Error(), form, true, post.ID)
		return
	}
	ctx.SetFlash("已保存")
	ctx.Redirect(fmt.Sprintf("/post/%d", post.ID))
}

// ComposeUpload 帖图上传（JSON，供 compose 页 fetch）
func (d Deps) ComposeUpload(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.IsSigned() {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	if !ctx.CheckCSRF() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效请求"})
		return
	}
	if ctx.Doer != nil && ctx.Doer.Banned {
		c.JSON(http.StatusForbidden, gin.H{"error": "账号已被禁言"})
		return
	}
	if d.Store == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "上传不可用"})
		return
	}
	file, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择图片文件"})
		return
	}
	url, err := services.SaveUploadedImage(d.Store, file, services.UploadCategoryPosts, fmt.Sprintf("%d", ctx.UserID()))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"url": url})
}

type composeForm struct {
	BoardID        uint
	Title          string
	Tags           string
	Content        string
	PostType       string
	PollMulti      bool
	PollMaxChoices int
	PollEndsAt     string
	PollOptions    string
	BountyPoints   int
	LotteryWinners int
}

func normalizeComposePostType(t string) string {
	switch t {
	case models.PostTypePoll, models.PostTypeQuestion, models.PostTypeBounty, models.PostTypeLottery:
		return t
	default:
		return models.PostTypeNormal
	}
}

func composeFormFrom(c *gin.Context) composeForm {
	bid, _ := strconv.ParseUint(c.PostForm("board_id"), 10, 64)
	maxChoices, _ := strconv.Atoi(c.PostForm("poll_max_choices"))
	if maxChoices < 1 {
		maxChoices = 1
	}
	bountyPoints, _ := strconv.Atoi(c.PostForm("bounty_points"))
	lotteryWinners, _ := strconv.Atoi(c.PostForm("lottery_winner_count"))
	if lotteryWinners < 1 {
		lotteryWinners = 1
	}
	return composeForm{
		BoardID:        uint(bid),
		Title:          strings.TrimSpace(c.PostForm("title")),
		Tags:           strings.TrimSpace(c.PostForm("tags")),
		Content:        c.PostForm("content"),
		PostType:       normalizeComposePostType(strings.TrimSpace(c.PostForm("post_type"))),
		PollMulti:      c.PostForm("poll_multi") == "1" || c.PostForm("poll_multi") == "on",
		PollMaxChoices: maxChoices,
		PollEndsAt:     strings.TrimSpace(c.PostForm("poll_ends_at")),
		PollOptions:    c.PostForm("poll_options"),
		BountyPoints:   bountyPoints,
		LotteryWinners: lotteryWinners,
	}
}

func (d Deps) renderCompose(ctx *webctx.Context, errMsg string, form composeForm, isEdit bool, postID uint) {
	title := "发帖"
	action := "/compose"
	if isEdit {
		title = "编辑帖子"
		action = fmt.Sprintf("/post/%d/edit", postID)
	}
	if form.PostType == "" {
		form.PostType = models.PostTypeNormal
	}
	if form.PollMaxChoices < 1 {
		form.PollMaxChoices = 1
	}
	if form.BountyPoints < 1 {
		form.BountyPoints = 1
	}
	if form.LotteryWinners < 1 {
		form.LotteryWinners = 1
	}
	chrome := d.chrome(ctx, title+" · "+d.Settings.SiteBranding().Name, "", "")
	chrome.Error = errMsg
	chrome.ActiveBoard = form.BoardID
	ctx.HTML(http.StatusOK, "compose", composeData{
		PageChrome:     chrome,
		IsEdit:         isEdit,
		PostID:         postID,
		FormAction:     action,
		BoardID:        form.BoardID,
		Title:          form.Title,
		Tags:           form.Tags,
		Content:        form.Content,
		PostType:       form.PostType,
		PollMulti:      form.PollMulti,
		PollMaxChoices: form.PollMaxChoices,
		PollEndsAt:     form.PollEndsAt,
		PollOptions:    form.PollOptions,
		BountyPoints:   form.BountyPoints,
		LotteryWinners: form.LotteryWinners,
		Boards:         chrome.Boards,
		TitleMax:       d.Settings.PostTitleMax(),
		TagsMax:        d.Settings.PostTagsMax(),
		ContentMax:     d.Settings.PostContentMax(),
	})
}

func (d Deps) ensureCanWrite(ctx *webctx.Context) string {
	if !ctx.IsSigned() {
		return "请先登录"
	}
	if ctx.Doer != nil && ctx.Doer.Banned {
		return "账号已被禁言，无法发帖"
	}
	return ""
}

func (d Deps) loadEditablePost(ctx *webctx.Context, idParam string) (*models.Post, string) {
	if msg := d.ensureCanWrite(ctx); msg != "" {
		return nil, msg
	}
	idStr := stripIDParam(idParam, d.Settings.Permalink().Ext)
	id, err := strconv.ParseUint(idStr, 10, 64)
	if err != nil || id == 0 {
		return nil, "帖子不存在"
	}
	post, err := d.Post.FindByID(uint(id))
	if err != nil {
		return nil, "帖子不存在"
	}
	if !ctx.IsAdmin() && post.UserID != ctx.UserID() {
		return nil, "无权编辑此帖"
	}
	if reason := d.Post.EditBlockReason(post, ctx.IsAdmin()); reason != "" {
		return nil, reason
	}
	return post, ""
}
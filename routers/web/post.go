package web

import (
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/modules/webctx"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

// PostPageData 帖详情
type PostPageData struct {
	PageChrome
	PostID               uint
	PostHref             string
	PostPath             string
	PostTitle            string
	AuthorName           string
	AuthorID             uint
	AuthorHref           string
	BoardID              uint
	BoardHref            string
	BoardName            string
	Pinned               bool // 展示用：全局或版内置顶
	GlobalPinned         bool
	BoardPinned          bool
	Featured             bool
	EditLocked           bool
	PostTypeLabel        string
	CreatedLabel         string
	ViewCount            int
	LikeCount            int
	Liked                bool
	Favorited            bool
	BodyHTML             string
	CommentCount         int
	Comments             []commentItemData
	CommentsLocked       bool
	CanEdit              bool
	CanViewRevisions     bool
	CanReportPost        bool
	IsAdmin              bool
	Status               string
	StatusLabel          string
	ShowModerationBanner bool
	IsQuestion           bool
	QuestionResolved     bool
	CanToggleQuestion    bool
	Bounty               *postBountyView
	Lottery              *postLotteryView
	Poll                 *postPollView
}

type postBountyView struct {
	Points            int
	Status            string
	StatusLabel       string
	CanRefund         bool
	RefundBlockReason string
	AwardedCommentID  uint
}

type postLotteryWinnerView struct {
	UserID    uint
	Name      string
	FloorHint string
}

type postLotteryView struct {
	WinnerCount      int
	Status           string
	StatusLabel      string
	ParticipantCount int
	CanDraw          bool
	Winners          []postLotteryWinnerView
}

type postPollOptionView struct {
	ID        uint
	Text      string
	VoteCount int
	Percent   int
	Selected  bool
}

type postPollView struct {
	Multi       bool
	MaxChoices  int
	Closed      bool
	EndsLabel   string
	TotalVotes  int
	ShowResults bool
	HasVoted    bool
	CanVote     bool
	CanClose    bool
	Options     []postPollOptionView
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
	ThreadParentID uint
	Depth          int
	Children       []CommentView
	LikeCount      int
	Liked          bool
	IsPrivate      bool
	CanReport      bool
	CanEdit        bool
	CanDelete      bool
	Status         string
	StatusLabel    string
	CanAwardBounty bool
	IsBountyAward  bool
}

const commentNestMaxDepth = 6

// commentItemData 嵌套评论渲染上下文（{{template}} 会重置 $，需自带页面字段）
type commentItemData struct {
	CommentView
	PostID          uint
	CSRF            string
	LoggedIn        bool
	CommentsLocked  bool
	PermalinkSuffix string
}

// Wrap 子评论继承同一帖上下文
func (d commentItemData) Wrap(c CommentView) commentItemData {
	return commentItemData{
		CommentView:     c,
		PostID:          d.PostID,
		CSRF:            d.CSRF,
		LoggedIn:        d.LoggedIn,
		CommentsLocked:  d.CommentsLocked,
		PermalinkSuffix: d.PermalinkSuffix,
	}
}

func (d Deps) commentItemsForPage(ctx *webctx.Context, postID uint, locked bool, tree []CommentView) []commentItemData {
	out := make([]commentItemData, 0, len(tree))
	base := commentItemData{
		PostID:          postID,
		CSRF:            ctx.EnsureCSRF(),
		LoggedIn:        ctx.IsSigned(),
		CommentsLocked:  locked,
		PermalinkSuffix: d.permalink().Suffix(),
	}
	for _, c := range tree {
		item := base
		item.CommentView = c
		out = append(out, item)
	}
	return out
}

// buildCommentTree 按 ThreadParentID 组装嵌套树（同层保持楼层顺序）
func buildCommentTree(flat []CommentView) []CommentView {
	if len(flat) == 0 {
		return nil
	}
	nodes := make([]CommentView, len(flat))
	copy(nodes, flat)
	byID := make(map[uint]int, len(nodes))
	for i := range nodes {
		byID[nodes[i].ID] = i
		nodes[i].Children = nil
	}
	childIdx := make(map[uint][]int, len(nodes))
	roots := make([]int, 0, len(nodes))
	for i := range nodes {
		pid := nodes[i].ThreadParentID
		if pid == 0 {
			roots = append(roots, i)
			continue
		}
		if _, ok := byID[pid]; !ok {
			roots = append(roots, i)
			continue
		}
		childIdx[pid] = append(childIdx[pid], i)
	}
	var attach func(i, depth int) CommentView
	attach = func(i, depth int) CommentView {
		n := nodes[i]
		if depth > commentNestMaxDepth {
			depth = commentNestMaxDepth
		}
		n.Depth = depth
		kids := childIdx[n.ID]
		if len(kids) == 0 {
			n.Children = nil
			return n
		}
		n.Children = make([]CommentView, 0, len(kids))
		nextDepth := depth + 1
		if nextDepth > commentNestMaxDepth {
			nextDepth = commentNestMaxDepth
		}
		for _, ci := range kids {
			n.Children = append(n.Children, attach(ci, nextDepth))
		}
		return n
	}
	out := make([]CommentView, 0, len(roots))
	for _, i := range roots {
		out = append(out, attach(i, 0))
	}
	return out
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
	match := d.permalink().MatchPostPath(c.Request.URL.Path)
	if d.redirectIfNotCanonical(c, match) {
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

	canAwardBounty := post.PostType == models.PostTypeBounty &&
		post.BountyStatus == models.BountyStatusOpen &&
		(ctx.IsAdmin() || post.UserID == ctx.UserID())

	comments, _ := d.Comment.ListByPost(uint(id), ctx.UserID(), ctx.IsAdmin(), post.UserID, nil)
	commentTotal := len(comments)
	cv := make([]CommentView, 0, len(comments))
	for _, cm := range comments {
		an := strings.TrimSpace(cm.User.Nickname)
		if an == "" {
			an = cm.User.Username
		}
		view := CommentView{
			ID: cm.ID, Floor: cm.Floor, AuthorName: an, AuthorID: cm.UserID,
			CreatedLabel: formatTime(cm.CreatedAt),
			Content:      cm.Content, ContentHidden: cm.ContentHidden,
			LikeCount: cm.LikeCount, Liked: cm.Liked, IsPrivate: cm.IsPrivate,
			CanReport: ctx.IsSigned() && (cm.UserID == 0 || cm.UserID != ctx.UserID()),
			CanEdit:   !cm.ContentHidden && d.Comment.CanUserEditComment(&cm, ctx.UserID(), ctx.IsAdmin()),
			CanDelete: !cm.ContentHidden && d.Comment.CanUserDeleteComment(&cm, ctx.UserID(), ctx.IsAdmin()),
			Status:    cm.Status,
			CanAwardBounty: canAwardBounty && !cm.ContentHidden &&
				cm.Status == models.ContentStatusPublished && cm.UserID != post.UserID && cm.UserID > 0,
			IsBountyAward: post.BountyCommentID > 0 && cm.ID == post.BountyCommentID,
		}
		if cm.ThreadParentID != nil {
			view.ThreadParentID = *cm.ThreadParentID
		}
		if cm.Status == models.ContentStatusPending || cm.Status == models.ContentStatusRejected {
			if ctx.IsAdmin() || (cm.UserID > 0 && cm.UserID == ctx.UserID()) {
				view.StatusLabel = contentStatusLabel(cm.Status)
			}
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
	cv = buildCommentTree(cv)

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

	statusLabel := ""
	showBanner := false
	if post.Status == models.ContentStatusPending || post.Status == models.ContentStatusRejected {
		if ctx.IsAdmin() || post.UserID == ctx.UserID() {
			statusLabel = contentStatusLabel(post.Status)
			showBanner = true
		}
	}

	var pollView *postPollView
	if post.PostType == models.PostTypePoll {
		if pv, err := services.GetPollView(post.ID, ctx.UserID()); err == nil && pv != nil {
			pollView = mapPollView(pv, ctx.IsSigned(), ctx.IsAdmin() || post.UserID == ctx.UserID())
		}
	}

	var bountyView *postBountyView
	if post.PostType == models.PostTypeBounty {
		isOperator := ctx.IsAdmin() || post.UserID == ctx.UserID()
		canRefund, blockReason := services.CanRefundBounty(post, ctx.IsAdmin())
		bv := &postBountyView{
			Points:           post.BountyPoints,
			Status:           post.BountyStatus,
			StatusLabel:      bountyStatusLabel(post.BountyStatus),
			CanRefund:        isOperator && canRefund,
			AwardedCommentID: post.BountyCommentID,
		}
		if isOperator && !canRefund {
			bv.RefundBlockReason = blockReason
		}
		bountyView = bv
	}

	var lotteryView *postLotteryView
	if post.PostType == models.PostTypeLottery {
		if lv, err := services.GetPostLotteryView(post); err == nil && lv != nil {
			isOperator := ctx.IsAdmin() || post.UserID == ctx.UserID()
			winners := make([]postLotteryWinnerView, 0, len(lv.Winners))
			for _, w := range lv.Winners {
				name := strings.TrimSpace(w.Nickname)
				if name == "" {
					name = w.Username
				}
				winners = append(winners, postLotteryWinnerView{UserID: w.UserID, Name: name})
			}
			lotteryView = &postLotteryView{
				WinnerCount:      lv.WinnerCount,
				Status:           lv.Status,
				StatusLabel:      lotteryStatusLabel(lv.Status),
				ParticipantCount: lv.ParticipantCount,
				CanDraw:          isOperator && lv.Status != models.PostLotteryStatusDrawn,
				Winners:          winners,
			}
		}
	}

	ctx.HTML(http.StatusOK, "post", PostPageData{
		PageChrome: chrome, PostID: post.ID,
		PostHref:  d.postHref(post.ID),
		PostPath:  url.QueryEscape(d.postHref(post.ID)),
		PostTitle: post.Title, AuthorName: author, AuthorID: post.UserID,
		AuthorHref: d.userHref(post.UserID),
		BoardID:    post.BoardID, BoardHref: d.boardHref(post.BoardID), BoardName: boardName,
		Pinned: post.Pinned || post.BoardPinned, GlobalPinned: post.Pinned, BoardPinned: post.BoardPinned,
		Featured: post.Featured, EditLocked: post.EditLocked,
		PostTypeLabel: postTypeLabel(post.PostType), CreatedLabel: formatTime(post.CreatedAt),
		ViewCount: post.ViewCount, LikeCount: post.LikeCount,
		Liked: d.Post.IsLiked(ctx.UserID(), post.ID), Favorited: d.Post.IsFavorited(ctx.UserID(), post.ID),
		BodyHTML: body, CommentCount: commentTotal,
		Comments:             d.commentItemsForPage(ctx, post.ID, post.CommentsLocked, cv),
		CommentsLocked:       post.CommentsLocked,
		CanEdit:              d.Post.CanUserEdit(post, ctx.UserID(), ctx.IsAdmin()),
		CanViewRevisions:     canViewPostRevisions(post, ctx.UserID(), ctx.IsAdmin()),
		CanReportPost:        ctx.IsSigned() && post.UserID != ctx.UserID(),
		IsAdmin:              ctx.IsAdmin(),
		Status:               post.Status,
		StatusLabel:          statusLabel,
		ShowModerationBanner: showBanner,
		IsQuestion:           post.PostType == models.PostTypeQuestion,
		QuestionResolved:     post.QuestionResolved,
		CanToggleQuestion:    post.PostType == models.PostTypeQuestion && (ctx.IsAdmin() || post.UserID == ctx.UserID()),
		Bounty:               bountyView,
		Lottery:              lotteryView,
		Poll:                 pollView,
	})
}

func mapPollView(pv *services.PollView, loggedIn, canClose bool) *postPollView {
	hasVoted := len(pv.MyOptionIDs) > 0
	selected := make(map[uint]bool, len(pv.MyOptionIDs))
	for _, id := range pv.MyOptionIDs {
		selected[id] = true
	}
	showResults := pv.Closed || hasVoted
	opts := make([]postPollOptionView, 0, len(pv.Options))
	for _, o := range pv.Options {
		opts = append(opts, postPollOptionView{
			ID: o.ID, Text: o.Text, VoteCount: o.VoteCount, Percent: o.Percent, Selected: selected[o.ID],
		})
	}
	ends := ""
	if pv.EndsAt != nil {
		ends = formatTime(*pv.EndsAt)
	}
	return &postPollView{
		Multi: pv.Multi, MaxChoices: pv.MaxChoices, Closed: pv.Closed,
		EndsLabel: ends, TotalVotes: pv.TotalVotes,
		ShowResults: showResults, HasVoted: hasVoted,
		CanVote:  loggedIn && !pv.Closed && !hasVoted,
		CanClose: canClose && !pv.Closed,
		Options:  opts,
	}
}

func contentStatusLabel(status string) string {
	switch status {
	case models.ContentStatusPending:
		return "审核中"
	case models.ContentStatusRejected:
		return "已拒绝"
	default:
		return ""
	}
}

func lotteryStatusLabel(status string) string {
	switch status {
	case models.PostLotteryStatusDrawn:
		return "已开奖"
	case models.PostLotteryStatusOpen:
		return "待开奖"
	default:
		return status
	}
}

func bountyStatusLabel(status string) string {
	switch status {
	case models.BountyStatusOpen:
		return "进行中"
	case models.BountyStatusAwarded:
		return "已采纳"
	case models.BountyStatusRefunded:
		return "已退回"
	default:
		return status
	}
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
	if d.Limiter != nil && !d.Limiter.Allow("comment", fmt.Sprintf("%d", ctx.UserID())) {
		ctx.SetFlash("操作过于频繁，请稍后再试")
		ctx.Redirect(fmt.Sprintf("/post/%d#comments", id))
		return
	}
	safe := services.ComposeBodyToHTML(content)
	cm, err := d.Comment.Create(services.CommentCreateInput{
		PostID: id, UserID: ctx.UserID(), Content: safe,
		ReplyTo: replyTo, IsPrivate: isPrivate,
	})
	if err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(fmt.Sprintf("/post/%d#comments", id))
		return
	}
	if d.Notify != nil && cm != nil {
		switch cm.Status {
		case models.ContentStatusPublished:
			d.Notify.AsyncNotifyCommentPublished(cm)
			d.Notify.AsyncNotifyCommentMentions(cm)
		case models.ContentStatusPending:
			ctx.SetFlash("评论已提交，审核通过后公开显示")
			d.Notify.AsyncNotifyPendingComment(cm)
		}
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

// PostPollVote 投票提交
func (d Deps) PostPollVote(c *gin.Context) {
	ctx := d.ctx(c)
	id, err := parsePostID(c, d)
	if err != nil || id == 0 {
		d.render404(ctx)
		return
	}
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect(fmt.Sprintf("/post/%d", id))
		return
	}
	raw := c.PostFormArray("option_ids")
	if len(raw) == 0 {
		if one := strings.TrimSpace(c.PostForm("option_id")); one != "" {
			raw = []string{one}
		}
	}
	oids := make([]uint, 0, len(raw))
	for _, s := range raw {
		v, err := strconv.ParseUint(strings.TrimSpace(s), 10, 64)
		if err == nil && v > 0 {
			oids = append(oids, uint(v))
		}
	}
	if err := services.VotePoll(id, ctx.UserID(), oids); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(fmt.Sprintf("/post/%d", id))
		return
	}
	ctx.SetFlash("投票成功")
	ctx.Redirect(fmt.Sprintf("/post/%d", id))
}

// PostPollClose 结束投票
func (d Deps) PostPollClose(c *gin.Context) {
	ctx := d.ctx(c)
	id, err := parsePostID(c, d)
	if err != nil || id == 0 {
		d.render404(ctx)
		return
	}
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect(fmt.Sprintf("/post/%d", id))
		return
	}
	post, err := d.Post.FindByID(id)
	if err != nil {
		d.render404(ctx)
		return
	}
	if err := services.ClosePoll(id, ctx.UserID(), ctx.IsAdmin(), post.UserID); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(fmt.Sprintf("/post/%d", id))
		return
	}
	ctx.SetFlash("投票已结束")
	ctx.Redirect(fmt.Sprintf("/post/%d", id))
}

// PostQuestionResolvePost 标记问答帖已解决 / 未解决
func (d Deps) PostQuestionResolvePost(c *gin.Context) {
	ctx := d.ctx(c)
	id, err := parsePostID(c, d)
	if err != nil || id == 0 {
		d.render404(ctx)
		return
	}
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect(fmt.Sprintf("/post/%d", id))
		return
	}
	resolved := c.PostForm("resolved") == "1" || c.PostForm("resolved") == "on"
	if err := d.Post.SetQuestionResolved(ctx.UserID(), id, ctx.IsAdmin(), resolved); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(fmt.Sprintf("/post/%d", id))
		return
	}
	if resolved {
		ctx.SetFlash("已标为已解决")
	} else {
		ctx.SetFlash("已标为未解决")
	}
	ctx.Redirect(fmt.Sprintf("/post/%d", id))
}

// PostBountyAwardPost 采纳评论并发放悬赏
func (d Deps) PostBountyAwardPost(c *gin.Context) {
	ctx := d.ctx(c)
	id, err := parsePostID(c, d)
	if err != nil || id == 0 {
		d.render404(ctx)
		return
	}
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect(fmt.Sprintf("/post/%d", id))
		return
	}
	cid, _ := strconv.ParseUint(c.PostForm("comment_id"), 10, 64)
	if err := services.AwardBounty(id, ctx.UserID(), ctx.IsAdmin(), uint(cid)); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(fmt.Sprintf("/post/%d#comments", id))
		return
	}
	ctx.SetFlash("已采纳并发放悬赏")
	ctx.Redirect(fmt.Sprintf("/post/%d#comments", id))
}

// PostBountyRefundPost 取消悬赏并退回积分
func (d Deps) PostBountyRefundPost(c *gin.Context) {
	ctx := d.ctx(c)
	id, err := parsePostID(c, d)
	if err != nil || id == 0 {
		d.render404(ctx)
		return
	}
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect(fmt.Sprintf("/post/%d", id))
		return
	}
	if err := services.RefundBounty(id, ctx.UserID(), ctx.IsAdmin()); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(fmt.Sprintf("/post/%d", id))
		return
	}
	ctx.SetFlash("悬赏已退回")
	ctx.Redirect(fmt.Sprintf("/post/%d", id))
}

// PostLotteryDrawPost 抽奖帖开奖
func (d Deps) PostLotteryDrawPost(c *gin.Context) {
	ctx := d.ctx(c)
	id, err := parsePostID(c, d)
	if err != nil || id == 0 {
		d.render404(ctx)
		return
	}
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect(fmt.Sprintf("/post/%d", id))
		return
	}
	if _, err := services.DrawPostLottery(id, ctx.UserID(), ctx.IsAdmin()); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(fmt.Sprintf("/post/%d", id))
		return
	}
	ctx.SetFlash("开奖完成")
	ctx.Redirect(fmt.Sprintf("/post/%d", id))
}

type commentEditData struct {
	PageChrome
	PostID    uint
	CommentID uint
	Floor     int
	Content   string
}

// CommentEditGet 编辑评论页
func (d Deps) CommentEditGet(c *gin.Context) {
	ctx := d.ctx(c)
	postID, cm, errMsg := d.loadEditableComment(ctx, c)
	if errMsg != "" {
		ctx.SetFlash(errMsg)
		if postID > 0 {
			ctx.Redirect(fmt.Sprintf("/post/%d#comments", postID))
			return
		}
		ctx.Redirect("/")
		return
	}
	chrome := d.chrome(ctx, "编辑评论 · "+d.Settings.SiteBranding().Name, "", "")
	ctx.HTML(http.StatusOK, "post/comment_edit", commentEditData{
		PageChrome: chrome,
		PostID:     postID,
		CommentID:  cm.ID,
		Floor:      cm.Floor,
		Content:    services.HTMLToComposePlain(cm.Content),
	})
}

// CommentEditPost 保存评论编辑
func (d Deps) CommentEditPost(c *gin.Context) {
	ctx := d.ctx(c)
	postID, cm, errMsg := d.loadEditableComment(ctx, c)
	if errMsg != "" {
		ctx.SetFlash(errMsg)
		if postID > 0 {
			ctx.Redirect(fmt.Sprintf("/post/%d#comments", postID))
			return
		}
		ctx.Redirect("/")
		return
	}
	if !ctx.CheckCSRF() {
		d.renderCommentEdit(ctx, "无效请求，请重试", postID, cm, c.PostForm("content"))
		return
	}
	plain := strings.TrimSpace(c.PostForm("content"))
	if plain == "" {
		d.renderCommentEdit(ctx, "评论不能为空", postID, cm, plain)
		return
	}
	safe := services.ComposeBodyToHTML(plain)
	_, enteredPending, err := d.Comment.Update(ctx.UserID(), cm.ID, ctx.IsAdmin(), ctx.SkipsModeration(), safe)
	if err != nil {
		d.renderCommentEdit(ctx, err.Error(), postID, cm, plain)
		return
	}
	if enteredPending {
		ctx.SetFlash("评论已更新，审核通过后公开显示")
	} else {
		ctx.SetFlash("评论已更新")
	}
	ctx.Redirect(fmt.Sprintf("/post/%d#floor-%d", postID, cm.Floor))
}

// CommentDeletePost 软删评论
func (d Deps) CommentDeletePost(c *gin.Context) {
	ctx := d.ctx(c)
	postID, err := parsePostID(c, d)
	if err != nil || postID == 0 {
		d.render404(ctx)
		return
	}
	cid, err := strconv.ParseUint(c.Param("cid"), 10, 64)
	if err != nil || cid == 0 {
		d.render404(ctx)
		return
	}
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect(fmt.Sprintf("/post/%d#comments", postID))
		return
	}
	cm, err := d.Comment.GetByID(uint(cid))
	if err != nil || cm.PostID != postID {
		d.render404(ctx)
		return
	}
	if !d.Comment.CanUserDeleteComment(cm, ctx.UserID(), ctx.IsAdmin()) {
		ctx.SetFlash(services.ErrPermissionDenied.Error())
		ctx.Redirect(fmt.Sprintf("/post/%d#comments", postID))
		return
	}
	if err := d.Comment.Delete(ctx.UserID(), cm.ID, ctx.IsAdmin()); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(fmt.Sprintf("/post/%d#floor-%d", postID, cm.Floor))
		return
	}
	ctx.SetFlash("评论已删除")
	ctx.Redirect(fmt.Sprintf("/post/%d#comments", postID))
}

func (d Deps) loadEditableComment(ctx *webctx.Context, c *gin.Context) (postID uint, cm *models.Comment, errMsg string) {
	pid, err := parsePostID(c, d)
	if err != nil || pid == 0 {
		return 0, nil, "帖子不存在"
	}
	cid, err := strconv.ParseUint(c.Param("cid"), 10, 64)
	if err != nil || cid == 0 {
		return pid, nil, "评论不存在"
	}
	cm, err = d.Comment.GetByID(uint(cid))
	if err != nil || cm.PostID != pid {
		return pid, nil, "评论不存在"
	}
	if !d.Comment.CanUserEditComment(cm, ctx.UserID(), ctx.IsAdmin()) {
		return pid, cm, "无权编辑该评论或已超过可编辑时限"
	}
	return pid, cm, ""
}

func (d Deps) renderCommentEdit(ctx *webctx.Context, errMsg string, postID uint, cm *models.Comment, content string) {
	chrome := d.chrome(ctx, "编辑评论 · "+d.Settings.SiteBranding().Name, "", "")
	chrome.Error = errMsg
	ctx.HTML(http.StatusOK, "post/comment_edit", commentEditData{
		PageChrome: chrome,
		PostID:     postID,
		CommentID:  cm.ID,
		Floor:      cm.Floor,
		Content:    content,
	})
}

type postRevisionRow struct {
	ID           uint
	EditorName   string
	Title        string
	CreatedLabel string
}

type postRevisionsData struct {
	PageChrome
	PostID    uint
	PostTitle string
	Revisions []postRevisionRow
}

type postRevisionDetailData struct {
	PageChrome
	PostID       uint
	PostTitle    string
	RevID        uint
	EditorName   string
	CreatedLabel string
	Title        string
	Tags         string
	BodyHTML     string
}

// PostRevisionsGet 帖子修订历史列表（作者或管理员）
func (d Deps) PostRevisionsGet(c *gin.Context) {
	ctx := d.ctx(c)
	post, ok := d.loadRevisionPost(ctx, c)
	if !ok {
		return
	}
	revs, err := d.Post.ListRevisions(post.ID)
	if err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(fmt.Sprintf("/post/%d", post.ID))
		return
	}
	rows := make([]postRevisionRow, 0, len(revs))
	for _, r := range revs {
		name := displayName(&r.Editor)
		if name == "" {
			name = fmt.Sprintf("用户 #%d", r.EditorID)
		}
		rows = append(rows, postRevisionRow{
			ID: r.ID, EditorName: name, Title: r.Title, CreatedLabel: formatTime(r.CreatedAt),
		})
	}
	chrome := d.chrome(ctx, "修订历史 · "+post.Title+" · "+d.Settings.SiteBranding().Name, "", "")
	ctx.HTML(http.StatusOK, "post/revisions", postRevisionsData{
		PageChrome: chrome, PostID: post.ID, PostTitle: post.Title, Revisions: rows,
	})
}

// PostRevisionDetailGet 单条修订快照
func (d Deps) PostRevisionDetailGet(c *gin.Context) {
	ctx := d.ctx(c)
	post, ok := d.loadRevisionPost(ctx, c)
	if !ok {
		return
	}
	rid, err := strconv.ParseUint(c.Param("rid"), 10, 64)
	if err != nil || rid == 0 {
		d.render404(ctx)
		return
	}
	rev, err := d.Post.GetRevision(post.ID, uint(rid))
	if err != nil {
		d.render404(ctx)
		return
	}
	name := displayName(&rev.Editor)
	if name == "" {
		name = fmt.Sprintf("用户 #%d", rev.EditorID)
	}
	chrome := d.chrome(ctx, "修订 #"+strconv.FormatUint(rid, 10)+" · "+post.Title+" · "+d.Settings.SiteBranding().Name, "", "")
	ctx.HTML(http.StatusOK, "post/revision_detail", postRevisionDetailData{
		PageChrome: chrome, PostID: post.ID, PostTitle: post.Title,
		RevID: rev.ID, EditorName: name, CreatedLabel: formatTime(rev.CreatedAt),
		Title: rev.Title, Tags: rev.Tags, BodyHTML: rev.Content,
	})
}

func (d Deps) loadRevisionPost(ctx *webctx.Context, c *gin.Context) (*models.Post, bool) {
	id, err := parsePostID(c, d)
	if err != nil || id == 0 {
		d.render404(ctx)
		return nil, false
	}
	post, err := d.Post.FindByID(id)
	if err != nil || !services.CanViewPost(post, ctx.UserID(), ctx.IsAdmin()) {
		d.render404(ctx)
		return nil, false
	}
	if !canViewPostRevisions(post, ctx.UserID(), ctx.IsAdmin()) {
		ctx.SetFlash("无权查看编辑历史")
		ctx.Redirect(fmt.Sprintf("/post/%d", post.ID))
		return nil, false
	}
	return post, true
}

func canViewPostRevisions(post *models.Post, userID uint, isAdmin bool) bool {
	if post == nil || userID == 0 {
		return false
	}
	return isAdmin || post.UserID == userID
}

func parsePostID(c *gin.Context, d Deps) (uint, error) {
	idStr := stripIDParam(c.Param("id"), d.Settings.Permalink().Ext)
	id, err := strconv.ParseUint(idStr, 10, 64)
	return uint(id), err
}

package api

import (
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"git.iioio.com/freefire/jiang13-forum/config"
	"git.iioio.com/freefire/jiang13-forum/modules/auth"
	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/services"
)

// Handlers 聚合所有 HTTP 处理器
type Handlers struct {
	Cfg       *config.Config
	Store     *services.UploadStore
	Auth      *services.AuthService
	User      *services.UserService
	Board     *services.BoardService
	Post      *services.PostService
	Comment   *services.CommentService
	Message   *services.MessageService
	Notify    *services.NotifyService
	Report    *services.ReportService
	Backup    *services.BackupService
	Filter    *services.SensitiveFilter
	Limiter   *services.RateLimiter
	Settings  *services.ForumSettingsService
	Captcha   *services.CaptchaService
	Mail      *services.MailService
	EmailCode *services.EmailCodeService
	OIDC      *services.OIDCService
	Gitea     *services.GiteaService
	Points    *services.PointsService
	Badge     *services.BadgeService
	SitePage  *services.SitePageService
	FriendLinkApply *services.FriendLinkApplyService
}

func (h *Handlers) setAuthCookie(c *gin.Context, sessionID string) {
	if sessionID == "" {
		return
	}
	auth.SetSessionCookie(c, sessionID)
}

func (h *Handlers) currentUserID(c *gin.Context) uint {
	if v, ok := c.Get(auth.CtxUserID); ok {
		return v.(uint)
	}
	return 0
}

func (h *Handlers) isAdmin(c *gin.Context) bool {
	if v, ok := c.Get(auth.CtxRole); ok {
		return v == models.RoleAdmin
	}
	return false
}

// loadCurrentUser 加载当前登录用户完整资料（含认证/积分）
func (h *Handlers) loadCurrentUser(c *gin.Context) (*models.User, error) {
	uid := h.currentUserID(c)
	if uid == 0 {
		return nil, errors.New("未登录")
	}
	return h.User.GetByID(uid)
}

func (h *Handlers) skipsModeration(c *gin.Context) bool {
	u, err := h.loadCurrentUser(c)
	if err != nil {
		return h.isAdmin(c)
	}
	return u.SkipsModeration()
}

func (h *Handlers) parseGuestCommentIDs(c *gin.Context) []uint {
	raw := c.Query("my_ids")
	if raw == "" {
		return nil
	}
	var ids []uint
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		v, err := strconv.ParseUint(part, 10, 64)
		if err == nil && v > 0 {
			ids = append(ids, uint(v))
		}
	}
	return ids
}

func calcTotalPages(total int64, size int) int {
	if total == 0 {
		return 1
	}
	pages := int(total) / size
	if int(total)%size > 0 {
		pages++
	}
	if pages < 1 {
		return 1
	}
	return pages
}

// --- API ---

func (h *Handlers) APICaptcha(c *gin.Context) {
	id, svg, err := h.Captcha.Generate()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "验证码生成失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id":    id,
		"image": "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(svg)),
	})
}

// APIRegisterConfig 注册页所需公开配置
func (h *Handlers) APIRegisterConfig(c *gin.Context) {
	mailReady := h.Settings.MailReady()
	c.JSON(http.StatusOK, gin.H{
		"is_first_user":      false, // 已废弃：管理员仅由 /install 创建
		"mail_ready":         mailReady,
		"require_email_code": mailReady,
		"register_open":      mailReady,
		"email_code_len":     services.EmailCodeLen,
	})
}

// APISendRegisterEmailCode 发送注册邮箱验证码
func (h *Handlers) APISendRegisterEmailCode(c *gin.Context) {
	var req struct {
		Email string `json:"email" form:"email" binding:"required"`
	}
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if !h.Settings.MailReady() {
		c.JSON(http.StatusBadRequest, gin.H{"error": services.ErrMailNotConfigured.Error()})
		return
	}
	if err := h.EmailCode.SendRegisterCode(req.Email); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "验证码已发送"})
}

// APISendResetEmailCode 发送重置密码验证码
func (h *Handlers) APISendResetEmailCode(c *gin.Context) {
	var req struct {
		Email string `json:"email" form:"email" binding:"required"`
	}
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if !h.Settings.MailReady() {
		c.JSON(http.StatusBadRequest, gin.H{"error": services.ErrMailNotConfigured.Error()})
		return
	}
	if err := h.EmailCode.SendResetCode(req.Email); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "若该邮箱已注册，验证码将发送到邮箱"})
}

// APIResetPassword 邮箱验证码重置密码
func (h *Handlers) APIResetPassword(c *gin.Context) {
	var req struct {
		Email       string `json:"email" form:"email" binding:"required"`
		EmailCode   string `json:"email_code" form:"email_code" binding:"required"`
		NewPassword string `json:"new_password" form:"new_password" binding:"required"`
	}
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if !h.Settings.MailReady() {
		c.JSON(http.StatusBadRequest, gin.H{"error": services.ErrMailNotConfigured.Error()})
		return
	}
	if !h.EmailCode.VerifyPurpose(services.EmailCodePurposeReset, req.Email, req.EmailCode) {
		c.JSON(http.StatusBadRequest, gin.H{"error": services.ErrEmailCodeInvalid.Error()})
		return
	}
	if err := h.User.ResetPasswordByEmail(req.Email, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "密码已重置，请使用新密码登录"})
}

// APISearchUsers 用户搜索（@补全）
func (h *Handlers) APISearchUsers(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	if q == "" {
		c.JSON(http.StatusOK, gin.H{"users": []any{}})
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "8"))
	users, err := h.User.SearchUsersBrief(q, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	out := make([]gin.H, 0, len(users))
	for _, u := range users {
		out = append(out, gin.H{
			"id":       u.ID,
			"username": u.Username,
			"nickname": u.Nickname,
			"avatar":   u.Avatar,
		})
	}
	c.JSON(http.StatusOK, gin.H{"users": out})
}

func (h *Handlers) APIRegister(c *gin.Context) {
	var req struct {
		Username  string `json:"username" form:"username" binding:"required"`
		Password  string `json:"password" form:"password" binding:"required"`
		Nickname  string `json:"nickname" form:"nickname"`
		Email     string `json:"email" form:"email" binding:"required"`
		EmailCode string `json:"email_code" form:"email_code"`
	}
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	userCount := h.Auth.UserCount()
	mailReady := h.Settings.MailReady()
	if userCount > 0 && !mailReady {
		c.JSON(http.StatusBadRequest, gin.H{"error": services.ErrRegisterClosed.Error()})
		return
	}
	if mailReady {
		if !h.EmailCode.Verify(req.Email, req.EmailCode) {
			c.JSON(http.StatusBadRequest, gin.H{"error": services.ErrEmailCodeInvalid.Error()})
			return
		}
	}

	user, err := h.Auth.Register(req.Username, req.Password, req.Nickname, req.Email)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	token, _, _ := h.Auth.Login(req.Username, req.Password, c.ClientIP(), c.Request.UserAgent())
	h.setAuthCookie(c, token)
	c.JSON(http.StatusOK, gin.H{"message": "注册成功", "user_id": user.ID})
}

func (h *Handlers) APILogin(c *gin.Context) {
	var req struct {
		Username string `json:"username" form:"username" binding:"required"`
		Password string `json:"password" form:"password" binding:"required"`
	}
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	token, user, err := h.Auth.Login(req.Username, req.Password, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	h.setAuthCookie(c, token)
	c.JSON(http.StatusOK, gin.H{"message": "登录成功", "user": gin.H{"id": user.ID, "nickname": user.Nickname}})
}

func (h *Handlers) APILogout(c *gin.Context) {
	c.SetCookie(auth.CookieName, "", -1, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"message": "已退出"})
}

// APIProfileStats 当前用户活动统计（发帖 / 评论 / 收藏 / 获赞）
func (h *Handlers) APIProfileStats(c *gin.Context) {
	st, err := h.User.ActivityStats(h.currentUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"stats": st})
}

// APIUserPublic 公开用户主页（资料 + 公开统计）
func (h *Handlers) APIUserPublic(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效用户"})
		return
	}
	user, err := h.User.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "用户不存在"})
		return
	}
	st, err := h.User.ActivityStats(user.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	// 收藏数仅本人可见
	viewerID := h.currentUserID(c)
	if viewerID != user.ID {
		st.FavoriteCount = 0
	}
	view := user.ToPublic()
	if h.Badge != nil {
		_ = h.Badge.EvaluateAuto(user.ID)
		if badges, bErr := h.Badge.ListUserBadges(user.ID); bErr == nil {
			view.Badges = services.BadgeViews(badges, 0)
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"user":  view,
		"stats": st,
	})
}

func (h *Handlers) APIUpdateProfile(c *gin.Context) {
	nickname := c.PostForm("nickname")
	if err := h.User.UpdateNickname(h.currentUserID(c), nickname); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, _ := h.User.GetByID(h.currentUserID(c))
	var userView any
	if user != nil {
		userView = user.ToSelf()
	}
	c.JSON(http.StatusOK, gin.H{"message": "昵称已更新", "user": userView})
}

func (h *Handlers) APIUpdateSignature(c *gin.Context) {
	signature := c.PostForm("signature")
	if err := h.User.UpdateSignature(h.currentUserID(c), signature); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, _ := h.User.GetByID(h.currentUserID(c))
	var userView any
	if user != nil {
		userView = user.ToSelf()
	}
	c.JSON(http.StatusOK, gin.H{"message": "签名已更新", "user": userView})
}

func (h *Handlers) APIUpdatePassword(c *gin.Context) {
	oldPass := c.PostForm("old_password")
	newPass := c.PostForm("new_password")
	if err := h.User.UpdatePassword(h.currentUserID(c), oldPass, newPass); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "密码已修改"})
}

func (h *Handlers) APIUploadAvatar(c *gin.Context) {
	file, err := c.FormFile("avatar")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择头像文件"})
		return
	}
	maxBytes := int64(h.Settings.AvatarMaxMB()) * 1024 * 1024
	if file.Size > maxBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "头像文件过大"})
		return
	}
	url, err := h.User.UploadAvatar(h.currentUserID(c), file, h.Store)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "头像已更新", "avatar": url})
}

func (h *Handlers) APIUploadPostImage(c *gin.Context) {
	file, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择图片文件"})
		return
	}
	uid := h.currentUserID(c)
	url, err := services.SaveUploadedImage(
		h.Store,
		file,
		services.UploadCategoryPosts,
		fmt.Sprintf("%d", uid),
	)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "图片已上传", "url": url})
}

func (h *Handlers) APICreatePost(c *gin.Context) {
	boardID, _ := strconv.ParseUint(c.PostForm("board_id"), 10, 64)
	title := c.PostForm("title")
	content := c.PostForm("content")
	tags := c.PostForm("tags")
	postType := c.PostForm("post_type")
	skip := h.skipsModeration(c)
	post, err := h.Post.Create(h.currentUserID(c), uint(boardID), title, content, tags, postType, skip)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	extras := services.ParsePostExtrasFromForm(
		c.PostForm("poll_options"),
		c.PostForm("bounty_points"),
		c.PostForm("lottery_winner_count"),
	)
	if post.PostType == models.PostTypePoll || post.PostType == models.PostTypeBounty || post.PostType == models.PostTypeLottery {
		if err := services.FinalizeSpecialPostCreate(post, h.currentUserID(c), extras); err != nil {
			_ = h.Post.Delete(h.currentUserID(c), post.ID, true)
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
	}
	msg := "发帖成功"
	if post.Status == models.ContentStatusPending {
		msg = "已提交审核，通过后将公开显示"
		if h.Notify != nil {
			h.Notify.AsyncNotifyPendingPost(post)
		}
	}
	c.JSON(http.StatusOK, gin.H{"message": msg, "post_id": post.ID, "status": post.Status})
}

func (h *Handlers) APIUpdatePost(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	boardID, _ := strconv.ParseUint(c.PostForm("board_id"), 10, 64)
	isAdmin := h.isAdmin(c)
	skip := h.skipsModeration(c)
	err := h.Post.Update(h.currentUserID(c), uint(id), isAdmin, skip,
		c.PostForm("title"), c.PostForm("content"), c.PostForm("tags"), c.PostForm("post_type"), uint(boardID))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	// 非免审用户修改后重新进入审核
	if !skip && h.Notify != nil {
		if post, getErr := h.Post.FindByID(uint(id)); getErr == nil {
			h.Notify.AsyncNotifyPendingPost(post)
		}
	}
	c.JSON(http.StatusOK, gin.H{"message": "帖子已更新"})
}

func (h *Handlers) APIDeletePost(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.Post.Delete(h.currentUserID(c), uint(id), h.isAdmin(c)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "帖子已移入回收站"})
}

func (h *Handlers) APIToggleLike(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	liked, err := h.Post.ToggleLike(h.currentUserID(c), uint(id))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var post models.Post
	models.DB.First(&post, id)
	c.JSON(http.StatusOK, gin.H{"liked": liked, "like_count": post.LikeCount})
}

func (h *Handlers) APIToggleCommentLike(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	liked, likeCount, err := h.Comment.ToggleLike(h.currentUserID(c), uint(id))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"liked": liked, "like_count": likeCount})
}

func (h *Handlers) APIToggleFavorite(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	faved, err := h.Post.ToggleFavorite(h.currentUserID(c), uint(id))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"favorited": faved})
}

// APISetQuestionResolved 标记问答帖已解决 / 未解决
func (h *Handlers) APISetQuestionResolved(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	resolved := c.PostForm("resolved") == "1" || c.PostForm("resolved") == "true"
	if err := h.Post.SetQuestionResolved(h.currentUserID(c), uint(id), h.isAdmin(c), resolved); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	msg := "已标记为未解决"
	if resolved {
		msg = "已标记为已解决"
	}
	c.JSON(http.StatusOK, gin.H{"message": msg, "question_resolved": resolved})
}

func (h *Handlers) APICreateComment(c *gin.Context) {
	postID, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	content := c.PostForm("content")
	var replyTo *uint
	if rt := c.PostForm("reply_to"); rt != "" {
		v, _ := strconv.ParseUint(rt, 10, 64)
		u := uint(v)
		replyTo = &u
	}
	isPrivate := c.PostForm("is_private") == "1" || c.PostForm("is_private") == "true"
	uid := h.currentUserID(c)
	if uid == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请登录后评论"})
		return
	}

	in := services.CommentCreateInput{
		UserID:    uid,
		PostID:    uint(postID),
		Content:   content,
		ReplyTo:   replyTo,
		IsPrivate: isPrivate,
	}

	comment, err := h.Comment.Create(in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	msg := "评论成功"
	if h.Notify != nil {
		switch comment.Status {
		case models.ContentStatusPublished:
			h.Notify.AsyncNotifyCommentPublished(comment)
			h.Notify.AsyncNotifyCommentMentions(comment)
		case models.ContentStatusPending:
			msg = "评论已提交，审核通过后公开显示"
			h.Notify.AsyncNotifyPendingComment(comment)
		}
	} else if comment.Status == models.ContentStatusPending {
		msg = "评论已提交，审核通过后公开显示"
	}
	c.JSON(http.StatusOK, gin.H{"message": msg, "floor": comment.Floor, "id": comment.ID, "status": comment.Status})
}

func (h *Handlers) APIDeleteComment(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.Comment.Delete(h.currentUserID(c), uint(id), h.isAdmin(c)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "评论已移入回收站"})
}

func (h *Handlers) APIUpdateComment(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	content := c.PostForm("content")
	skip := h.skipsModeration(c)
	saved, enteredPending, err := h.Comment.Update(h.currentUserID(c), uint(id), h.isAdmin(c), skip, content)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	msg := "评论已更新"
	status := ""
	if comment, e := h.Comment.GetByID(uint(id)); e == nil {
		status = comment.Status
		if status == models.ContentStatusPending && !h.isAdmin(c) {
			msg = "评论已更新，审核通过后公开显示"
		}
		if enteredPending && h.Notify != nil {
			h.Notify.AsyncNotifyPendingComment(comment)
		}
	}
	c.JSON(http.StatusOK, gin.H{"message": msg, "content": saved, "status": status})
}

package handler

import (
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"git.iioio.com/freefire/jiang13-forum/middleware"
	"git.iioio.com/freefire/jiang13-forum/model"
	"git.iioio.com/freefire/jiang13-forum/service"
)

// APIMe 当前登录用户
func (h *Handlers) APIMe(c *gin.Context) {
	uid := h.currentUserID(c)
	if uid == 0 {
		c.JSON(http.StatusOK, gin.H{"user": nil})
		return
	}
	user, err := h.User.GetByID(uid)
	if err != nil {
		// 账号已删或不存在：清掉失效 cookie，与未登录态一致
		c.SetCookie(middleware.CookieName, "", -1, "/", "", false, true)
		c.JSON(http.StatusOK, gin.H{"user": nil})
		return
	}
	if h.Badge != nil {
		_ = h.Badge.EvaluateAuto(user.ID)
	}
	view := user.ToSelf()
	if h.Badge != nil {
		if badges, bErr := h.Badge.ListUserBadges(user.ID); bErr == nil {
			view.Badges = service.BadgeViews(badges, 0)
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"user": view,
	})
}

// APIBoards 板块列表（含帖子数）
func (h *Handlers) APIBoards(c *gin.Context) {
	boards, err := h.Board.ListWithStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if boards == nil {
		boards = []service.BoardWithStats{}
	}
	c.JSON(http.StatusOK, gin.H{"boards": boards})
}

// APIStats 论坛概览统计
func (h *Handlers) APIStats(c *gin.Context) {
	var userCount, postCount, boardCount int64
	model.DB.Model(&model.User{}).Count(&userCount)
	model.DB.Model(&model.Post{}).Where("status = ?", model.ContentStatusPublished).Count(&postCount)
	model.DB.Model(&model.Board{}).Count(&boardCount)
	c.JSON(http.StatusOK, gin.H{
		"users": userCount, "posts": postCount, "boards": boardCount,
	})
}

// APIForumLimits 前台可见的论坛限制配置
func (h *Handlers) APIForumLimits(c *gin.Context) {
	c.JSON(http.StatusOK, h.Settings.PublicLimits())
}

// APIAdminCreateBoard 管理员创建板块（JSON）
func (h *Handlers) APIAdminCreateBoard(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		Icon        string `json:"icon"`
		ColorIndex  int    `json:"color_index"`
		SortOrder   int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	board, err := h.Board.Create(req.Name, req.Description, req.Icon, req.ColorIndex, req.SortOrder)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "板块已创建", "board": board})
}

// APIAdminUpdateBoard 管理员更新板块
func (h *Handlers) APIAdminUpdateBoard(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		Icon        string `json:"icon"`
		ColorIndex  int    `json:"color_index"`
		SortOrder   int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.Board.Update(uint(id), req.Name, req.Description, req.Icon, req.ColorIndex, req.SortOrder); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	board, _ := h.Board.GetByID(uint(id))
	c.JSON(http.StatusOK, gin.H{"message": "板块已更新", "board": board})
}

// APIAdminDeleteBoard 管理员删除板块
func (h *Handlers) APIAdminDeleteBoard(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.Board.Delete(uint(id)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "板块已删除"})
}

// APIAdminDashboard 管理后台概览
func (h *Handlers) APIAdminDashboard(c *gin.Context) {
	var userCount, postCount, boardCount, commentCount int64
	model.DB.Model(&model.User{}).Count(&userCount)
	model.DB.Model(&model.Post{}).Where("status = ?", model.ContentStatusPublished).Count(&postCount)
	model.DB.Model(&model.Board{}).Count(&boardCount)
	model.DB.Model(&model.Comment{}).Where("status = ?", model.ContentStatusPublished).Count(&commentCount)
	pendingPosts, _ := h.Post.PendingPostCount()
	pendingComments, _ := h.Comment.PendingCommentCount()
	pendingReports, _ := h.Report.PendingCount()
	recentPosts, _, _ := h.Post.List(service.PostListQuery{
		Page: 1, Size: 8, ViewerIsAdmin: true, Status: "all",
	})
	if recentPosts == nil {
		recentPosts = []model.Post{}
	}
	c.JSON(http.StatusOK, gin.H{
		"users": userCount, "posts": postCount, "boards": boardCount,
		"comments": commentCount,
		"pending_posts":    pendingPosts,
		"pending_comments": pendingComments,
		"pending_reports":  pendingReports,
		"recent_posts":     recentPosts,
	})
}

// APIAdminPosts 管理员帖子列表
func (h *Handlers) APIAdminPosts(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	keyword := strings.TrimSpace(c.Query("keyword"))
	status := strings.TrimSpace(c.DefaultQuery("status", "all"))
	posts, total, err := h.Post.ListItems(service.PostListQuery{
		Page: page, Size: size, Keyword: keyword,
		ViewerIsAdmin: true, Status: status,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if posts == nil {
		posts = []service.PostListItem{}
	}
	pending, _ := h.Post.PendingPostCount()
	c.JSON(http.StatusOK, gin.H{
		"posts": posts, "total": total, "page": page,
		"total_pages":   calcTotalPages(total, size),
		"pending_count": pending,
		"status":        status,
	})
}

// APIAdminLockPost 锁定/解锁帖子编辑
func (h *Handlers) APIAdminLockPost(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req struct {
		Locked bool `json:"locked"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.Post.SetEditLocked(uint(id), req.Locked); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	msg := "已解锁编辑"
	if req.Locked {
		msg = "已锁定编辑"
	}
	c.JSON(http.StatusOK, gin.H{"message": msg, "edit_locked": req.Locked})
}

// APIAdminPinPost 置顶/取消置顶（JSON）
func (h *Handlers) APIAdminPinPost(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req struct {
		Pinned bool `json:"pinned"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.Post.SetPinned(uint(id), req.Pinned); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	msg := "已取消置顶"
	if req.Pinned {
		msg = "已置顶"
	}
	c.JSON(http.StatusOK, gin.H{"message": msg, "pinned": req.Pinned})
}

// APIAdminFeaturePost 设为精华/取消精华（JSON）
func (h *Handlers) APIAdminFeaturePost(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req struct {
		Featured bool `json:"featured"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.Post.SetFeatured(uint(id), req.Featured); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	msg := "已取消精华"
	if req.Featured {
		msg = "已设为精华"
	}
	c.JSON(http.StatusOK, gin.H{"message": msg, "featured": req.Featured})
}

// APIAdminDeletePost 管理员软删除帖子（进入回收站）
func (h *Handlers) APIAdminDeletePost(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.Post.Delete(0, uint(id), true); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "帖子已移入回收站"})
}

// APIAdminTrashPosts 回收站帖子列表
func (h *Handlers) APIAdminTrashPosts(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	keyword := strings.TrimSpace(c.Query("keyword"))
	posts, total, err := h.Post.ListTrash(page, size, keyword)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if posts == nil {
		posts = []service.TrashPostItem{}
	}
	c.JSON(http.StatusOK, gin.H{
		"posts": posts, "total": total, "page": page,
		"total_pages": calcTotalPages(total, size),
	})
}

// APIAdminRestorePost 从回收站恢复帖子
func (h *Handlers) APIAdminRestorePost(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.Post.Restore(uint(id)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "帖子已恢复"})
}

// APIAdminPurgePost 永久删除回收站帖子
func (h *Handlers) APIAdminPurgePost(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.Post.Purge(uint(id)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "帖子已永久删除"})
}

// APIAdminComments 管理员评论列表
func (h *Handlers) APIAdminComments(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	status := strings.TrimSpace(c.DefaultQuery("status", "all"))
	comments, total, err := h.Comment.ListRecent(page, size, status)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if comments == nil {
		comments = []model.Comment{}
	}
	pending, _ := h.Comment.PendingCommentCount()
	c.JSON(http.StatusOK, gin.H{
		"comments": comments, "total": total, "page": page,
		"total_pages":   calcTotalPages(total, size),
		"pending_count": pending,
		"status":        status,
	})
}

// APIAdminApproveComment 通过评论审核
func (h *Handlers) APIAdminApproveComment(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.Comment.SetStatus(uint(id), model.ContentStatusPublished); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if h.Notify != nil {
		if comment, err := h.Comment.GetByID(uint(id)); err == nil {
			comment.Status = model.ContentStatusPublished
			h.Notify.AsyncNotifyCommentPublished(comment)
		}
	}
	c.JSON(http.StatusOK, gin.H{"message": "评论已通过审核", "status": model.ContentStatusPublished})
}

// APIAdminRejectComment 拒绝评论并私信通知
func (h *Handlers) APIAdminRejectComment(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&req)
	reason := strings.TrimSpace(req.Reason)
	if reason == "" {
		reason = "不符合社区规范"
	}
	comment, err := h.Comment.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.Comment.SetStatus(uint(id), model.ContentStatusRejected); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if comment.UserID > 0 {
		title := comment.Post.Title
		if title == "" {
			title = "未知帖子"
		}
		pid := comment.PostID
		_, _ = h.Message.SendSystem(
			comment.UserID,
			"评论未通过审核",
			service.FormatCommentRejectContent(title, comment.PostID, comment.Floor, reason),
			model.MessageKindReject,
			&pid,
			nil,
		)
	}
	c.JSON(http.StatusOK, gin.H{"message": "已拒绝该评论并通知作者", "status": model.ContentStatusRejected})
}

// APIAdminDeleteComment 管理员删除评论
func (h *Handlers) APIAdminDeleteComment(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.Comment.AdminDelete(uint(id)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "评论已删除"})
}

// APIAdminCommentRevisions 管理员查看评论编辑历史
func (h *Handlers) APIAdminCommentRevisions(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	revs, err := h.Comment.ListRevisions(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"revisions": revs})
}

// APIAdminUsers 管理员用户列表
func (h *Handlers) APIAdminUsers(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	keyword := strings.TrimSpace(c.Query("keyword"))
	filter := strings.TrimSpace(c.DefaultQuery("filter", "all"))
	users, total, err := h.User.ListUsers(service.UserListQuery{
		Page: page, Size: size, Keyword: keyword, Filter: filter,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if users == nil {
		users = []model.User{}
	}
	c.JSON(http.StatusOK, gin.H{
		"users": model.UsersToAdmin(users), "total": total, "page": page,
		"total_pages": calcTotalPages(total, size),
		"keyword":     keyword,
		"filter":      filter,
	})
}

// APIAdminBanUser 禁言/解除禁言（JSON）
func (h *Handlers) APIAdminBanUser(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req struct {
		Banned bool `json:"banned"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.User.BanUser(uint(id), req.Banned); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	msg := "已解除禁言"
	if req.Banned {
		msg = "已禁言"
	}
	c.JSON(http.StatusOK, gin.H{"message": msg, "banned": req.Banned})
}

// APIAdminBackup 导出 SQLite 备份
func (h *Handlers) APIAdminBackup(c *gin.Context) {
	path, err := h.Backup.ExportSQLite()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	filename := filepath.Base(path)
	c.JSON(http.StatusOK, gin.H{
		"message":  "备份成功",
		"filename": filename,
		"download": "/api/admin/backup/download/" + filename,
	})
}

// APIAdminDownloadBackup 下载备份文件
func (h *Handlers) APIAdminDownloadBackup(c *gin.Context) {
	name := c.Param("name")
	if !strings.HasPrefix(name, "jiang13_backup_") || !strings.HasSuffix(name, ".db") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的备份文件名"})
		return
	}
	path := filepath.Join(h.Cfg.DataDir, name)
	c.FileAttachment(path, name)
}

// APIAdminSettings 系统设置信息
func (h *Handlers) APIAdminSettings(c *gin.Context) {
	limits := h.Settings.Limits()
	filterContent, _ := service.ReadFilterWordsFile(h.Cfg.FilterWordsPath())
	clients, _ := h.Settings.ListOAuthClients()
	c.JSON(http.StatusOK, gin.H{
		"filter_path":       h.Cfg.FilterWordsPath(),
		"data_dir":          h.Cfg.DataDir,
		"db_path":           h.Cfg.DBPath(),
		"port":              h.Cfg.Port,
		"limits":            limits,
		"mail":              h.Settings.MailConfigPublic(),
		"oidc":              h.Settings.OIDCConfigPublic(),
		"oauth_clients":     clients,
		"gitea":             h.Settings.GiteaSyncConfigPublic(),
		"storage":           h.Settings.StorageConfigPublic(),
		"branding":          h.Settings.SiteBranding(),
		"filter_words":      filterContent,
		"filter_word_count": service.CountFilterWords(filterContent),
	})
}

// APISiteBranding 前台公开的站点品牌配置
func (h *Handlers) APISiteBranding(c *gin.Context) {
	c.JSON(http.StatusOK, h.Settings.SiteBranding())
}

// APIAdminUpdateBranding 更新站点品牌文案
func (h *Handlers) APIAdminUpdateBranding(c *gin.Context) {
	var req service.SiteBranding
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.Settings.UpdateSiteBranding(req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message":  "站点品牌已保存",
		"branding": h.Settings.SiteBranding(),
	})
}

// APIAdminUploadBrandingAsset 上传 Logo / Favicon / 默认 OG 图（form: file + kind=logo|favicon|og_image）
func (h *Handlers) APIAdminUploadBrandingAsset(c *gin.Context) {
	kind := strings.TrimSpace(c.PostForm("kind"))
	if kind != "logo" && kind != "favicon" && kind != "og_image" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "kind 须为 logo、favicon 或 og_image"})
		return
	}
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择图片文件"})
		return
	}
	const maxBytes = 2 * 1024 * 1024
	if file.Size > maxBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "图片不能超过 2MB"})
		return
	}
	url, err := service.SaveUploadedImage(h.Store, file, service.UploadCategorySite, kind)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	prev := h.Settings.SiteBranding()
	switch kind {
	case "logo":
		_ = h.Settings.SetSiteLogo(url)
		h.Store.DeleteByURL(prev.Logo)
	case "favicon":
		_ = h.Settings.SetSiteFavicon(url)
		h.Store.DeleteByURL(prev.Favicon)
	case "og_image":
		_ = h.Settings.SetSiteOGImage(url)
		h.Store.DeleteByURL(prev.OGImage)
	}
	c.JSON(http.StatusOK, gin.H{
		"message":  "上传成功",
		"url":      url,
		"branding": h.Settings.SiteBranding(),
	})
}

// APIAdminClearBrandingAsset 清除 Logo / Favicon / 默认 OG 图
func (h *Handlers) APIAdminClearBrandingAsset(c *gin.Context) {
	var req struct {
		Kind string `json:"kind"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	kind := strings.TrimSpace(req.Kind)
	brand := h.Settings.SiteBranding()
	switch kind {
	case "logo":
		_ = h.Settings.SetSiteLogo("")
		h.Store.DeleteByURL(brand.Logo)
	case "favicon":
		_ = h.Settings.SetSiteFavicon("")
		h.Store.DeleteByURL(brand.Favicon)
	case "og_image":
		_ = h.Settings.SetSiteOGImage("")
		h.Store.DeleteByURL(brand.OGImage)
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "kind 须为 logo、favicon 或 og_image"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message":  "已清除",
		"branding": h.Settings.SiteBranding(),
	})
}

// APIAdminUpdateForumSettings 更新论坛设置
func (h *Handlers) APIAdminUpdateForumSettings(c *gin.Context) {
	var req service.ForumLimits
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.Settings.UpdateLimits(req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "设置已保存",
		"limits":  h.Settings.Limits(),
	})
}

// APIAdminUpdateMailSettings 更新邮件 SMTP 配置
func (h *Handlers) APIAdminUpdateMailSettings(c *gin.Context) {
	var req service.MailConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.Settings.UpdateMailConfig(req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "邮件设置已保存",
		"mail":    h.Settings.MailConfigPublic(),
	})
}

// APIAdminUpdateOIDCSettings 更新 OIDC Provider 全局配置
func (h *Handlers) APIAdminUpdateOIDCSettings(c *gin.Context) {
	var req service.OIDCConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.Settings.UpdateOIDCConfig(req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "OIDC 设置已保存",
		"oidc":    h.Settings.OIDCConfigPublic(),
	})
}

// APIProjects 会员公开 Gitea 项目列表（本地缓存）
func (h *Handlers) APIProjects(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("limit", c.DefaultQuery("size", "30")))
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 30
	}
	if size > 100 {
		size = 100
	}
	if h.Gitea == nil {
		c.JSON(http.StatusOK, gin.H{"projects": []any{}, "total": 0, "page": page, "total_pages": 0})
		return
	}
	list, total, err := h.Gitea.ListPublic(page, size)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"projects":    list,
		"total":       total,
		"page":        page,
		"total_pages": calcTotalPages(total, size),
	})
}

// APIAdminUpdateGiteaSettings 更新 Gitea 同步配置
func (h *Handlers) APIAdminUpdateGiteaSettings(c *gin.Context) {
	var req service.GiteaSyncConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.Settings.UpdateGiteaSyncConfig(req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "Gitea 同步设置已保存",
		"gitea":   h.Settings.GiteaSyncConfigPublic(),
	})
}

// APIAdminUpdateStorageSettings 更新上传存储（本地 / S3 兼容），保存后立即热切换
func (h *Handlers) APIAdminUpdateStorageSettings(c *gin.Context) {
	var req service.StorageConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.Settings.UpdateStorageConfig(req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.Store.ReloadFromSettings(h.Settings); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "配置已保存，但初始化存储失败：" + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "存储设置已保存",
		"storage": h.Settings.StorageConfigPublic(),
	})
}

// APIAdminSyncGitea 立即同步 Gitea 公开仓库
func (h *Handlers) APIAdminSyncGitea(c *gin.Context) {
	if h.Gitea == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": service.ErrGiteaNotConfigured.Error()})
		return
	}
	n, err := h.Gitea.SyncRepos()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("同步完成，共更新 %d 个仓库", n),
		"count":   n,
		"gitea":   h.Settings.GiteaSyncConfigPublic(),
	})
}

// APIAdminListOAuthClients 列出 OAuth 应用
func (h *Handlers) APIAdminListOAuthClients(c *gin.Context) {
	list, err := h.Settings.ListOAuthClients()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"clients": list})
}

// APIAdminCreateOAuthClient 创建 OAuth 应用
func (h *Handlers) APIAdminCreateOAuthClient(c *gin.Context) {
	var req service.OAuthClientInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	view, err := h.Settings.CreateOAuthClient(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "应用已创建，请立即保存客户端密钥（仅显示一次）",
		"client":  view,
		"oidc":    h.Settings.OIDCConfigPublic(),
	})
}

// APIAdminUpdateOAuthClient 更新 OAuth 应用
func (h *Handlers) APIAdminUpdateOAuthClient(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 ID"})
		return
	}
	var req service.OAuthClientInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	view, err := h.Settings.UpdateOAuthClient(uint(id), req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	msg := "应用已更新"
	if view.ClientSecret != "" {
		msg = "应用已更新，新密钥仅显示一次，请立即保存"
	}
	c.JSON(http.StatusOK, gin.H{
		"message": msg,
		"client":  view,
		"oidc":    h.Settings.OIDCConfigPublic(),
	})
}

// APIAdminDeleteOAuthClient 删除 OAuth 应用
func (h *Handlers) APIAdminDeleteOAuthClient(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效 ID"})
		return
	}
	if err := h.Settings.DeleteOAuthClient(uint(id)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "应用已删除",
		"oidc":    h.Settings.OIDCConfigPublic(),
	})
}

// APIAdminTestMail 发送测试邮件
func (h *Handlers) APIAdminTestMail(c *gin.Context) {
	var req struct {
		To string `json:"to" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请填写收件邮箱"})
		return
	}
	if err := service.ValidateEmail(req.To); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !h.Settings.MailReady() {
		c.JSON(http.StatusBadRequest, gin.H{"error": service.ErrMailNotConfigured.Error()})
		return
	}
	siteName := h.Settings.SiteBranding().Name
	err := h.Mail.Send(service.NormalizeEmail(req.To), "邮件配置测试",
		fmt.Sprintf("这是一封来自%s的测试邮件，说明 SMTP 配置正常。", siteName))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "测试邮件已发送"})
}

// APIAdminFilterWords 读取敏感词配置
func (h *Handlers) APIAdminFilterWords(c *gin.Context) {
	content, err := service.ReadFilterWordsFile(h.Cfg.FilterWordsPath())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取敏感词配置失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"content":    content,
		"word_count": service.CountFilterWords(content),
		"path":       h.Cfg.FilterWordsPath(),
	})
}

// APIAdminUpdateFilterWords 更新敏感词配置
func (h *Handlers) APIAdminUpdateFilterWords(c *gin.Context) {
	var req struct {
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := service.WriteFilterWordsFile(h.Cfg.FilterWordsPath(), req.Content, h.Filter); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存敏感词配置失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message":    "敏感词已保存并生效",
		"word_count": service.CountFilterWords(req.Content),
	})
}

// APIPosts 帖子列表（分页）
func (h *Handlers) APIPosts(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", strconv.Itoa(h.Settings.PageSizeDefault())))
	boardID, _ := strconv.ParseUint(c.Query("board_id"), 10, 64)
	userID, _ := strconv.ParseUint(c.Query("user_id"), 10, 64)
	keyword := c.Query("keyword")

	q := service.PostListQuery{
		BoardID:       uint(boardID),
		UserID:        uint(userID),
		Page:          page,
		Size:          size,
		Keyword:       keyword,
		Sort:          c.DefaultQuery("sort", "latest"),
		ViewerID:      h.currentUserID(c),
		ViewerIsAdmin: h.isAdmin(c),
	}
	items, total, err := h.Post.ListItems(q)
	if err != nil {
		if isClientLimitError(err) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if items == nil {
		items = []service.PostListItem{}
	}
	if h.Badge != nil {
		users := make([]*model.User, 0, len(items))
		for i := range items {
			if items[i].User.ID > 0 {
				users = append(users, &items[i].User)
			}
		}
		h.Badge.AttachBadgeSummaries(users, 2)
	}
	c.JSON(http.StatusOK, gin.H{
		"posts": items,
		"total": total,
		"page":  page,
		"size":  size,
		"has_more": int64(page*size) < total,
	})
}

// APIPostDetail 帖子详情
func (h *Handlers) APIPostDetail(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	post, err := h.Post.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "帖子不存在"})
		return
	}
	uid := h.currentUserID(c)
	isAdmin := h.isAdmin(c)
	if !service.CanViewPost(post, uid, isAdmin) {
		c.JSON(http.StatusNotFound, gin.H{"error": "帖子不存在"})
		return
	}
	if c.Query("skip_view") != "1" && post.Status == model.ContentStatusPublished {
		h.Post.RecordView(uint(id))
	}
	// 出口再消毒：兼容库内历史脏 HTML（如 <style>），避免旧帖污染整页
	post.Content = service.SanitizePostHTML(post.Content)
	hasReplied := uid > 0 && h.Comment.HasUserReplied(uint(id), uid)
	if uid == 0 {
		post.Content = service.RedactMembersOnlyHTML(post.Content)
		post.Content = service.RedactReplyOnlyHTML(post.Content)
	} else if !isAdmin && post.UserID != uid && !hasReplied {
		// 作者与管理员始终可见；其他用户需已回复
		post.Content = service.RedactReplyOnlyHTML(post.Content)
	}
	// 积分解锁块：作者/站长全文；其他人按解锁记录 redact
	if isAdmin || post.UserID == uid {
		post.Content = service.RevealAllPointsOnly(post.Content)
	} else {
		unlocked, _ := service.ListUnlockedKeys(uid, uint(id))
		post.Content = service.RedactPointsOnlyHTML(post.Content, unlocked)
	}
	comments, _ := h.Comment.ListByPost(uint(id), uid, isAdmin, post.UserID, h.parseGuestCommentIDs(c))
	if h.Badge != nil {
		if post.User.ID > 0 {
			h.Badge.AttachBadgeSummaries([]*model.User{&post.User}, 3)
		}
		h.Badge.AttachBadgeSummariesOnComments(comments, 2)
	}
	canEdit := h.Post.CanUserEdit(post, uid, isAdmin)
	editReason := ""
	if !canEdit && uid > 0 {
		editReason = h.Post.UserEditBlockReason(post, uid, isAdmin)
	}
	isEdited := post.UpdatedAt.Sub(post.CreatedAt) > time.Minute
	c.JSON(http.StatusOK, gin.H{
		"post":                   post,
		"comment_count":          len(comments),
		"liked":                  h.Post.IsLiked(uid, uint(id)),
		"favorited":              h.Post.IsFavorited(uid, uint(id)),
		"has_replied":            hasReplied,
		"can_edit":               canEdit,
		"edit_block_reason":      editReason,
		"is_edited":              isEdited,
		"post_edit_window_hours": h.Settings.PostEditWindowHours(),
	})
}

// APIPostComments 楼层列表
func (h *Handlers) APIPostComments(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	post, err := h.Post.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "帖子不存在"})
		return
	}
	uid := h.currentUserID(c)
	isAdmin := h.isAdmin(c)
	if !service.CanViewPost(post, uid, isAdmin) {
		c.JSON(http.StatusNotFound, gin.H{"error": "帖子不存在"})
		return
	}
	comments, err := h.Comment.ListByPost(uint(id), uid, isAdmin, post.UserID, h.parseGuestCommentIDs(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if comments == nil {
		comments = []model.Comment{}
	}
	if h.Badge != nil {
		h.Badge.AttachBadgeSummariesOnComments(comments, 2)
	}
	c.JSON(http.StatusOK, gin.H{"comments": comments, "total": len(comments)})
}

// APIHotPosts 热门 TOP
func (h *Handlers) APIHotPosts(c *gin.Context) {
	items, err := h.Post.HotPosts(10)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"posts": items})
}

// APITags 标签云（按使用次数聚合）
func (h *Handlers) APITags(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "40"))
	tags, err := h.Post.PopularTags(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tags": tags})
}

// APIRecentComments 最新公开评论
func (h *Handlers) APIRecentComments(c *gin.Context) {
	list, err := h.Comment.ListRecentPublic(8)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if list == nil {
		list = []service.RecentCommentItem{}
	}
	c.JSON(http.StatusOK, gin.H{"comments": list})
}

// APIFavorites 我的收藏
func (h *Handlers) APIFavorites(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	favs, total, err := h.Post.ListFavorites(h.currentUserID(c), page, size)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if favs == nil {
		favs = []model.PostFavorite{}
	}
	c.JSON(http.StatusOK, gin.H{"favorites": favs, "total": total, "page": page})
}

// APIPostRevisions 帖子编辑历史列表（作者或管理员）
func (h *Handlers) APIPostRevisions(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	post, err := h.Post.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "帖子不存在"})
		return
	}
	uid := h.currentUserID(c)
	isAdmin := h.isAdmin(c)
	if !isAdmin && post.UserID != uid {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权查看编辑历史"})
		return
	}
	revs, err := h.Post.ListRevisions(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"revisions": revs})
}

// APIPostRevisionDetail 查看某个历史版本
func (h *Handlers) APIPostRevisionDetail(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	revID, _ := strconv.ParseUint(c.Param("revId"), 10, 64)
	post, err := h.Post.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "帖子不存在"})
		return
	}
	uid := h.currentUserID(c)
	isAdmin := h.isAdmin(c)
	if !isAdmin && post.UserID != uid {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权查看编辑历史"})
		return
	}
	rev, err := h.Post.GetRevision(uint(id), uint(revID))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"revision": rev})
}

func isClientLimitError(err error) bool {
	return errors.Is(err, service.ErrSearchKeywordTooShort) ||
		errors.Is(err, service.ErrSearchKeywordTooLong)
}

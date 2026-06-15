package handler

import (
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
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
		c.JSON(http.StatusOK, gin.H{"user": nil})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"user": user,
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
	model.DB.Model(&model.Post{}).Count(&postCount)
	model.DB.Model(&model.Board{}).Count(&boardCount)
	c.JSON(http.StatusOK, gin.H{
		"users": userCount, "posts": postCount, "boards": boardCount,
	})
}

// APIAdminCreateBoard 管理员创建板块（JSON）
func (h *Handlers) APIAdminCreateBoard(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		SortOrder   int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	board, err := h.Board.Create(req.Name, req.Description, req.SortOrder)
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
		SortOrder   int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.Board.Update(uint(id), req.Name, req.Description, req.SortOrder); err != nil {
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
	model.DB.Model(&model.Post{}).Count(&postCount)
	model.DB.Model(&model.Board{}).Count(&boardCount)
	model.DB.Model(&model.Comment{}).Count(&commentCount)
	recentPosts, _, _ := h.Post.List(service.PostListQuery{Page: 1, Size: 8})
	if recentPosts == nil {
		recentPosts = []model.Post{}
	}
	c.JSON(http.StatusOK, gin.H{
		"users": userCount, "posts": postCount, "boards": boardCount,
		"comments": commentCount, "online": h.Online.Count(),
		"recent_posts": recentPosts,
	})
}

// APIAdminPosts 管理员帖子列表
func (h *Handlers) APIAdminPosts(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	keyword := strings.TrimSpace(c.Query("keyword"))
	posts, total, err := h.Post.List(service.PostListQuery{Page: page, Size: size, Keyword: keyword})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if posts == nil {
		posts = []model.Post{}
	}
	c.JSON(http.StatusOK, gin.H{
		"posts": posts, "total": total, "page": page,
		"total_pages": calcTotalPages(total, size),
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

// APIAdminDeletePost 管理员删除帖子
func (h *Handlers) APIAdminDeletePost(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.Post.Delete(0, uint(id), true); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "帖子已删除"})
}

// APIAdminComments 管理员评论列表
func (h *Handlers) APIAdminComments(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	comments, total, err := h.Comment.ListRecent(page, size)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if comments == nil {
		comments = []model.Comment{}
	}
	c.JSON(http.StatusOK, gin.H{
		"comments": comments, "total": total, "page": page,
		"total_pages": calcTotalPages(total, size),
	})
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

// APIAdminUsers 管理员用户列表
func (h *Handlers) APIAdminUsers(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	users, total, err := h.User.ListUsers(page, size)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if users == nil {
		users = []model.User{}
	}
	c.JSON(http.StatusOK, gin.H{
		"users": users, "total": total, "page": page,
		"total_pages": calcTotalPages(total, size),
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
	forum := h.Settings.ForumSettings()
	c.JSON(http.StatusOK, gin.H{
		"filter_path":            h.Cfg.FilterWordsPath(),
		"data_dir":               h.Cfg.DataDir,
		"db_path":                h.Cfg.DBPath(),
		"port":                   h.Cfg.Port,
		"post_edit_window_hours": forum["post_edit_window_hours"],
	})
}

// APIAdminUpdateForumSettings 更新论坛设置
func (h *Handlers) APIAdminUpdateForumSettings(c *gin.Context) {
	var req struct {
		PostEditWindowHours int `json:"post_edit_window_hours"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.Settings.SetPostEditWindowHours(req.PostEditWindowHours); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message":                "设置已保存",
		"post_edit_window_hours": req.PostEditWindowHours,
	})
}

// APIPosts 帖子列表（分页）
func (h *Handlers) APIPosts(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "30"))
	boardID, _ := strconv.ParseUint(c.Query("board_id"), 10, 64)
	keyword := c.Query("keyword")

	q := service.PostListQuery{
		BoardID: uint(boardID),
		Page:    page,
		Size:    size,
		Keyword: keyword,
		Sort:    c.DefaultQuery("sort", "latest"),
	}
	items, total, err := h.Post.ListItems(q)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if items == nil {
		items = []service.PostListItem{}
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
	post, err := h.Post.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "帖子不存在"})
		return
	}
	uid := h.currentUserID(c)
	if uid == 0 {
		post.Content = service.RedactMembersOnlyHTML(post.Content)
	}
	comments, _ := h.Comment.ListByPost(uint(id), uid, h.isAdmin(c), post.UserID, h.parseGuestCommentIDs(c))
	isAdmin := h.isAdmin(c)
	canEdit := h.Post.CanUserEdit(post, uid, isAdmin)
	editReason := ""
	if !canEdit && uid > 0 {
		editReason = h.Post.UserEditBlockReason(post, uid, isAdmin)
	}
	isEdited := post.UpdatedAt.Sub(post.CreatedAt) > time.Minute
	c.JSON(http.StatusOK, gin.H{
		"post":               post,
		"comment_count":      len(comments),
		"liked":              h.Post.IsLiked(uid, uint(id)),
		"favorited":          h.Post.IsFavorited(uid, uint(id)),
		"can_edit":           canEdit,
		"edit_block_reason":  editReason,
		"is_edited":          isEdited,
		"post_edit_window_hours": h.Settings.PostEditWindowHours(),
	})
}

// APIPostComments 楼层列表
func (h *Handlers) APIPostComments(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	post, err := h.Post.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "帖子不存在"})
		return
	}
	comments, err := h.Comment.ListByPost(uint(id), h.currentUserID(c), h.isAdmin(c), post.UserID, h.parseGuestCommentIDs(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if comments == nil {
		comments = []model.Comment{}
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

// APINotifications 最新动态通知
func (h *Handlers) APINotifications(c *gin.Context) {
	posts, _, _ := h.Post.List(service.PostListQuery{Page: 1, Size: 8})
	type notice struct {
		ID        uint   `json:"id"`
		Title     string `json:"title"`
		Type      string `json:"type"`
		CreatedAt string `json:"created_at"`
	}
	list := make([]notice, 0, len(posts))
	for _, p := range posts {
		list = append(list, notice{
			ID: p.ID, Title: p.Title, Type: "post",
			CreatedAt: p.CreatedAt.Format("01-02 15:04"),
		})
	}
	c.JSON(http.StatusOK, gin.H{"notifications": list})
}

// APIOnline 当前浏览统计
func (h *Handlers) APIOnline(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"count":   h.Online.Count(),
		"members": h.Online.CountMembers(),
		"guests":  h.Online.CountGuests(),
		"users":   h.Online.List(20),
	})
}

// APIPresence 上报浏览心跳（会员与游客均可）
func (h *Handlers) APIPresence(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"count":   h.Online.Count(),
		"members": h.Online.CountMembers(),
		"guests":  h.Online.CountGuests(),
	})
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
	post, err := h.Post.GetByID(uint(id))
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
	post, err := h.Post.GetByID(uint(id))
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

func (h *Handlers) APIPing(c *gin.Context) {
	h.APIPresence(c)
}

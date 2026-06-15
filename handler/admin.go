package handler

import (
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/jiang13/forum/model"
	"github.com/jiang13/forum/service"
)

// --- 后台管理页面 ---

func (h *Handlers) adminPageData(c *gin.Context, title, activeNav string, data gin.H) gin.H {
	if data == nil {
		data = gin.H{}
	}
	data["ActiveNav"] = activeNav
	return h.pageData(c, title, data)
}

func (h *Handlers) AdminLoginPage(c *gin.Context) {
	c.HTML(http.StatusOK, "admin/login.html", h.pageData(c, "后台登录", gin.H{
		"ActiveNav":   "login",
		"QueryBanned": c.Query("banned"),
	}))
}

func (h *Handlers) AdminDashboard(c *gin.Context) {
	var userCount, postCount, boardCount, commentCount int64
	model.DB.Model(&model.User{}).Count(&userCount)
	model.DB.Model(&model.Post{}).Count(&postCount)
	model.DB.Model(&model.Board{}).Count(&boardCount)
	model.DB.Model(&model.Comment{}).Count(&commentCount)
	recentPosts, _, _ := h.Post.List(service.PostListQuery{Page: 1, Size: 8})
	c.HTML(http.StatusOK, "admin/dashboard.html", h.adminPageData(c, "仪表盘", "dashboard", gin.H{
		"UserCount":    userCount,
		"PostCount":    postCount,
		"BoardCount":   boardCount,
		"CommentCount": commentCount,
		"OnlineCount":  h.Online.Count(),
		"RecentPosts":  recentPosts,
	}))
}

func (h *Handlers) AdminBoardsPage(c *gin.Context) {
	boards, _ := h.Board.ListWithStats()
	c.HTML(http.StatusOK, "admin/boards.html", h.adminPageData(c, "板块管理", "boards", gin.H{
		"Boards": boards,
	}))
}

func (h *Handlers) AdminPostsPage(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	keyword := strings.TrimSpace(c.Query("keyword"))
	posts, total, _ := h.Post.List(service.PostListQuery{Page: page, Size: 20, Keyword: keyword})
	c.HTML(http.StatusOK, "admin/posts.html", h.adminPageData(c, "帖子管理", "posts", gin.H{
		"Posts":     posts,
		"Total":     total,
		"Page":      page,
		"Keyword":   keyword,
		"TotalPages": calcTotalPages(total, 20),
	}))
}

func (h *Handlers) AdminCommentsPage(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	comments, total, _ := h.Comment.ListRecent(page, 20)
	c.HTML(http.StatusOK, "admin/comments.html", h.adminPageData(c, "评论管理", "comments", gin.H{
		"Comments":   comments,
		"Total":      total,
		"Page":       page,
		"TotalPages": calcTotalPages(total, 20),
	}))
}

func (h *Handlers) AdminUsersPage(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	users, total, _ := h.User.ListUsers(page, 20)
	c.HTML(http.StatusOK, "admin/users.html", h.adminPageData(c, "用户管理", "users", gin.H{
		"Users":      users,
		"Total":      total,
		"Page":       page,
		"TotalPages": calcTotalPages(total, 20),
	}))
}

func (h *Handlers) AdminSettingsPage(c *gin.Context) {
	c.HTML(http.StatusOK, "admin/settings.html", h.adminPageData(c, "系统设置", "settings", gin.H{
		"FilterPath": h.Cfg.FilterWordsPath(),
		"DataDir":    h.Cfg.DataDir,
		"DBPath":     h.Cfg.DBPath(),
		"Port":       h.Cfg.Port,
	}))
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

// --- 后台 API ---

func (h *Handlers) AdminAPICreateBoard(c *gin.Context) {
	sortOrder, _ := strconv.Atoi(c.PostForm("sort_order"))
	board, err := h.Board.Create(c.PostForm("name"), c.PostForm("description"), sortOrder)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "板块已创建", "id": board.ID})
}

func (h *Handlers) AdminAPIUpdateBoard(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	sortOrder, _ := strconv.Atoi(c.PostForm("sort_order"))
	if err := h.Board.Update(uint(id), c.PostForm("name"), c.PostForm("description"), sortOrder); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "板块已更新"})
}

func (h *Handlers) AdminAPIDeleteBoard(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.Board.Delete(uint(id)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "板块已删除"})
}

func (h *Handlers) AdminAPIPinPost(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	pinned := c.PostForm("pinned") == "true" || c.PostForm("pinned") == "1"
	if err := h.Post.SetPinned(uint(id), pinned); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	msg := "已取消置顶"
	if pinned {
		msg = "已置顶"
	}
	c.JSON(http.StatusOK, gin.H{"message": msg, "pinned": pinned})
}

func (h *Handlers) AdminAPIDeletePost(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.Post.Delete(0, uint(id), true); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "帖子已删除"})
}

func (h *Handlers) AdminAPIDeleteComment(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.Comment.AdminDelete(uint(id)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "评论已删除"})
}

func (h *Handlers) AdminAPIBanUser(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	banned := c.PostForm("banned") == "true" || c.PostForm("banned") == "1"
	if err := h.User.BanUser(uint(id), banned); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	msg := "已解除禁言"
	if banned {
		msg = "已禁言"
	}
	c.JSON(http.StatusOK, gin.H{"message": msg})
}

func (h *Handlers) AdminAPIBackup(c *gin.Context) {
	path, err := h.Backup.ExportSQLite()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	filename := filepath.Base(path)
	c.JSON(http.StatusOK, gin.H{
		"message":  "备份成功",
		"path":     path,
		"filename": filename,
		"download": "/admin/api/backup/download/" + filename,
	})
}

func (h *Handlers) AdminDownloadBackup(c *gin.Context) {
	name := c.Param("name")
	if !strings.HasPrefix(name, "jiang13_backup_") || !strings.HasSuffix(name, ".db") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的备份文件名"})
		return
	}
	path := filepath.Join(h.Cfg.DataDir, name)
	c.FileAttachment(path, name)
}

func (h *Handlers) AdminAPILogin(c *gin.Context) {
	var req struct {
		Username string `json:"username" form:"username" binding:"required"`
		Password string `json:"password" form:"password" binding:"required"`
	}
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	token, user, err := h.Auth.Login(req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	if user.Role != model.RoleAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "需要管理员账号才能登录后台"})
		return
	}
	h.setAuthCookie(c, token)
	c.JSON(http.StatusOK, gin.H{
		"message": "登录成功",
		"user": gin.H{
			"id": user.ID, "nickname": user.Nickname, "role": user.Role,
		},
	})
}

func (h *Handlers) AdminAPILogout(c *gin.Context) {
	h.APILogout(c)
}

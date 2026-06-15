package handler

import (
	"net/http"
	"strconv"

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
	c.JSON(http.StatusOK, gin.H{
		"post": post,
		"comment_count": len(comments),
		"liked": h.Post.IsLiked(uid, uint(id)),
		"favorited": h.Post.IsFavorited(uid, uint(id)),
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

func (h *Handlers) APIPing(c *gin.Context) {
	h.APIPresence(c)
}

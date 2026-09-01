package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// APIMyPostImages 当前用户已上传的帖子图片列表
func (h *Handlers) APIMyPostImages(c *gin.Context) {
	if h.Store == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "上传存储未初始化"})
		return
	}
	uid := h.currentUserID(c)
	if uid == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "24"))
	result, err := h.Store.ListUserPostImages(uid, page, size)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// APIAdminMedia 列出媒体资源
func (h *Handlers) APIAdminMedia(c *gin.Context) {
	if h.Store == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "上传存储未初始化"})
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "24"))
	category := c.DefaultQuery("category", "all")
	query := c.Query("q")
	result, err := h.Store.ListMedia(category, query, page, size)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// APIAdminDeleteMedia 批量删除媒体
func (h *Handlers) APIAdminDeleteMedia(c *gin.Context) {
	if h.Store == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "上传存储未初始化"})
		return
	}
	var req struct {
		URLs []string `json:"urls"`
		URL  string   `json:"url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	urls := make([]string, 0, len(req.URLs)+1)
	for _, u := range req.URLs {
		u = strings.TrimSpace(u)
		if u != "" {
			urls = append(urls, u)
		}
	}
	if u := strings.TrimSpace(req.URL); u != "" {
		urls = append(urls, u)
	}
	if len(urls) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择要删除的文件"})
		return
	}
	if len(urls) > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "单次最多删除 100 个文件"})
		return
	}
	n, err := h.Store.DeleteMedia(urls)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message": "已删除 " + strconv.Itoa(n) + " 项媒体",
		"deleted": n,
	})
}

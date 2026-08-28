package api

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/services"
)

// APIPages 已发布单页摘要列表
func (h *Handlers) APIPages(c *gin.Context) {
	pages, err := h.SitePage.ListPublished()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if pages == nil {
		pages = []services.SitePageSummary{}
	}
	c.JSON(http.StatusOK, gin.H{"pages": pages})
}

// APIPageDetail 单页详情
func (h *Handlers) APIPageDetail(c *gin.Context) {
	slug := c.Param("slug")
	allowDraft := h.isAdmin(c)
	page, err := h.SitePage.GetBySlug(slug, allowDraft)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "页面不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"page": page})
}

// APIAdminGetPage 管理端单页详情
func (h *Handlers) APIAdminGetPage(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的单页 ID"})
		return
	}
	page, err := h.SitePage.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "单页不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"page": page})
}

// APIAdminPages 管理端单页列表
func (h *Handlers) APIAdminPages(c *gin.Context) {
	pages, err := h.SitePage.ListAll()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if pages == nil {
		pages = []models.SitePage{}
	}
	c.JSON(http.StatusOK, gin.H{"pages": pages})
}

// APIAdminCreatePage 创建单页
func (h *Handlers) APIAdminCreatePage(c *gin.Context) {
	var in services.SitePageInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式无效"})
		return
	}
	page, err := h.SitePage.Create(in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "单页已创建", "page": page})
}

// APIAdminUpdatePage 更新单页
func (h *Handlers) APIAdminUpdatePage(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var in services.SitePageInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式无效"})
		return
	}
	if err := h.SitePage.Update(uint(id), in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "单页已更新"})
}

// APIAdminDeletePage 删除单页
func (h *Handlers) APIAdminDeletePage(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.SitePage.Delete(uint(id)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "单页已删除"})
}

// APIAdminSetPagePublished 切换单页发布状态
func (h *Handlers) APIAdminSetPagePublished(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的单页 ID"})
		return
	}
	var body struct {
		Published bool `json:"published"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式无效"})
		return
	}
	if err := h.SitePage.SetPublished(uint(id), body.Published); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	msg := "已取消发布"
	if body.Published {
		msg = "已发布"
	}
	c.JSON(http.StatusOK, gin.H{"message": msg, "published": body.Published})
}

// APIPollVote 投票
func (h *Handlers) APIPollVote(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var body struct {
		OptionIDs []uint `json:"option_ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式无效"})
		return
	}
	if err := services.VotePoll(uint(id), h.currentUserID(c), body.OptionIDs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	poll, _ := services.GetPollView(uint(id), h.currentUserID(c))
	c.JSON(http.StatusOK, gin.H{"message": "投票成功", "poll": poll})
}

// APIPollClose 结束投票
func (h *Handlers) APIPollClose(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	post, err := h.Post.FindByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "帖子不存在"})
		return
	}
	if err := services.ClosePoll(uint(id), h.currentUserID(c), h.isAdmin(c), post.UserID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	poll, _ := services.GetPollView(uint(id), h.currentUserID(c))
	c.JSON(http.StatusOK, gin.H{"message": "投票已结束", "poll": poll})
}

// APIBountyAward 采纳悬赏
func (h *Handlers) APIBountyAward(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	commentID, _ := strconv.ParseUint(c.PostForm("comment_id"), 10, 64)
	if commentID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择评论"})
		return
	}
	if err := services.AwardBounty(uint(id), h.currentUserID(c), h.isAdmin(c), uint(commentID)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "悬赏已发放"})
}

// APIBountyRefund 退回悬赏
func (h *Handlers) APIBountyRefund(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := services.RefundBounty(uint(id), h.currentUserID(c), h.isAdmin(c)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "悬赏已退回"})
}

// APILotteryDraw 帖内抽奖开奖
func (h *Handlers) APILotteryDraw(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	view, err := services.DrawPostLottery(uint(id), h.currentUserID(c), h.isAdmin(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "开奖完成", "lottery": view})
}

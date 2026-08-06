package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"git.iioio.com/freefire/jiang13-forum/model"
	"git.iioio.com/freefire/jiang13-forum/service"
)

// APIMessageConversations 会话列表（按对方聚合）
func (h *Handlers) APIMessageConversations(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "30"))
	list, total, err := h.Message.ListConversations(service.ConversationListQuery{
		UserID: h.currentUserID(c),
		Page:   page,
		Size:   size,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"conversations": list,
		"total":         total,
		"page":          page,
	})
}

// APIConversationMessages 某会话内消息
func (h *Handlers) APIConversationMessages(c *gin.Context) {
	peerID, err := strconv.ParseUint(c.Param("peerId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的会话"})
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "50"))
	before, _ := strconv.ParseUint(c.DefaultQuery("before", "0"), 10, 64)
	uid := h.currentUserID(c)

	list, total, err := h.Message.ListConversationMessages(service.ConversationMessagesQuery{
		UserID: uid,
		PeerID: uint(peerID),
		Page:   page,
		Size:   size,
		Before: uint(before),
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 首次打开（非向上翻页）时标已读
	if before == 0 {
		_ = h.Message.MarkConversationRead(uid, uint(peerID))
		for i := range list {
			if list[i].ToUserID == uid {
				list[i].IsRead = true
			}
		}
	}

	var peer *model.User
	if peerID > 0 {
		var u model.User
		if err := model.DB.First(&u, uint(peerID)).Error; err == nil {
			peer = &u
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"messages":     list,
		"total":        total,
		"peer_user_id": uint(peerID),
		"peer_user":    peer,
		"is_system":    peerID == 0,
	})
}

// APIMarkConversationRead 将会话标为已读
func (h *Handlers) APIMarkConversationRead(c *gin.Context) {
	peerID, err := strconv.ParseUint(c.Param("peerId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的会话"})
		return
	}
	if err := h.Message.MarkConversationRead(h.currentUserID(c), uint(peerID)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已标为已读"})
}

// APIMessageUnreadCount 未读私信数（含私信/通知分项）
func (h *Handlers) APIMessageUnreadCount(c *gin.Context) {
	total, dm, notify, err := h.Message.UnreadCounts(h.currentUserID(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"count":        total,
		"dm_count":     dm,
		"notify_count": notify,
	})
}

// APIMessageNotifications 系统通知列表
func (h *Handlers) APIMessageNotifications(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "30"))
	kind := c.Query("kind")
	uid := h.currentUserID(c)
	list, total, err := h.Message.ListNotifications(uid, page, size, kind)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"notifications": list,
		"total":         total,
		"page":          page,
		"kind":          kind,
	})
}

// APIMarkNotificationsRead 系统通知全部已读
func (h *Handlers) APIMarkNotificationsRead(c *gin.Context) {
	if err := h.Message.MarkNotificationsRead(h.currentUserID(c)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "通知已全部标为已读"})
}

// APISendMessage 发送私信
func (h *Handlers) APISendMessage(c *gin.Context) {
	var req struct {
		ToUserID uint   `json:"to_user_id"`
		Subject  string `json:"subject"`
		Content  string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	msg, err := h.Message.Send(service.MessageSendInput{
		FromUserID: h.currentUserID(c),
		ToUserID:   req.ToUserID,
		Subject:    req.Subject,
		Content:    req.Content,
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": msg})
}

// APIMarkAllMessagesRead 全部已读
func (h *Handlers) APIMarkAllMessagesRead(c *gin.Context) {
	if err := h.Message.MarkAllRead(h.currentUserID(c)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已全部标为已读"})
}

package handler

import (
	"net/http"
	"strconv"

	"git.iioio.com/freefire/jiang13-forum/service"
	"github.com/gin-gonic/gin"
)

// APIAdminInviteCodes 列出全部邀请码与强制邀请码开关
func (h *Handlers) APIAdminInviteCodes(c *gin.Context) {
	list, err := h.InviteCode.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"invite_codes":    list,
		"invite_required": h.Settings.InviteRequired(),
	})
}

// APIAdminCreateInviteCode 创建邀请码
func (h *Handlers) APIAdminCreateInviteCode(c *gin.Context) {
	var req struct {
		Code    string `json:"code"`
		MaxUses int    `json:"max_uses"`
		Note    string `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	ic, err := h.InviteCode.Create(req.Code, req.MaxUses, req.Note, h.currentUserID(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "邀请码已创建", "invite_code": ic})
}

// APIAdminDeleteInviteCode 删除邀请码
func (h *Handlers) APIAdminDeleteInviteCode(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.InviteCode.Delete(uint(id)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "邀请码已删除"})
}

// APIAdminToggleInviteCode 启用/停用邀请码
func (h *Handlers) APIAdminToggleInviteCode(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	ic, err := h.InviteCode.Toggle(uint(id))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已更新", "invite_code": ic})
}

// APIAdminUpdateRegisterSettings 更新注册设置（强制邀请码开关）
func (h *Handlers) APIAdminUpdateRegisterSettings(c *gin.Context) {
	var req struct {
		InviteRequired bool `json:"invite_required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.Settings.SetInviteRequired(req.InviteRequired); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": service.ErrInvalidSetting.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"message":         "注册设置已保存",
		"invite_required": h.Settings.InviteRequired(),
	})
}

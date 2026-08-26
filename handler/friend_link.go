package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/service"
	"github.com/gin-gonic/gin"
)

// APIApplyFriendLink 提交友情链接申请
func (h *Handlers) APIApplyFriendLink(c *gin.Context) {
	uid := h.currentUserID(c)
	if uid == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	var req struct {
		Name              string `json:"name"`
		URL               string `json:"url"`
		Logo              string `json:"logo"`
		LinkOnHomepage    bool   `json:"link_on_homepage"`
		ReciprocalPageURL string `json:"reciprocal_page_url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	result, err := h.FriendLinkApply.Create(service.FriendLinkApplyInput{
		UserID:            uid,
		Name:              req.Name,
		URL:               req.URL,
		Logo:              req.Logo,
		LinkOnHomepage:    req.LinkOnHomepage,
		ReciprocalPageURL: req.ReciprocalPageURL,
		OurSiteURL:        h.publicBaseURL(c),
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	resp := gin.H{
		"message": friendLinkApplySubmittedMessage(h.Settings.FriendLinkReciprocalCheckEnabled(), false),
		"apply":   result.Apply,
	}
	c.JSON(http.StatusOK, resp)
}

// APIUploadFriendLinkLogo 上传友链申请 LOGO
func (h *Handlers) APIUploadFriendLinkLogo(c *gin.Context) {
	uid := h.currentUserID(c)
	if uid == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	file, err := c.FormFile("logo")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择 LOGO 图片"})
		return
	}
	maxBytes := int64(h.Settings.AvatarMaxMB()) * 1024 * 1024
	if file.Size > maxBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "图片文件过大"})
		return
	}
	url, err := service.SaveUploadedImage(
		h.Store,
		file,
		service.UploadCategorySite,
		fmt.Sprintf("fl_%d", uid),
	)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "LOGO 已上传", "url": url})
}

// APIAdminFriendLinkApplies 管理员友链申请列表
func (h *Handlers) APIAdminFriendLinkApplies(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	status := strings.TrimSpace(c.DefaultQuery("status", "pending"))
	list, total, err := h.FriendLinkApply.ListAdmin(service.FriendLinkApplyListQuery{
		Page: page, Size: size, Status: status,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	pending, _ := h.FriendLinkApply.PendingCount()
	c.JSON(http.StatusOK, gin.H{
		"applies":                  list,
		"total":                    total,
		"page":                     page,
		"pending_count":            pending,
		"reciprocal_check_enabled": h.Settings.FriendLinkReciprocalCheckEnabled(),
	})
}

// APIAdminUpdateFriendLinkSettings 更新友链回链检测开关
func (h *Handlers) APIAdminUpdateFriendLinkSettings(c *gin.Context) {
	var req struct {
		ReciprocalCheckEnabled *bool `json:"reciprocal_check_enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.ReciprocalCheckEnabled == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.Settings.SetFriendLinkReciprocalCheckEnabled(*req.ReciprocalCheckEnabled); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	enabled := *req.ReciprocalCheckEnabled
	msg := "已开启回链检测"
	if !enabled {
		msg = "已关闭回链检测"
	}
	c.JSON(http.StatusOK, gin.H{
		"message":                  msg,
		"reciprocal_check_enabled": enabled,
	})
}

// APIAdminApproveFriendLinkApply 通过友链申请
func (h *Handlers) APIAdminApproveFriendLinkApply(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	apply, err := h.FriendLinkApply.Approve(uint(id))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已通过并加入友情链接", "apply": apply})
}

// APIAdminRejectFriendLinkApply 拒绝友链申请
func (h *Handlers) APIAdminRejectFriendLinkApply(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req struct {
		Note string `json:"note"`
	}
	_ = c.ShouldBindJSON(&req)
	apply, err := h.FriendLinkApply.Reject(uint(id), req.Note)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已拒绝申请", "apply": apply})
}

// APIMyFriendLinkApplies 当前用户的友链申请列表
func (h *Handlers) APIMyFriendLinkApplies(c *gin.Context) {
	uid := h.currentUserID(c)
	if uid == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	list, err := h.FriendLinkApply.ListMine(uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"applies": list})
}

// APICancelFriendLinkApply 撤销待审友链申请
func (h *Handlers) APICancelFriendLinkApply(c *gin.Context) {
	uid := h.currentUserID(c)
	if uid == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.FriendLinkApply.Cancel(uid, uint(id)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已撤销申请"})
}

// APIUpdateFriendLinkApply 修改并重新提交友链申请
func (h *Handlers) APIUpdateFriendLinkApply(c *gin.Context) {
	uid := h.currentUserID(c)
	if uid == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req struct {
		Name              string `json:"name"`
		URL               string `json:"url"`
		Logo              string `json:"logo"`
		LinkOnHomepage    bool   `json:"link_on_homepage"`
		ReciprocalPageURL string `json:"reciprocal_page_url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	result, err := h.FriendLinkApply.Update(uid, uint(id), service.FriendLinkApplyInput{
		UserID:            uid,
		Name:              req.Name,
		URL:               req.URL,
		Logo:              req.Logo,
		LinkOnHomepage:    req.LinkOnHomepage,
		ReciprocalPageURL: req.ReciprocalPageURL,
		OurSiteURL:        h.publicBaseURL(c),
	})
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	resp := gin.H{
		"message": friendLinkApplySubmittedMessage(h.Settings.FriendLinkReciprocalCheckEnabled(), true),
		"apply":   result.Apply,
	}
	c.JSON(http.StatusOK, resp)
}

// APIAdminRecheckFriendLinkApply 管理员重新检测回链
func (h *Handlers) APIAdminRecheckFriendLinkApply(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	apply, err := h.FriendLinkApply.RecheckReciprocal(uint(id), h.publicBaseURL(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已开始重新检测回链", "apply": apply})
}

func friendLinkApplySubmittedMessage(checkEnabled, isUpdate bool) string {
	if isUpdate {
		if checkEnabled {
			return "申请已更新，回链检测将在后台进行"
		}
		return "申请已更新"
	}
	if checkEnabled {
		return "申请已提交，回链检测将在后台进行"
	}
	return "申请已提交"
}

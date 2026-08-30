package handler

import (
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"

	"git.iioio.com/freefire/jiang13-forum/service"
)

// APICommunityHeartbeat 公开心跳入口（仅枢纽开启时写入）
func (h *Handlers) APICommunityHeartbeat(c *gin.Context) {
	if h.Community == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "未启用"})
		return
	}
	var req service.CommunityHeartbeatPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.Community.ReceiveHeartbeat(req, c.ClientIP()); err != nil {
		if errors.Is(err, service.ErrCommunityHubDisabled) {
			c.JSON(http.StatusForbidden, gin.H{"error": "本站未开启社区枢纽"})
			return
		}
		if errors.Is(err, service.ErrCommunityBadPayload) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "心跳参数无效"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// APICommunityShowcase 公开展柜（仅精选）
func (h *Handlers) APICommunityShowcase(c *gin.Context) {
	if h.Community == nil {
		c.JSON(http.StatusOK, gin.H{"items": []any{}})
		return
	}
	list, err := h.Community.ListShowcase()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "加载失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": list})
}

// APIAdminCommunityInstances 公网实例列表
func (h *Handlers) APIAdminCommunityInstances(c *gin.Context) {
	if h.Community == nil {
		c.JSON(http.StatusOK, gin.H{"instances": []any{}, "hub_enabled": false})
		return
	}
	cfg := h.Settings.CommunityConfig()
	list, err := h.Community.ListInstances()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "加载失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"hub_enabled": cfg.HubEnabled,
		"instances":   list,
	})
}

// APIAdminFeatureCommunityInstance 精选 / 取消精选
func (h *Handlers) APIAdminFeatureCommunityInstance(c *gin.Context) {
	if h.Community == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "未启用"})
		return
	}
	var req service.CommunityFeatureInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	view, err := h.Community.SetInstanceFeatured(c.Param("id"), req)
	if err != nil {
		if errors.Is(err, service.ErrCommunityBadPayload) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "实例无效"})
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "实例不存在"})
		return
	}
	msg := "已取消精选"
	if view.Featured {
		msg = "已设为精选，将出现在公开展柜"
	}
	c.JSON(http.StatusOK, gin.H{"message": msg, "instance": view})
}

// APIAdminUpdateCommunitySettings 更新社区上报设置
func (h *Handlers) APIAdminUpdateCommunitySettings(c *gin.Context) {
	var req service.CommunityConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	_, err := h.Settings.UpdateCommunityConfig(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cfg := h.Settings.CommunityConfig()
	out := gin.H{
		"message":   "社区设置已保存",
		"community": cfg,
	}
	if cfg.ReportEnabled && h.Community != nil {
		origin := communityRequestOrigin(c)
		if err := h.Community.SendHeartbeatOnce(origin); err != nil {
			out["message"] = "社区设置已保存，但心跳未成功"
			out["heartbeat_error"] = err.Error()
			// 刷新 site_url（可能已由 Origin 持久化）
			out["community"] = h.Settings.CommunityConfig()
		}
	}
	c.JSON(http.StatusOK, out)
}

// communityRequestOrigin 优先用浏览器 Origin（Vite 代理时 Host 可能是后端端口）
func communityRequestOrigin(c *gin.Context) string {
	if o := strings.TrimSpace(c.GetHeader("Origin")); o != "" {
		return o
	}
	if ref := strings.TrimSpace(c.GetHeader("Referer")); ref != "" {
		if u, err := url.Parse(ref); err == nil && u.Scheme != "" && u.Host != "" {
			return u.Scheme + "://" + u.Host
		}
	}
	return requestOrigin(c)
}

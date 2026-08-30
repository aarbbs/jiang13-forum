package handler

import (
	"net/http"
	"strconv"

	"git.iioio.com/freefire/jiang13-forum/service"
	"github.com/gin-gonic/gin"
)

// APIAdminMonitorOverview 今日概览
func (h *Handlers) APIAdminMonitorOverview(c *gin.Context) {
	if h.Monitor == nil {
		c.JSON(http.StatusOK, service.MonitorOverview{})
		return
	}
	c.JSON(http.StatusOK, h.Monitor.OverviewToday())
}

// APIAdminMonitorGeo 地理分布
func (h *Handlers) APIAdminMonitorGeo(c *gin.Context) {
	if h.Monitor == nil {
		c.JSON(http.StatusOK, service.MonitorGeoResult{
			Countries: []service.MonitorGeoItem{},
			Regions:   []service.MonitorRegionItem{},
			Cities:    []service.MonitorCityItem{},
			ASNs:      []service.MonitorASNItem{},
		})
		return
	}
	c.JSON(http.StatusOK, h.Monitor.GeoStats(c.Query("range")))
}

// APIAdminMonitorStats 维度排行
func (h *Handlers) APIAdminMonitorStats(c *gin.Context) {
	if h.Monitor == nil {
		c.JSON(http.StatusOK, gin.H{"items": []service.MonitorStatItem{}})
		return
	}
	items := h.Monitor.DimStats(c.Query("dim"), c.Query("range"))
	c.JSON(http.StatusOK, gin.H{"dim": c.Query("dim"), "range": c.Query("range"), "items": items})
}

// APIAdminMonitorLogs 请求日志
func (h *Handlers) APIAdminMonitorLogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	if h.Monitor == nil {
		c.JSON(http.StatusOK, gin.H{"items": []service.MonitorLogItem{}, "total": 0, "page": page, "size": size})
		return
	}
	items, total := h.Monitor.ListLogs(page, size, c.Query("method"), c.Query("path"), c.Query("status"), c.Query("ip"))
	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "page": page, "size": size})
}

// APIAdminMonitorRealtime 实时
func (h *Handlers) APIAdminMonitorRealtime(c *gin.Context) {
	if h.Monitor == nil {
		c.JSON(http.StatusOK, service.MonitorRealtime{HourlySeries: []service.MonitorRealtimePoint{}})
		return
	}
	c.JSON(http.StatusOK, h.Monitor.Realtime())
}

// APIAdminGetMonitorSettings 读取监控设置
func (h *Handlers) APIAdminGetMonitorSettings(c *gin.Context) {
	cfg := h.Settings.MonitorConfig()
	if h.Monitor != nil {
		h.Monitor.EnrichGeoMeta(&cfg)
	}
	c.JSON(http.StatusOK, cfg)
}

// APIAdminUpdateMonitorSettings 更新监控设置
func (h *Handlers) APIAdminUpdateMonitorSettings(c *gin.Context) {
	var req service.MonitorConfig
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.Settings.UpdateMonitorConfig(req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cfg := h.Settings.MonitorConfig()
	if h.Monitor != nil {
		h.Monitor.EnrichGeoMeta(&cfg)
	}
	c.JSON(http.StatusOK, gin.H{"message": "监控设置已保存", "monitor": cfg})
}

// APIMonitorPageview 前台 SPA 路由 pageview 信标（公开，受 monitor_enabled 控制）
func (h *Handlers) APIMonitorPageview(c *gin.Context) {
	if h.Monitor == nil || !h.Settings.MonitorEnabled() {
		c.Status(http.StatusNoContent)
		return
	}
	var req service.PageViewInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.Monitor.RecordPageView(c.Request, c.Request.RemoteAddr, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "记录失败"})
		return
	}
	c.Status(http.StatusNoContent)
}

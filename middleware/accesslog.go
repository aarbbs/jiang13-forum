package middleware

import (
	"time"

	"git.iioio.com/freefire/jiang13-forum/service"
	"github.com/gin-gonic/gin"
)

// AccessLogMiddleware 服务端访问日志采集（受 monitor_enabled 控制；热路径仅入队，后台写 jsonl）
func AccessLogMiddleware(mon *service.MonitorService) gin.HandlerFunc {
	return func(c *gin.Context) {
		if mon == nil || !mon.Enabled() {
			c.Next()
			return
		}
		path := c.Request.URL.Path
		if mon.ShouldSkip(path) {
			c.Next()
			return
		}
		start := time.Now()
		c.Next()
		status := c.Writer.Status()
		bytes := int64(c.Writer.Size())
		if bytes < 0 {
			bytes = 0
		}
		dur := int(time.Since(start).Milliseconds())
		row := mon.BuildAccessLog(c.Request, c.Request.RemoteAddr, status, bytes, dur)
		mon.Enqueue(row)
	}
}

package web

import (
	"net/http"

	"git.iioio.com/freefire/jiang13-forum/modules/webctx"
	"github.com/gin-gonic/gin"
)

type pendingData struct {
	PageChrome
	Heading string
	Message string
}

// PendingPage 未迁移页
func (d Deps) PendingPage(c *gin.Context) {
	ctx := d.ctx(c)
	chrome := d.chrome(ctx, "页面准备中 · "+d.Settings.SiteBranding().Name, "", "")
	ctx.HTML(http.StatusOK, "status/pending", pendingData{
		PageChrome: chrome,
		Heading:    "页面准备中",
		Message:    "该功能尚未用模板实现，请稍后再来。",
	})
}

func (d Deps) render404(ctx *webctx.Context) {
	chrome := d.chrome(ctx, "页面不存在 · "+d.Settings.SiteBranding().Name, "", "")
	ctx.HTML(http.StatusNotFound, "status/404", chrome)
}

// NotFound NoRoute
func (d Deps) NotFound(c *gin.Context) {
	d.render404(d.ctx(c))
}

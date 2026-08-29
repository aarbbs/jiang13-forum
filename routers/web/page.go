package web

import (
	"errors"
	"html/template"
	"net/http"

	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

type sitePageViewData struct {
	PageChrome
	PageTitle string
	Slug      string
	BodyHTML  template.HTML
}

// SitePageGet 公开站点单页
func (d Deps) SitePageGet(c *gin.Context) {
	ctx := d.ctx(c)
	if d.SitePage == nil {
		d.render404(ctx)
		return
	}
	slug := c.Param("slug")
	page, err := d.SitePage.GetBySlug(slug, false)
	if err != nil {
		if errors.Is(err, services.ErrSitePageNotFound) {
			d.render404(ctx)
			return
		}
		c.String(http.StatusInternalServerError, "加载失败")
		return
	}
	html := services.SanitizePostHTML(page.Content)
	chrome := d.chrome(ctx, page.Title+" · "+d.Settings.SiteBranding().Name, "", "")
	ctx.HTML(http.StatusOK, "page/view", sitePageViewData{
		PageChrome: chrome,
		PageTitle:  page.Title,
		Slug:       page.Slug,
		BodyHTML:   template.HTML(html),
	})
}

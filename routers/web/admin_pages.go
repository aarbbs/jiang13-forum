package web

import (
	"net/http"
	"strconv"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/modules/webctx"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

type adminPageRow struct {
	ID           uint
	Title        string
	Slug         string
	Published    bool
	SortOrder    int
	ShowInNav    bool
	ShowInFooter bool
}

type adminPageForm struct {
	ID           uint
	Title        string
	Slug         string
	Content      string
	Published    bool
	SortOrder    int
	ShowInNav    bool
	ShowInFooter bool
	IsEdit       bool
}

type adminPagesData struct {
	AdminChrome
	Pages []adminPageRow
	Form  adminPageForm
}

// AdminPagesGet 站点单页列表
func (d Deps) AdminPagesGet(c *gin.Context) {
	ctx := d.ctx(c)
	d.renderAdminPages(ctx, "", adminPageForm{})
}

func (d Deps) renderAdminPages(ctx *webctx.Context, errMsg string, form adminPageForm) {
	chrome := d.adminChrome(ctx, "站点单页", "pages")
	chrome.Error = errMsg
	data := adminPagesData{AdminChrome: chrome, Form: form}
	if d.SitePage != nil {
		list, _ := d.SitePage.ListAll()
		data.Pages = make([]adminPageRow, 0, len(list))
		for _, p := range list {
			data.Pages = append(data.Pages, adminPageRow{
				ID: p.ID, Title: p.Title, Slug: p.Slug, Published: p.Published,
				SortOrder: p.SortOrder, ShowInNav: p.ShowInNav, ShowInFooter: p.ShowInFooter,
			})
		}
	}
	ctx.HTML(http.StatusOK, "admin/pages", data)
}

// AdminPageCreate 新建单页
func (d Deps) AdminPageCreate(c *gin.Context) {
	ctx := d.ctx(c)
	form := adminPageFormFrom(c)
	if !ctx.CheckCSRF() {
		d.renderAdminPages(ctx, "无效请求，请重试", form)
		return
	}
	if d.SitePage == nil {
		d.renderAdminPages(ctx, "单页服务未就绪", form)
		return
	}
	if _, err := d.SitePage.Create(adminPageInputFrom(form)); err != nil {
		d.renderAdminPages(ctx, err.Error(), form)
		return
	}
	ctx.SetFlash("单页已创建")
	ctx.Redirect("/admin/pages")
}

// AdminPageEditGet 编辑表单
func (d Deps) AdminPageEditGet(c *gin.Context) {
	ctx := d.ctx(c)
	if d.SitePage == nil {
		d.renderAdminPages(ctx, "单页服务未就绪", adminPageForm{})
		return
	}
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	page, err := d.SitePage.GetByID(uint(id))
	if err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect("/admin/pages")
		return
	}
	d.renderAdminPages(ctx, "", adminPageForm{
		ID: page.ID, Title: page.Title, Slug: page.Slug, Content: page.Content,
		Published: page.Published, SortOrder: page.SortOrder,
		ShowInNav: page.ShowInNav, ShowInFooter: page.ShowInFooter, IsEdit: true,
	})
}

// AdminPageUpdate 更新单页
func (d Deps) AdminPageUpdate(c *gin.Context) {
	ctx := d.ctx(c)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	form := adminPageFormFrom(c)
	form.ID = uint(id)
	form.IsEdit = true
	if !ctx.CheckCSRF() {
		d.renderAdminPages(ctx, "无效请求，请重试", form)
		return
	}
	if d.SitePage == nil {
		d.renderAdminPages(ctx, "单页服务未就绪", form)
		return
	}
	if err := d.SitePage.Update(uint(id), adminPageInputFrom(form)); err != nil {
		d.renderAdminPages(ctx, err.Error(), form)
		return
	}
	ctx.SetFlash("单页已保存")
	ctx.Redirect("/admin/pages")
}

// AdminPageDelete 删除
func (d Deps) AdminPageDelete(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect("/admin/pages")
		return
	}
	if d.SitePage == nil {
		ctx.SetFlash("单页服务未就绪")
		ctx.Redirect("/admin/pages")
		return
	}
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := d.SitePage.Delete(uint(id)); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect("/admin/pages")
		return
	}
	ctx.SetFlash("单页已删除")
	ctx.Redirect("/admin/pages")
}

// AdminPagePublishPost 快捷发布/下架
func (d Deps) AdminPagePublishPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect("/admin/pages")
		return
	}
	if d.SitePage == nil {
		ctx.SetFlash("单页服务未就绪")
		ctx.Redirect("/admin/pages")
		return
	}
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	published := c.PostForm("published") == "1" || c.PostForm("published") == "on"
	if err := d.SitePage.SetPublished(uint(id), published); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect("/admin/pages")
		return
	}
	if published {
		ctx.SetFlash("已发布")
	} else {
		ctx.SetFlash("已下架")
	}
	ctx.Redirect("/admin/pages")
}

func adminPageFormFrom(c *gin.Context) adminPageForm {
	sort, _ := strconv.Atoi(c.PostForm("sort_order"))
	return adminPageForm{
		Title:        strings.TrimSpace(c.PostForm("title")),
		Slug:         strings.TrimSpace(c.PostForm("slug")),
		Content:      c.PostForm("content"),
		Published:    c.PostForm("published") == "1" || c.PostForm("published") == "on",
		SortOrder:    sort,
		ShowInNav:    c.PostForm("show_in_nav") == "1" || c.PostForm("show_in_nav") == "on",
		ShowInFooter: c.PostForm("show_in_footer") == "1" || c.PostForm("show_in_footer") == "on",
	}
}

func adminPageInputFrom(form adminPageForm) services.SitePageInput {
	return services.SitePageInput{
		Title: form.Title, Slug: form.Slug, Content: form.Content,
		Published: form.Published, SortOrder: form.SortOrder,
		ShowInNav: form.ShowInNav, ShowInFooter: form.ShowInFooter,
	}
}

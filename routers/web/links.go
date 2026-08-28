package web

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/modules/webctx"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

type linksLinkView struct {
	Name string
	URL  string
	Logo string
}

type linksApplyView struct {
	ID         uint
	Name       string
	URL        string
	Logo       string
	Status     string
	StatusLabel string
	ReviewNote string
	CreatedAt  string
	CanCancel  bool
}

type linksPageData struct {
	PageChrome
	Links       []linksLinkView
	MyApplies   []linksApplyView
	FormName    string
	FormURL     string
	FormLogo    string
	FormRecip   string
	FormOnHome  bool
	AvatarMaxMB int
}

func friendLinkApplyStatusLabel(status string) string {
	switch status {
	case models.FriendLinkApplyStatusPending:
		return "待审核"
	case models.FriendLinkApplyStatusApproved:
		return "已通过"
	case models.FriendLinkApplyStatusRejected:
		return "已拒绝"
	default:
		return status
	}
}

func (d Deps) publicBaseURL(c *gin.Context) string {
	proto := c.GetHeader("X-Forwarded-Proto")
	if proto == "" {
		if c.Request.TLS != nil {
			proto = "https"
		} else {
			proto = "http"
		}
	}
	host := c.GetHeader("X-Forwarded-Host")
	if host == "" {
		host = c.Request.Host
	}
	origin := ""
	if host != "" {
		origin = proto + "://" + host
	}
	return d.Settings.SitePublicBaseURL(origin)
}

// LinksGet 友链公开页
func (d Deps) LinksGet(c *gin.Context) {
	ctx := d.ctx(c)
	d.renderLinks(ctx, c, "")
}

func (d Deps) renderLinks(ctx *webctx.Context, c *gin.Context, errMsg string) {
	brand := d.Settings.SiteBranding()
	chrome := d.chrome(ctx, "友情链接 · "+brand.Name, "", "")
	chrome.Error = errMsg
	data := linksPageData{
		PageChrome:  chrome,
		FormOnHome:  true,
		AvatarMaxMB: d.Settings.AvatarMaxMB(),
	}
	for _, l := range brand.FriendLinks {
		data.Links = append(data.Links, linksLinkView{Name: l.Name, URL: l.URL, Logo: l.Logo})
	}
	if ctx.IsSigned() && d.FriendLink != nil {
		rows, _ := d.FriendLink.ListMine(ctx.UserID())
		data.MyApplies = make([]linksApplyView, 0, len(rows))
		for _, a := range rows {
			data.MyApplies = append(data.MyApplies, linksApplyView{
				ID:          a.ID,
				Name:        a.Name,
				URL:         a.URL,
				Logo:        a.Logo,
				Status:      a.Status,
				StatusLabel: friendLinkApplyStatusLabel(a.Status),
				ReviewNote:  a.ReviewNote,
				CreatedAt:   a.CreatedAt.Format("2006-01-02 15:04"),
				CanCancel:   a.Status == models.FriendLinkApplyStatusPending,
			})
		}
	}
	ctx.HTML(http.StatusOK, "links/list", data)
}

func (d Deps) renderLinksForm(ctx *webctx.Context, c *gin.Context, errMsg string, form linksPageData) {
	brand := d.Settings.SiteBranding()
	chrome := d.chrome(ctx, "友情链接 · "+brand.Name, "", "")
	chrome.Error = errMsg
	form.PageChrome = chrome
	form.AvatarMaxMB = d.Settings.AvatarMaxMB()
	for _, l := range brand.FriendLinks {
		form.Links = append(form.Links, linksLinkView{Name: l.Name, URL: l.URL, Logo: l.Logo})
	}
	if ctx.IsSigned() && d.FriendLink != nil {
		rows, _ := d.FriendLink.ListMine(ctx.UserID())
		form.MyApplies = make([]linksApplyView, 0, len(rows))
		for _, a := range rows {
			form.MyApplies = append(form.MyApplies, linksApplyView{
				ID:          a.ID,
				Name:        a.Name,
				URL:         a.URL,
				Logo:        a.Logo,
				Status:      a.Status,
				StatusLabel: friendLinkApplyStatusLabel(a.Status),
				ReviewNote:  a.ReviewNote,
				CreatedAt:   a.CreatedAt.Format("2006-01-02 15:04"),
				CanCancel:   a.Status == models.FriendLinkApplyStatusPending,
			})
		}
	}
	ctx.HTML(http.StatusOK, "links/list", form)
}

// LinksApplyPost 提交友链申请
func (d Deps) LinksApplyPost(c *gin.Context) {
	ctx := d.ctx(c)
	form := linksPageData{
		FormName:   strings.TrimSpace(c.PostForm("name")),
		FormURL:    strings.TrimSpace(c.PostForm("url")),
		FormLogo:   strings.TrimSpace(c.PostForm("logo")),
		FormRecip:  strings.TrimSpace(c.PostForm("reciprocal_page_url")),
		FormOnHome: c.PostForm("link_on_homepage") == "1" || c.PostForm("link_on_homepage") == "on",
	}
	if !ctx.CheckCSRF() {
		d.renderLinksForm(ctx, c, "无效请求，请重试", form)
		return
	}
	if d.FriendLink == nil {
		d.renderLinksForm(ctx, c, "友链服务未就绪", form)
		return
	}
	if d.Limiter != nil && !d.Limiter.Allow("friend_link", fmt.Sprintf("%d", ctx.UserID())) {
		d.renderLinksForm(ctx, c, "申请过于频繁，请稍后再试", form)
		return
	}
	logo := form.FormLogo
	if file, err := c.FormFile("logo_file"); err == nil && file != nil {
		if d.Store == nil {
			d.renderLinksForm(ctx, c, "上传存储未就绪", form)
			return
		}
		url, err := services.SaveUploadedImage(d.Store, file, services.UploadCategorySite, fmt.Sprintf("fl_%d", ctx.UserID()))
		if err != nil {
			d.renderLinksForm(ctx, c, err.Error(), form)
			return
		}
		logo = url
		form.FormLogo = url
	}
	_, err := d.FriendLink.Create(services.FriendLinkApplyInput{
		UserID:            ctx.UserID(),
		Name:              form.FormName,
		URL:               form.FormURL,
		Logo:              logo,
		LinkOnHomepage:    form.FormOnHome,
		ReciprocalPageURL: form.FormRecip,
		OurSiteURL:        d.publicBaseURL(c),
	})
	if err != nil {
		d.renderLinksForm(ctx, c, err.Error(), form)
		return
	}
	ctx.SetFlash("友链申请已提交，请等待审核")
	ctx.Redirect("/links")
}

// LinksApplyCancelPost 取消待审申请
func (d Deps) LinksApplyCancelPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderLinks(ctx, c, "无效请求，请重试")
		return
	}
	if d.FriendLink == nil {
		d.renderLinks(ctx, c, "友链服务未就绪")
		return
	}
	id64, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := d.FriendLink.Cancel(ctx.UserID(), uint(id64)); err != nil {
		if errors.Is(err, services.ErrFriendLinkApplyNotFound) || errors.Is(err, services.ErrFriendLinkApplyHandled) {
			ctx.SetFlash(err.Error())
			ctx.Redirect("/links")
			return
		}
		d.renderLinks(ctx, c, err.Error())
		return
	}
	ctx.SetFlash("已取消申请")
	ctx.Redirect("/links")
}

// LinksLogoUpload Logo 上传（JSON，供表单渐进增强）
func (d Deps) LinksLogoUpload(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.IsSigned() {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "请先登录"})
		return
	}
	if !ctx.CheckCSRF() {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效请求"})
		return
	}
	if d.Store == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "上传不可用"})
		return
	}
	file, err := c.FormFile("logo")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择 LOGO 图片"})
		return
	}
	maxBytes := int64(d.Settings.AvatarMaxMB()) * 1024 * 1024
	if file.Size > maxBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "图片文件过大"})
		return
	}
	url, err := services.SaveUploadedImage(d.Store, file, services.UploadCategorySite, fmt.Sprintf("fl_%d", ctx.UserID()))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "LOGO 已上传", "url": url})
}

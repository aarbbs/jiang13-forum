package web

import (
	"net/http"
	"strconv"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/modules/webctx"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

type adminFriendLinkBrandRow struct {
	Name string
	URL  string
	Logo string
}

type adminFriendLinkApplyRow struct {
	ID          uint
	UserID      uint
	Username    string
	Name        string
	URL         string
	Logo        string
	Status      string
	StatusLabel string
	OnHome      bool
	Reciprocal  string
	RecipOK     bool
	RecipNote   string
	CreatedAt   string
	CanReview   bool
}

type adminFriendLinksData struct {
	AdminChrome
	BrandLinks       []adminFriendLinkBrandRow
	Applies          []adminFriendLinkApplyRow
	PendingCount     int64
	NavShow          bool
	FooterShow       bool
	ReciprocalCheck  bool
	BrandName        string
	BrandURL         string
	BrandLogo        string
}

// AdminFriendLinksGet 友链管理
func (d Deps) AdminFriendLinksGet(c *gin.Context) {
	ctx := d.ctx(c)
	d.renderAdminFriendLinks(ctx, "")
}

func (d Deps) renderAdminFriendLinks(ctx *webctx.Context, errMsg string) {
	chrome := d.adminChrome(ctx, "友链", "friend-links")
	chrome.Error = errMsg
	data := adminFriendLinksData{
		AdminChrome:     chrome,
		NavShow:         d.Settings.NavShowFriendLinks(),
		FooterShow:      d.Settings.FooterShowFriendLinks(),
		ReciprocalCheck: d.Settings.FriendLinkReciprocalCheckEnabled(),
	}
	brand := d.Settings.SiteBranding()
	for _, l := range brand.FriendLinks {
		data.BrandLinks = append(data.BrandLinks, adminFriendLinkBrandRow{Name: l.Name, URL: l.URL, Logo: l.Logo})
	}
	if d.FriendLink != nil {
		data.PendingCount, _ = d.FriendLink.PendingCount()
		rows, _, _ := d.FriendLink.ListAdmin(services.FriendLinkApplyListQuery{Page: 1, Size: 50, Status: "all"})
		data.Applies = make([]adminFriendLinkApplyRow, 0, len(rows))
		for _, a := range rows {
			uname := ""
			if a.User.ID > 0 {
				uname = a.User.Username
			}
			data.Applies = append(data.Applies, adminFriendLinkApplyRow{
				ID:          a.ID,
				UserID:      a.UserID,
				Username:    uname,
				Name:        a.Name,
				URL:         a.URL,
				Logo:        a.Logo,
				Status:      a.Status,
				StatusLabel: friendLinkApplyStatusLabel(a.Status),
				OnHome:      a.LinkOnHomepage,
				Reciprocal:  a.ReciprocalPageURL,
				RecipOK:     a.ReciprocalVerified,
				RecipNote:   a.ReciprocalCheckNote,
				CreatedAt:   a.CreatedAt.Format("2006-01-02 15:04"),
				CanReview:   a.Status == models.FriendLinkApplyStatusPending,
			})
		}
	}
	ctx.HTML(http.StatusOK, "admin/friend_links", data)
}

// AdminFriendLinksSettingsPost nav/footer/回链开关
func (d Deps) AdminFriendLinksSettingsPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminFriendLinks(ctx, "无效请求，请重试")
		return
	}
	_ = d.Settings.SetNavShowFriendLinks(c.PostForm("nav_show") == "1" || c.PostForm("nav_show") == "on")
	_ = d.Settings.SetFooterShowFriendLinks(c.PostForm("footer_show") == "1" || c.PostForm("footer_show") == "on")
	_ = d.Settings.SetFriendLinkReciprocalCheckEnabled(c.PostForm("reciprocal_check") == "1" || c.PostForm("reciprocal_check") == "on")
	ctx.SetFlash("友链入口设置已保存")
	ctx.Redirect("/admin/friend-links")
}

// AdminFriendLinksBrandAddPost 添加品牌友链
func (d Deps) AdminFriendLinksBrandAddPost(c *gin.Context) {
	ctx := d.ctx(c)
	name := strings.TrimSpace(c.PostForm("name"))
	url := strings.TrimSpace(c.PostForm("url"))
	logo := strings.TrimSpace(c.PostForm("logo"))
	if !ctx.CheckCSRF() {
		d.renderAdminFriendLinks(ctx, "无效请求，请重试")
		return
	}
	brand := d.Settings.SiteBranding()
	next := append([]services.FriendLink{}, brand.FriendLinks...)
	next = append(next, services.FriendLink{Name: name, URL: url, Logo: logo})
	if err := d.Settings.UpdateSiteBranding(services.SiteBranding{
		Name: brand.Name, Slogan: brand.Slogan, Description: brand.Description,
		Keywords: brand.Keywords, LogoMark: brand.LogoMark, Logo: brand.Logo,
		Favicon: brand.Favicon, OGImage: brand.OGImage,
		ICPBeian: brand.ICPBeian, ICPBeianURL: brand.ICPBeianURL,
		FriendLinks: next,
	}); err != nil {
		d.renderAdminFriendLinks(ctx, err.Error())
		return
	}
	ctx.SetFlash("已添加品牌友链")
	ctx.Redirect("/admin/friend-links")
}

// AdminFriendLinksBrandDeletePost 删除品牌友链（按 URL）
func (d Deps) AdminFriendLinksBrandDeletePost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminFriendLinks(ctx, "无效请求，请重试")
		return
	}
	target := strings.TrimSpace(c.PostForm("url"))
	brand := d.Settings.SiteBranding()
	next := make([]services.FriendLink, 0, len(brand.FriendLinks))
	for _, l := range brand.FriendLinks {
		if l.URL == target {
			continue
		}
		next = append(next, l)
	}
	if err := d.Settings.UpdateSiteBranding(services.SiteBranding{
		Name: brand.Name, Slogan: brand.Slogan, Description: brand.Description,
		Keywords: brand.Keywords, LogoMark: brand.LogoMark, Logo: brand.Logo,
		Favicon: brand.Favicon, OGImage: brand.OGImage,
		ICPBeian: brand.ICPBeian, ICPBeianURL: brand.ICPBeianURL,
		FriendLinks: next,
	}); err != nil {
		d.renderAdminFriendLinks(ctx, err.Error())
		return
	}
	ctx.SetFlash("已删除品牌友链")
	ctx.Redirect("/admin/friend-links")
}

// AdminFriendLinkApprovePost 通过申请
func (d Deps) AdminFriendLinkApprovePost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminFriendLinks(ctx, "无效请求，请重试")
		return
	}
	if d.FriendLink == nil {
		d.renderAdminFriendLinks(ctx, "友链服务未就绪")
		return
	}
	id64, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if _, err := d.FriendLink.Approve(uint(id64)); err != nil {
		d.renderAdminFriendLinks(ctx, err.Error())
		return
	}
	ctx.SetFlash("已通过友链申请")
	ctx.Redirect("/admin/friend-links")
}

// AdminFriendLinkRejectPost 拒绝申请
func (d Deps) AdminFriendLinkRejectPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminFriendLinks(ctx, "无效请求，请重试")
		return
	}
	if d.FriendLink == nil {
		d.renderAdminFriendLinks(ctx, "友链服务未就绪")
		return
	}
	id64, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	note := strings.TrimSpace(c.PostForm("note"))
	if _, err := d.FriendLink.Reject(uint(id64), note); err != nil {
		d.renderAdminFriendLinks(ctx, err.Error())
		return
	}
	ctx.SetFlash("已拒绝友链申请")
	ctx.Redirect("/admin/friend-links")
}

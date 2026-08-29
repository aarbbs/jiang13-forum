package web

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/modules/webctx"
	"github.com/gin-gonic/gin"
)

type adminBadgeRow struct {
	ID          uint
	Code        string
	Name        string
	Description string
	Icon        string
	Kind        string
	KindLabel   string
	Metric      string
	Threshold   int
	SortOrder   int
	Enabled     bool
	IsLimited   bool
}

type adminBadgeForm struct {
	ID          uint
	Code        string
	Name        string
	Description string
	Icon        string
	Kind        string
	Metric      string
	Threshold   int
	SortOrder   int
	Enabled     bool
	IsEdit      bool
}

type adminBadgesData struct {
	AdminChrome
	Badges        []adminBadgeRow
	LimitedBadges []adminBadgeRow
	Form          adminBadgeForm
	AwardUser     string
	AwardBadgeID  uint
}

// AdminBadgesGet 徽章定义列表
func (d Deps) AdminBadgesGet(c *gin.Context) {
	ctx := d.ctx(c)
	d.renderAdminBadges(ctx, "", adminBadgeForm{Kind: models.BadgeKindLimited, Enabled: true}, "", 0)
}

func (d Deps) renderAdminBadges(ctx *webctx.Context, errMsg string, form adminBadgeForm, awardUser string, awardBadgeID uint) {
	chrome := d.adminChrome(ctx, "徽章", "badges")
	chrome.Error = errMsg
	if form.Kind == "" {
		form.Kind = models.BadgeKindLimited
	}
	data := adminBadgesData{
		AdminChrome:  chrome,
		Form:         form,
		AwardUser:    awardUser,
		AwardBadgeID: awardBadgeID,
	}
	if d.Badge != nil {
		list, err := d.Badge.ListDefs(true)
		if err != nil {
			chrome.Error = err.Error()
			data.AdminChrome = chrome
		} else {
			data.Badges = make([]adminBadgeRow, 0, len(list))
			data.LimitedBadges = make([]adminBadgeRow, 0)
			for _, b := range list {
				row := adminBadgeRowFrom(b)
				data.Badges = append(data.Badges, row)
				if row.IsLimited && row.Enabled {
					data.LimitedBadges = append(data.LimitedBadges, row)
				}
			}
		}
	}
	ctx.HTML(http.StatusOK, "admin/badges", data)
}

func adminBadgeRowFrom(b models.BadgeDef) adminBadgeRow {
	label := "自动"
	if b.Kind == models.BadgeKindLimited {
		label = "限定"
	}
	return adminBadgeRow{
		ID: b.ID, Code: b.Code, Name: b.Name, Description: b.Description, Icon: b.Icon,
		Kind: b.Kind, KindLabel: label, Metric: b.Metric, Threshold: b.Threshold,
		SortOrder: b.SortOrder, Enabled: b.Enabled, IsLimited: b.Kind == models.BadgeKindLimited,
	}
}

func adminBadgeFormFrom(c *gin.Context) adminBadgeForm {
	th, _ := strconv.Atoi(strings.TrimSpace(c.PostForm("threshold")))
	so, _ := strconv.Atoi(strings.TrimSpace(c.PostForm("sort_order")))
	kind := strings.TrimSpace(c.PostForm("kind"))
	if kind == "" {
		kind = models.BadgeKindLimited
	}
	return adminBadgeForm{
		Code:        strings.TrimSpace(c.PostForm("code")),
		Name:        strings.TrimSpace(c.PostForm("name")),
		Description: strings.TrimSpace(c.PostForm("description")),
		Icon:        strings.TrimSpace(c.PostForm("icon")),
		Kind:        kind,
		Metric:      strings.TrimSpace(c.PostForm("metric")),
		Threshold:   th,
		SortOrder:   so,
		Enabled:     c.PostForm("enabled") == "1" || c.PostForm("enabled") == "on",
	}
}

func (f adminBadgeForm) toDef() models.BadgeDef {
	return models.BadgeDef{
		Code: f.Code, Name: f.Name, Description: f.Description, Icon: f.Icon,
		Kind: f.Kind, Metric: f.Metric, Threshold: f.Threshold,
		SortOrder: f.SortOrder, Enabled: f.Enabled,
	}
}

// AdminBadgeCreate 新建徽章定义
func (d Deps) AdminBadgeCreate(c *gin.Context) {
	ctx := d.ctx(c)
	form := adminBadgeFormFrom(c)
	if !ctx.CheckCSRF() {
		d.renderAdminBadges(ctx, "无效请求，请重试", form, "", 0)
		return
	}
	if d.Badge == nil {
		d.renderAdminBadges(ctx, "徽章服务未就绪", form, "", 0)
		return
	}
	def := form.toDef()
	if err := d.Badge.UpsertDef(&def); err != nil {
		d.renderAdminBadges(ctx, err.Error(), form, "", 0)
		return
	}
	ctx.SetFlash("徽章已保存")
	ctx.Redirect("/admin/badges")
}

// AdminBadgeEditGet 编辑表单
func (d Deps) AdminBadgeEditGet(c *gin.Context) {
	ctx := d.ctx(c)
	if d.Badge == nil {
		d.renderAdminBadges(ctx, "徽章服务未就绪", adminBadgeForm{Kind: models.BadgeKindLimited, Enabled: true}, "", 0)
		return
	}
	id64, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	list, err := d.Badge.ListDefs(true)
	if err != nil {
		d.renderAdminBadges(ctx, err.Error(), adminBadgeForm{}, "", 0)
		return
	}
	for _, b := range list {
		if b.ID == uint(id64) {
			d.renderAdminBadges(ctx, "", adminBadgeForm{
				ID: b.ID, Code: b.Code, Name: b.Name, Description: b.Description, Icon: b.Icon,
				Kind: b.Kind, Metric: b.Metric, Threshold: b.Threshold, SortOrder: b.SortOrder,
				Enabled: b.Enabled, IsEdit: true,
			}, "", 0)
			return
		}
	}
	ctx.SetFlash("徽章不存在")
	ctx.Redirect("/admin/badges")
}

// AdminBadgeUpdate 更新徽章定义
func (d Deps) AdminBadgeUpdate(c *gin.Context) {
	ctx := d.ctx(c)
	id64, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	form := adminBadgeFormFrom(c)
	form.ID = uint(id64)
	form.IsEdit = true
	if !ctx.CheckCSRF() {
		d.renderAdminBadges(ctx, "无效请求，请重试", form, "", 0)
		return
	}
	if d.Badge == nil {
		d.renderAdminBadges(ctx, "徽章服务未就绪", form, "", 0)
		return
	}
	// 编辑时 code 不可改：从已有定义取 code，避免误覆盖其它徽章
	list, err := d.Badge.ListDefs(true)
	if err != nil {
		d.renderAdminBadges(ctx, err.Error(), form, "", 0)
		return
	}
	var found *models.BadgeDef
	for i := range list {
		if list[i].ID == uint(id64) {
			found = &list[i]
			break
		}
	}
	if found == nil {
		d.renderAdminBadges(ctx, "徽章不存在", form, "", 0)
		return
	}
	form.Code = found.Code
	def := form.toDef()
	if err := d.Badge.UpsertDef(&def); err != nil {
		d.renderAdminBadges(ctx, err.Error(), form, "", 0)
		return
	}
	ctx.SetFlash("徽章已更新")
	ctx.Redirect("/admin/badges")
}

// AdminBadgeDelete 删除徽章定义
func (d Deps) AdminBadgeDelete(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminBadges(ctx, "无效请求，请重试", adminBadgeForm{Kind: models.BadgeKindLimited, Enabled: true}, "", 0)
		return
	}
	if d.Badge == nil {
		d.renderAdminBadges(ctx, "徽章服务未就绪", adminBadgeForm{Kind: models.BadgeKindLimited, Enabled: true}, "", 0)
		return
	}
	id64, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := d.Badge.DeleteDef(uint(id64)); err != nil {
		d.renderAdminBadges(ctx, err.Error(), adminBadgeForm{Kind: models.BadgeKindLimited, Enabled: true}, "", 0)
		return
	}
	ctx.SetFlash("徽章已删除")
	ctx.Redirect("/admin/badges")
}

func (d Deps) resolveAwardUser(raw string) (uint, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0, errors.New("请填写用户名或用户 ID")
	}
	if id, err := strconv.ParseUint(raw, 10, 64); err == nil && id > 0 {
		u, e := d.User.GetByID(uint(id))
		if e != nil || u == nil {
			return 0, errors.New("用户不存在")
		}
		return u.ID, nil
	}
	u, err := d.User.GetByUsername(raw)
	if err != nil || u == nil {
		return 0, errors.New("用户不存在")
	}
	return u.ID, nil
}

// AdminBadgeAwardPost 颁发限定徽章
func (d Deps) AdminBadgeAwardPost(c *gin.Context) {
	ctx := d.ctx(c)
	userRaw := strings.TrimSpace(c.PostForm("user"))
	badgeID, _ := strconv.ParseUint(strings.TrimSpace(c.PostForm("badge_id")), 10, 64)
	form := adminBadgeForm{Kind: models.BadgeKindLimited, Enabled: true}
	if !ctx.CheckCSRF() {
		d.renderAdminBadges(ctx, "无效请求，请重试", form, userRaw, uint(badgeID))
		return
	}
	if d.Badge == nil || d.User == nil {
		d.renderAdminBadges(ctx, "服务未就绪", form, userRaw, uint(badgeID))
		return
	}
	uid, err := d.resolveAwardUser(userRaw)
	if err != nil {
		d.renderAdminBadges(ctx, err.Error(), form, userRaw, uint(badgeID))
		return
	}
	if badgeID == 0 {
		d.renderAdminBadges(ctx, "请选择徽章", form, userRaw, 0)
		return
	}
	if err := d.Badge.AwardLimited(uid, uint(badgeID), ctx.UserID()); err != nil {
		d.renderAdminBadges(ctx, err.Error(), form, userRaw, uint(badgeID))
		return
	}
	ctx.SetFlash("已颁发徽章")
	ctx.Redirect("/admin/badges")
}

// AdminBadgeRevokePost 收回徽章
func (d Deps) AdminBadgeRevokePost(c *gin.Context) {
	ctx := d.ctx(c)
	userRaw := strings.TrimSpace(c.PostForm("user"))
	badgeID, _ := strconv.ParseUint(strings.TrimSpace(c.PostForm("badge_id")), 10, 64)
	form := adminBadgeForm{Kind: models.BadgeKindLimited, Enabled: true}
	if !ctx.CheckCSRF() {
		d.renderAdminBadges(ctx, "无效请求，请重试", form, userRaw, uint(badgeID))
		return
	}
	if d.Badge == nil || d.User == nil {
		d.renderAdminBadges(ctx, "服务未就绪", form, userRaw, uint(badgeID))
		return
	}
	uid, err := d.resolveAwardUser(userRaw)
	if err != nil {
		d.renderAdminBadges(ctx, err.Error(), form, userRaw, uint(badgeID))
		return
	}
	if badgeID == 0 {
		d.renderAdminBadges(ctx, "请选择徽章", form, userRaw, 0)
		return
	}
	if err := d.Badge.Revoke(uid, uint(badgeID)); err != nil {
		d.renderAdminBadges(ctx, err.Error(), form, userRaw, uint(badgeID))
		return
	}
	ctx.SetFlash("已收回徽章")
	ctx.Redirect("/admin/badges")
}

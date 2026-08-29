package web

import (
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/modules/webctx"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

type adminUserRow struct {
	ID       uint
	Username string
	Nickname string
	Email    string
	Role     string
	RoleLabel string
	Points   int
	Level    int
	Verified bool
	Banned   bool
	IsAdmin  bool
	Created  string
}

type adminUsersData struct {
	AdminChrome
	Users   []adminUserRow
	Keyword string
	Filter  string
	Page    int
	HasPrev bool
	HasMore bool
	PrevPage int
	NextPage int
	QuerySuffix string
}

// AdminUsersGet 用户列表
func (d Deps) AdminUsersGet(c *gin.Context) {
	ctx := d.ctx(c)
	d.renderAdminUsers(ctx, "")
}

func (d Deps) renderAdminUsers(ctx *webctx.Context, errMsg string) {
	chrome := d.adminChrome(ctx, "用户", "users")
	chrome.Error = errMsg
	page, _ := strconv.Atoi(ctx.C.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	keyword := strings.TrimSpace(ctx.C.Query("q"))
	filter := strings.TrimSpace(ctx.C.DefaultQuery("filter", "all"))
	if filter == "" {
		filter = "all"
	}
	size := d.Settings.PageSizeDefault()
	if size < 1 {
		size = 20
	}
	data := adminUsersData{
		AdminChrome: chrome,
		Keyword:     keyword,
		Filter:      filter,
		Page:        page,
		PrevPage:    page - 1,
		NextPage:    page + 1,
		HasPrev:     page > 1,
	}
	q := url.Values{}
	if keyword != "" {
		q.Set("q", keyword)
	}
	if filter != "" && filter != "all" {
		q.Set("filter", filter)
	}
	data.QuerySuffix = q.Encode()

	if d.User != nil {
		list, total, err := d.User.ListUsers(services.UserListQuery{
			Page: page, Size: size, Keyword: keyword, Filter: filter,
		})
		if err != nil {
			chrome.Error = err.Error()
			data.AdminChrome = chrome
			ctx.HTML(http.StatusOK, "admin/users", data)
			return
		}
		data.HasMore = int64(page*size) < total
		data.Users = make([]adminUserRow, 0, len(list))
		for _, u := range list {
			nick := strings.TrimSpace(u.Nickname)
			if nick == "" {
				nick = u.Username
			}
			data.Users = append(data.Users, adminUserRow{
				ID: u.ID, Username: u.Username, Nickname: nick, Email: u.Email,
				Role: string(u.Role), RoleLabel: adminUserRoleLabel(u.Role),
				Points: u.Points, Level: models.LevelFromExp(u.Exp),
				Verified: u.Verified, Banned: u.Banned,
				IsAdmin: u.Role == models.RoleAdmin,
				Created: u.CreatedAt.Format("2006-01-02"),
			})
		}
	}
	ctx.HTML(http.StatusOK, "admin/users", data)
}

func adminUserRoleLabel(role models.Role) string {
	switch role {
	case models.RoleAdmin:
		return "管理员"
	default:
		return "用户"
	}
}

// AdminUserBanPost 禁言 / 解禁
func (d Deps) AdminUserBanPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminUsers(ctx, "无效请求，请重试")
		return
	}
	if d.User == nil {
		d.renderAdminUsers(ctx, "用户服务未就绪")
		return
	}
	id64, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	banned := c.PostForm("banned") == "1" || c.PostForm("banned") == "on"
	if err := d.User.BanUser(uint(id64), banned); err != nil {
		d.renderAdminUsers(ctx, err.Error())
		return
	}
	if banned {
		ctx.SetFlash("已禁言该用户")
	} else {
		ctx.SetFlash("已解除禁言")
	}
	ctx.Redirect("/admin/users")
}

// AdminUserVerifyPost 认证开关
func (d Deps) AdminUserVerifyPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminUsers(ctx, "无效请求，请重试")
		return
	}
	id64, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	verified := c.PostForm("verified") == "1" || c.PostForm("verified") == "on"
	if err := services.SetVerified(uint(id64), verified); err != nil {
		d.renderAdminUsers(ctx, err.Error())
		return
	}
	if verified {
		ctx.SetFlash("已设为认证用户")
	} else {
		ctx.SetFlash("已取消认证")
	}
	ctx.Redirect("/admin/users")
}

// AdminUserPointsPost 调整积分
func (d Deps) AdminUserPointsPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminUsers(ctx, "无效请求，请重试")
		return
	}
	if d.Points == nil {
		d.renderAdminUsers(ctx, "积分服务未就绪")
		return
	}
	id64, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	delta, err := strconv.Atoi(strings.TrimSpace(c.PostForm("delta")))
	if err != nil || delta == 0 {
		d.renderAdminUsers(ctx, "请填写非零整数增减额")
		return
	}
	note := strings.TrimSpace(c.PostForm("note"))
	bal, err := d.Points.AdminAdjust(uint(id64), delta, note)
	if err != nil {
		d.renderAdminUsers(ctx, err.Error())
		return
	}
	ctx.SetFlash(fmt.Sprintf("积分已调整，当前余额 %d", bal))
	ctx.Redirect("/admin/users")
}

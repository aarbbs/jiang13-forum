package web

import (
	"fmt"
	"net/http"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/modules/webctx"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

type profileData struct {
	PageChrome
	UserID        uint
	Username      string
	Nickname      string
	Signature     string
	Avatar        string
	Email         string
	Level         int
	Exp           int
	Points        int
	PostCount     int64
	CommentCount  int64
	FavoriteCount int64
	LikeReceived  int64
	PublicURL     string
	AvatarMaxMB   int
	SignatureMax  int
}

// ProfileGet 个人中心
func (d Deps) ProfileGet(c *gin.Context) {
	ctx := d.ctx(c)
	d.renderProfile(ctx, "")
}

func (d Deps) renderProfile(ctx *webctx.Context, errMsg string) {
	uid := ctx.UserID()
	user, err := d.User.GetByID(uid)
	if err != nil {
		ctx.SetFlash("用户不存在")
		ctx.Redirect("/")
		return
	}
	st, _ := d.User.ActivityStats(uid)
	chrome := d.chrome(ctx, "个人中心 · "+d.Settings.SiteBranding().Name, "", "")
	chrome.Error = errMsg
	nick := strings.TrimSpace(user.Nickname)
	if nick == "" {
		nick = user.Username
	}
	data := profileData{
		PageChrome:    chrome,
		UserID:        user.ID,
		Username:      user.Username,
		Nickname:      user.Nickname,
		Signature:     user.Signature,
		Avatar:        user.Avatar,
		Email:         user.Email,
		Level:         models.LevelFromExp(user.Exp),
		Exp:           user.Exp,
		Points:        user.Points,
		PostCount:     st.PostCount,
		CommentCount:  st.CommentCount,
		FavoriteCount: st.FavoriteCount,
		LikeReceived:  st.LikeReceived,
		PublicURL:     fmt.Sprintf("/user/%d", user.ID),
		AvatarMaxMB:   d.Settings.AvatarMaxMB(),
		SignatureMax:  d.Settings.SignatureMax(),
	}
	// 导航显示最新昵称
	data.ViewerName = nick
	ctx.HTML(http.StatusOK, "profile/view", data)
}

// ProfileNicknamePost 改昵称
func (d Deps) ProfileNicknamePost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderProfile(ctx, "无效请求，请重试")
		return
	}
	if err := d.User.UpdateNickname(ctx.UserID(), strings.TrimSpace(c.PostForm("nickname"))); err != nil {
		d.renderProfile(ctx, err.Error())
		return
	}
	ctx.SetFlash("昵称已更新")
	ctx.Redirect("/profile")
}

// ProfileSignaturePost 改签名
func (d Deps) ProfileSignaturePost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderProfile(ctx, "无效请求，请重试")
		return
	}
	if err := d.User.UpdateSignature(ctx.UserID(), c.PostForm("signature")); err != nil {
		d.renderProfile(ctx, err.Error())
		return
	}
	ctx.SetFlash("签名已更新")
	ctx.Redirect("/profile")
}

// ProfilePasswordPost 改密码：吊销全部 session 后为本端重建
func (d Deps) ProfilePasswordPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderProfile(ctx, "无效请求，请重试")
		return
	}
	oldPass := c.PostForm("old_password")
	newPass := c.PostForm("new_password")
	confirm := c.PostForm("new_password2")
	if newPass != confirm {
		d.renderProfile(ctx, "两次输入的新密码不一致")
		return
	}
	uid := ctx.UserID()
	if err := d.User.UpdatePassword(uid, oldPass, newPass); err != nil {
		d.renderProfile(ctx, err.Error())
		return
	}
	services.RevokeUserSessions(uid)
	user, err := d.User.GetByID(uid)
	if err != nil {
		ctx.SetFlash("密码已更新，请重新登录")
		ctx.Redirect("/login?redirect=/profile")
		return
	}
	sid, err := d.Auth.CreateSessionForUser(user, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		ctx.SetFlash("密码已更新，请重新登录")
		ctx.Redirect("/login?redirect=/profile")
		return
	}
	ctx.SetLoginCookie(sid)
	ctx.SetFlash("密码已更新，其它设备已登出")
	ctx.Redirect("/profile")
}

// ProfileAvatarPost 上传头像
func (d Deps) ProfileAvatarPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderProfile(ctx, "无效请求，请重试")
		return
	}
	file, err := c.FormFile("avatar")
	if err != nil {
		d.renderProfile(ctx, "请选择头像文件")
		return
	}
	if d.Store == nil {
		d.renderProfile(ctx, "上传存储未就绪")
		return
	}
	if _, err := d.User.UploadAvatar(ctx.UserID(), file, d.Store); err != nil {
		d.renderProfile(ctx, err.Error())
		return
	}
	ctx.SetFlash("头像已更新")
	ctx.Redirect("/profile")
}

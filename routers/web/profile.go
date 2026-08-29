package web

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/modules/webctx"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

const profileLedgerLimit = 15

type profileLedgerItem struct {
	Delta       int
	Balance     int
	ReasonLabel string
	Note        string
	CreatedAt   string
}

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
	CheckIn       services.CheckInStatus
	Lottery       services.LotteryStatus
	Ledger        []profileLedgerItem
}

func pointReasonLabel(reason string) string {
	switch reason {
	case models.PointReasonCheckIn:
		return "签到"
	case models.PointReasonLottery:
		return "每日抽奖"
	case models.PointReasonUnlockSpend:
		return "解锁内容"
	case models.PointReasonCreatorIncome:
		return "创作分成"
	case models.PointReasonAdminAdjust:
		return "站长调整"
	case models.PointReasonBountyEscrow:
		return "悬赏托管"
	case models.PointReasonBountyAward:
		return "悬赏奖励"
	case models.PointReasonBountyRefund:
		return "悬赏退款"
	default:
		if reason == "" {
			return "其他"
		}
		return reason
	}
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
	chrome.ViewerPoints = user.Points
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
	if d.Points != nil {
		data.CheckIn, _ = d.Points.GetCheckInStatus(uid)
		data.Lottery, _ = d.Points.GetLotteryStatus(uid)
		rows, _, _ := d.Points.ListLedger(uid, 1, profileLedgerLimit)
		data.Ledger = make([]profileLedgerItem, 0, len(rows))
		for _, row := range rows {
			data.Ledger = append(data.Ledger, profileLedgerItem{
				Delta:       row.Delta,
				Balance:     row.Balance,
				ReasonLabel: pointReasonLabel(row.Reason),
				Note:        row.Note,
				CreatedAt:   row.CreatedAt.Format("2006-01-02 15:04"),
			})
		}
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

// ProfileCheckInPost 每日签到（PRG）
func (d Deps) ProfileCheckInPost(c *gin.Context) {
	ctx := d.ctx(c)
	redir := safePointsRedirect(c.PostForm("redirect"))
	if !ctx.CheckCSRF() {
		if redir != "/profile" {
			ctx.SetFlash("无效请求，请重试")
			ctx.Redirect(redir)
			return
		}
		d.renderProfile(ctx, "无效请求，请重试")
		return
	}
	if d.Points == nil {
		if redir != "/profile" {
			ctx.SetFlash("积分服务未就绪")
			ctx.Redirect(redir)
			return
		}
		d.renderProfile(ctx, "积分服务未就绪")
		return
	}
	st, err := d.Points.CheckIn(ctx.UserID())
	if err != nil {
		if errors.Is(err, services.ErrAlreadyCheckedIn) {
			ctx.SetFlash("今日已签到")
			ctx.Redirect(redir)
			return
		}
		if redir != "/profile" {
			ctx.SetFlash(err.Error())
			ctx.Redirect(redir)
			return
		}
		d.renderProfile(ctx, err.Error())
		return
	}
	ctx.SetFlash(fmt.Sprintf("签到成功：连续 %d 天，获得 %d 积分", st.Streak, st.TodayPoints))
	ctx.Redirect(redir)
}

// ProfileLotteryPost 每日抽奖（PRG）
func (d Deps) ProfileLotteryPost(c *gin.Context) {
	ctx := d.ctx(c)
	redir := safePointsRedirect(c.PostForm("redirect"))
	if !ctx.CheckCSRF() {
		if redir != "/profile" {
			ctx.SetFlash("无效请求，请重试")
			ctx.Redirect(redir)
			return
		}
		d.renderProfile(ctx, "无效请求，请重试")
		return
	}
	if d.Points == nil {
		if redir != "/profile" {
			ctx.SetFlash("积分服务未就绪")
			ctx.Redirect(redir)
			return
		}
		d.renderProfile(ctx, "积分服务未就绪")
		return
	}
	st, err := d.Points.DrawLottery(ctx.UserID())
	if err != nil {
		if errors.Is(err, services.ErrAlreadyLottery) {
			ctx.SetFlash("今日已抽奖")
			ctx.Redirect(redir)
			return
		}
		if redir != "/profile" {
			ctx.SetFlash(err.Error())
			ctx.Redirect(redir)
			return
		}
		d.renderProfile(ctx, err.Error())
		return
	}
	if st.Points > 0 {
		ctx.SetFlash(fmt.Sprintf("抽奖结果：获得 %d 积分", st.Points))
	} else {
		ctx.SetFlash("抽奖结果：未中奖，明天再来")
	}
	ctx.Redirect(redir)
}

// safePointsRedirect 签到/抽奖 PRG 回跳：仅允许 /、/board/…、/post/…；空或非法则 /profile
func safePointsRedirect(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.Contains(raw, "://") || strings.HasPrefix(raw, "//") || strings.Contains(raw, "..") {
		return "/profile"
	}
	if raw == "/" {
		return raw
	}
	if strings.HasPrefix(raw, "/board/") || strings.HasPrefix(raw, "/post/") {
		if strings.ContainsAny(raw, "?#") {
			return "/profile"
		}
		return raw
	}
	return "/profile"
}

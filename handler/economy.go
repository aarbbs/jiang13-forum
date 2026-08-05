package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"git.iioio.com/freefire/jiang13-forum/model"
	"git.iioio.com/freefire/jiang13-forum/service"
)

// APIMePoints 余额与流水
func (h *Handlers) APIMePoints(c *gin.Context) {
	uid := h.currentUserID(c)
	user, err := h.User.GetByID(uid)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	size, _ := strconv.Atoi(c.DefaultQuery("size", "20"))
	rows, total, err := h.Points.ListLedger(uid, page, size)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	checkIn, _ := h.Points.GetCheckInStatus(uid)
	lottery, _ := h.Points.GetLotteryStatus(uid)
	c.JSON(http.StatusOK, gin.H{
		"points":              user.Points,
		"creator_income_total": user.CreatorIncomeTotal,
		"ledger":              rows,
		"total":               total,
		"page":                page,
		"total_pages":         calcTotalPages(total, size),
		"check_in":            checkIn,
		"lottery":             lottery,
	})
}

// APIMeCheckIn 每日签到
func (h *Handlers) APIMeCheckIn(c *gin.Context) {
	st, err := h.Points.CheckIn(h.currentUserID(c))
	if err != nil {
		if errors.Is(err, service.ErrAlreadyCheckedIn) {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, _ := h.User.GetByID(h.currentUserID(c))
	pts := 0
	if user != nil {
		pts = user.Points
	}
	c.JSON(http.StatusOK, gin.H{"message": "签到成功", "check_in": st, "points": pts})
}

// APIMeLottery GET 状态 / POST 抽奖
func (h *Handlers) APIMeLotteryGet(c *gin.Context) {
	st, err := h.Points.GetLotteryStatus(h.currentUserID(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"lottery": st})
}

func (h *Handlers) APIMeLotteryDraw(c *gin.Context) {
	st, err := h.Points.DrawLottery(h.currentUserID(c))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, _ := h.User.GetByID(h.currentUserID(c))
	pts := 0
	if user != nil {
		pts = user.Points
	}
	c.JSON(http.StatusOK, gin.H{"message": "抽奖完成", "lottery": st, "points": pts})
}

// APIUnlockPostBlock 积分解锁付费块
func (h *Handlers) APIUnlockPostBlock(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req struct {
		BlockKey string `json:"block_key"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.BlockKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 block_key"})
		return
	}
	res, err := service.UnlockPointsBlock(h.currentUserID(c), uint(id), req.BlockKey)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "解锁成功", "unlock": res})
}

// APIAdminVerifyUser 认证开关
func (h *Handlers) APIAdminVerifyUser(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req struct {
		Verified bool `json:"verified"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := service.SetVerified(uint(id), req.Verified); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	msg := "已取消认证"
	if req.Verified {
		msg = "已认证"
	}
	c.JSON(http.StatusOK, gin.H{"message": msg, "verified": req.Verified})
}

// APIAdminSetUserLevel 设等级
func (h *Handlers) APIAdminSetUserLevel(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req struct {
		Level int `json:"level"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := service.SetUserLevel(uint(id), req.Level); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "等级已更新", "level": req.Level, "exp": model.ExpForLevel(req.Level)})
}

// APIAdminAdjustPoints 调积分
func (h *Handlers) APIAdminAdjustPoints(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req struct {
		Delta int    `json:"delta"`
		Note  string `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	bal, err := h.Points.AdminAdjust(uint(id), req.Delta, req.Note)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "积分已调整", "points": bal})
}

// APIAdminListBadges 徽章定义列表
func (h *Handlers) APIAdminListBadges(c *gin.Context) {
	rows, err := h.Badge.ListDefs(true)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"badges": rows})
}

// APIAdminUpsertBadge 创建/更新徽章定义
func (h *Handlers) APIAdminUpsertBadge(c *gin.Context) {
	var def model.BadgeDef
	if err := c.ShouldBindJSON(&def); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if err := h.Badge.UpsertDef(&def); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已保存", "badge": def})
}

// APIAdminAwardBadge 颁发/收回限定徽章
func (h *Handlers) APIAdminAwardBadge(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var req struct {
		BadgeID uint `json:"badge_id"`
		Revoke  bool `json:"revoke"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.BadgeID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	if req.Revoke {
		if err := h.Badge.Revoke(uint(id), req.BadgeID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "已收回徽章"})
		return
	}
	if err := h.Badge.AwardLimited(uint(id), req.BadgeID, h.currentUserID(c)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已颁发徽章"})
}

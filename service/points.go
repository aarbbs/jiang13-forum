package service

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"time"

	"git.iioio.com/freefire/jiang13-forum/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var (
	ErrInsufficientPoints = errors.New("积分不足")
	ErrAlreadyCheckedIn   = errors.New("今日已签到")
	ErrAlreadyLottery     = errors.New("今日已抽奖")
	ErrInvalidPointsDelta = errors.New("无效的积分变动")
)

// PointsService 积分钱包、签到、抽奖
type PointsService struct{}

func NewPointsService() *PointsService { return &PointsService{} }

func todayLocal() string {
	return time.Now().Format("2006-01-02")
}

// AdjustPointsTx 在已有事务内调整积分并写流水；返回变动后余额
func AdjustPointsTx(tx *gorm.DB, userID uint, delta int, reason, refType string, refID uint, note string) (int, error) {
	if delta == 0 {
		var u model.User
		if err := tx.Select("points").First(&u, userID).Error; err != nil {
			return 0, err
		}
		return u.Points, nil
	}
	var user model.User
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&user, userID).Error; err != nil {
		return 0, err
	}
	newBal := user.Points + delta
	if newBal < 0 {
		return 0, ErrInsufficientPoints
	}
	if err := tx.Model(&user).Update("points", newBal).Error; err != nil {
		return 0, err
	}
	led := model.PointLedger{
		UserID:  userID,
		Delta:   delta,
		Balance: newBal,
		Reason:  reason,
		RefType: refType,
		RefID:   refID,
		Note:    note,
	}
	if err := tx.Create(&led).Error; err != nil {
		return 0, err
	}
	return newBal, nil
}

// AdjustPoints 独立事务调整积分
func (s *PointsService) AdjustPoints(userID uint, delta int, reason, refType string, refID uint, note string) (int, error) {
	var bal int
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var e error
		bal, e = AdjustPointsTx(tx, userID, delta, reason, refType, refID, note)
		return e
	})
	return bal, err
}

// AdminAdjust 站长调账
func (s *PointsService) AdminAdjust(userID uint, delta int, note string) (int, error) {
	if delta == 0 {
		return 0, ErrInvalidPointsDelta
	}
	return s.AdjustPoints(userID, delta, model.PointReasonAdminAdjust, "admin", 0, note)
}

// CheckInStatus 今日签到状态
type CheckInStatus struct {
	CheckedIn   bool   `json:"checked_in"`
	Streak      int    `json:"streak"`
	TodayPoints int    `json:"today_points"` // 若已签到为实得；否则为预计可得
	Day         string `json:"day"`
}

func (s *PointsService) GetCheckInStatus(userID uint) (CheckInStatus, error) {
	day := todayLocal()
	st := CheckInStatus{Day: day}
	var row model.CheckIn
	err := model.DB.Where("user_id = ? AND day = ?", userID, day).Limit(1).Find(&row).Error
	if err != nil {
		return st, err
	}
	if row.ID > 0 {
		st.CheckedIn = true
		st.Streak = row.Streak
		st.TodayPoints = row.Points
		return st, nil
	}
	streak := s.computeNextStreak(userID, day)
	st.Streak = streak
	st.TodayPoints = checkInReward(streak)
	return st, nil
}

func (s *PointsService) computeNextStreak(userID uint, today string) int {
	yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
	var prev model.CheckIn
	model.DB.Where("user_id = ? AND day = ?", userID, yesterday).Limit(1).Find(&prev)
	if prev.ID > 0 {
		return prev.Streak + 1
	}
	return 1
}

func checkInReward(streak int) int {
	// 基础 5，连续每日 +1，封顶 15
	pts := 5 + (streak - 1)
	if pts > 15 {
		pts = 15
	}
	if pts < 5 {
		pts = 5
	}
	return pts
}

// CheckIn 每日签到
func (s *PointsService) CheckIn(userID uint) (CheckInStatus, error) {
	day := todayLocal()
	var out CheckInStatus
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var existing model.CheckIn
		if err := tx.Where("user_id = ? AND day = ?", userID, day).Limit(1).Find(&existing).Error; err != nil {
			return err
		}
		if existing.ID > 0 {
			return ErrAlreadyCheckedIn
		}
		yesterday := time.Now().AddDate(0, 0, -1).Format("2006-01-02")
		var prev model.CheckIn
		_ = tx.Where("user_id = ? AND day = ?", userID, yesterday).Limit(1).Find(&prev).Error
		streak := 1
		if prev.ID > 0 {
			streak = prev.Streak + 1
		}
		pts := checkInReward(streak)
		row := model.CheckIn{UserID: userID, Day: day, Points: pts, Streak: streak}
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		if _, err := AdjustPointsTx(tx, userID, pts, model.PointReasonCheckIn, "check_in", row.ID, fmt.Sprintf("连续签到 %d 天", streak)); err != nil {
			return err
		}
		out = CheckInStatus{CheckedIn: true, Streak: streak, TodayPoints: pts, Day: day}
		return nil
	})
	return out, err
}

// LotteryPrize 奖池项
type LotteryPrize struct {
	Points int `json:"points"`
	Weight int `json:"weight"`
}

var defaultLotteryPool = []LotteryPrize{
	{Points: 0, Weight: 40},
	{Points: 2, Weight: 30},
	{Points: 5, Weight: 18},
	{Points: 10, Weight: 10},
	{Points: 20, Weight: 2},
}

// LotteryStatus 抽奖状态
type LotteryStatus struct {
	Drawn       bool           `json:"drawn"`
	Points      int            `json:"points"` // 今日已抽中
	Day         string         `json:"day"`
	Pool        []LotteryPrize `json:"pool"`
	Cost        int            `json:"cost"` // 抽奖消耗，首版 0
}

func (s *PointsService) GetLotteryStatus(userID uint) (LotteryStatus, error) {
	day := todayLocal()
	st := LotteryStatus{Day: day, Pool: defaultLotteryPool, Cost: 0}
	var row model.LotteryDraw
	if err := model.DB.Where("user_id = ? AND day = ?", userID, day).Limit(1).Find(&row).Error; err != nil {
		return st, err
	}
	if row.ID > 0 {
		st.Drawn = true
		st.Points = row.Points
	}
	return st, nil
}

func pickLottery(pool []LotteryPrize) (int, error) {
	total := 0
	for _, p := range pool {
		total += p.Weight
	}
	if total <= 0 {
		return 0, errors.New("奖池无效")
	}
	n, err := rand.Int(rand.Reader, big.NewInt(int64(total)))
	if err != nil {
		return 0, err
	}
	v := int(n.Int64())
	for _, p := range pool {
		if v < p.Weight {
			return p.Points, nil
		}
		v -= p.Weight
	}
	return pool[len(pool)-1].Points, nil
}

// DrawLottery 每日抽奖
func (s *PointsService) DrawLottery(userID uint) (LotteryStatus, error) {
	day := todayLocal()
	var out LotteryStatus
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var existing model.LotteryDraw
		if err := tx.Where("user_id = ? AND day = ?", userID, day).Limit(1).Find(&existing).Error; err != nil {
			return err
		}
		if existing.ID > 0 {
			return ErrAlreadyLottery
		}
		pts, err := pickLottery(defaultLotteryPool)
		if err != nil {
			return err
		}
		row := model.LotteryDraw{UserID: userID, Day: day, Points: pts}
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
		if pts > 0 {
			if _, err := AdjustPointsTx(tx, userID, pts, model.PointReasonLottery, "lottery", row.ID, "每日抽奖"); err != nil {
				return err
			}
		}
		out = LotteryStatus{Drawn: true, Points: pts, Day: day, Pool: defaultLotteryPool, Cost: 0}
		return nil
	})
	return out, err
}

// ListLedger 积分流水
func (s *PointsService) ListLedger(userID uint, page, size int) ([]model.PointLedger, int64, error) {
	if page < 1 {
		page = 1
	}
	if size < 1 || size > 50 {
		size = 20
	}
	var total int64
	model.DB.Model(&model.PointLedger{}).Where("user_id = ?", userID).Count(&total)
	var rows []model.PointLedger
	err := model.DB.Where("user_id = ?", userID).Order("id desc").
		Offset((page - 1) * size).Limit(size).Find(&rows).Error
	return rows, total, err
}

package services

import (
	"errors"
	"time"

	"git.iioio.com/freefire/jiang13-forum/models"
	"gorm.io/gorm"
)

// BadgeService 徽章定义与发放
type BadgeService struct{}

func NewBadgeService() *BadgeService { return &BadgeService{} }

// ListDefs 列出徽章定义
func (s *BadgeService) ListDefs(includeDisabled bool) ([]models.BadgeDef, error) {
	q := models.DB.Order("sort_order asc, id asc")
	if !includeDisabled {
		q = q.Where("enabled = ?", true)
	}
	var rows []models.BadgeDef
	err := q.Find(&rows).Error
	return rows, err
}

// UpsertDef 创建或更新徽章定义（按 code）
func (s *BadgeService) UpsertDef(def *models.BadgeDef) error {
	if def.Code == "" || def.Name == "" {
		return errors.New("徽章代码与名称不能为空")
	}
	if def.Kind != models.BadgeKindAuto && def.Kind != models.BadgeKindLimited {
		return errors.New("无效的徽章类型")
	}
	var existing models.BadgeDef
	err := models.DB.Where("code = ?", def.Code).Limit(1).Find(&existing).Error
	if err != nil {
		return err
	}
	if existing.ID == 0 {
		return models.DB.Create(def).Error
	}
	def.ID = existing.ID
	return models.DB.Model(&existing).Updates(map[string]interface{}{
		"name":        def.Name,
		"description": def.Description,
		"icon":        def.Icon,
		"kind":        def.Kind,
		"metric":      def.Metric,
		"threshold":   def.Threshold,
		"sort_order":  def.SortOrder,
		"enabled":     def.Enabled,
	}).Error
}

// AwardLimited 站长颁发限定徽章
func (s *BadgeService) AwardLimited(userID, badgeID, adminID uint) error {
	var def models.BadgeDef
	if err := models.DB.First(&def, badgeID).Error; err != nil {
		return errors.New("徽章不存在")
	}
	if def.Kind != models.BadgeKindLimited {
		return errors.New("仅可颁发限定徽章")
	}
	if !def.Enabled {
		return errors.New("徽章已停用")
	}
	var n int64
	models.DB.Model(&models.UserBadge{}).Where("user_id = ? AND badge_id = ?", userID, badgeID).Count(&n)
	if n > 0 {
		return errors.New("用户已拥有该徽章")
	}
	return models.DB.Create(&models.UserBadge{
		UserID:    userID,
		BadgeID:   badgeID,
		AwardedAt: time.Now(),
		AwardedBy: adminID,
	}).Error
}

// Revoke 收回徽章
func (s *BadgeService) Revoke(userID, badgeID uint) error {
	res := models.DB.Where("user_id = ? AND badge_id = ?", userID, badgeID).Delete(&models.UserBadge{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return errors.New("用户未拥有该徽章")
	}
	return nil
}

// ListUserBadges 用户已获徽章（含定义）
func (s *BadgeService) ListUserBadges(userID uint) ([]models.UserBadge, error) {
	var rows []models.UserBadge
	err := models.DB.Preload("Badge").Where("user_id = ?", userID).
		Order("awarded_at desc").Find(&rows).Error
	return rows, err
}

// BadgeViews 转为展示视图（最多 limit 枚，0=全部）
func BadgeViews(rows []models.UserBadge, limit int) []models.UserBadgeView {
	out := make([]models.UserBadgeView, 0, len(rows))
	for _, r := range rows {
		if r.Badge.ID == 0 || !r.Badge.Enabled {
			continue
		}
		out = append(out, models.UserBadgeView{
			Code:        r.Badge.Code,
			Name:        r.Badge.Name,
			Description: r.Badge.Description,
			Icon:        r.Badge.Icon,
			Kind:        r.Badge.Kind,
		})
		if limit > 0 && len(out) >= limit {
			break
		}
	}
	return out
}

// EvaluateAuto 检查并授予符合条件的自动徽章
func (s *BadgeService) EvaluateAuto(userID uint) error {
	var user models.User
	if err := models.DB.First(&user, userID).Error; err != nil {
		return err
	}
	var defs []models.BadgeDef
	if err := models.DB.Where("kind = ? AND enabled = ?", models.BadgeKindAuto, true).Find(&defs).Error; err != nil {
		return err
	}
	tenureDays := int(time.Since(user.CreatedAt).Hours() / 24)
	var likes int64
	_ = models.DB.Model(&models.Post{}).
		Select("COALESCE(SUM(like_count), 0)").
		Where("user_id = ? AND status = ?", userID, models.ContentStatusPublished).
		Scan(&likes).Error
	income := user.CreatorIncomeTotal

	owned := map[uint]bool{}
	var existing []models.UserBadge
	_ = models.DB.Where("user_id = ?", userID).Find(&existing).Error
	for _, e := range existing {
		owned[e.BadgeID] = true
	}

	for _, d := range defs {
		if owned[d.ID] {
			continue
		}
		ok := false
		switch d.Metric {
		case models.BadgeMetricTenureDays:
			ok = tenureDays >= d.Threshold
		case models.BadgeMetricLikesReceived:
			ok = int(likes) >= d.Threshold
		case models.BadgeMetricCreatorIncome:
			ok = income >= d.Threshold
		}
		if !ok {
			continue
		}
		_ = models.DB.Create(&models.UserBadge{
			UserID:    userID,
			BadgeID:   d.ID,
			AwardedAt: time.Now(),
			AwardedBy: 0,
		}).Error
	}
	return nil
}

// AttachBadgeSummaries 批量为用户填充展示用徽章（最多 perUser 枚）
func (s *BadgeService) AttachBadgeSummaries(users []*models.User, perUser int) {
	if len(users) == 0 {
		return
	}
	if perUser <= 0 {
		perUser = 3
	}
	ids := make([]uint, 0, len(users))
	seen := map[uint]bool{}
	for _, u := range users {
		if u == nil || u.ID == 0 {
			continue
		}
		u.Level = models.LevelFromExp(u.Exp)
		if !seen[u.ID] {
			seen[u.ID] = true
			ids = append(ids, u.ID)
		}
	}
	if len(ids) == 0 {
		return
	}
	var rows []models.UserBadge
	_ = models.DB.Preload("Badge").Where("user_id IN ?", ids).
		Order("awarded_at desc").Find(&rows).Error
	grouped := map[uint][]models.UserBadgeView{}
	for _, r := range rows {
		if r.Badge.ID == 0 || !r.Badge.Enabled {
			continue
		}
		list := grouped[r.UserID]
		if len(list) >= perUser {
			continue
		}
		list = append(list, models.UserBadgeView{
			Code:        r.Badge.Code,
			Name:        r.Badge.Name,
			Description: r.Badge.Description,
			Icon:        r.Badge.Icon,
			Kind:        r.Badge.Kind,
		})
		grouped[r.UserID] = list
	}
	for _, u := range users {
		if u == nil || u.ID == 0 {
			continue
		}
		u.Badges = grouped[u.ID]
	}
}

// AttachBadgeSummariesOnPosts 给帖子作者填充徽章摘要
func (s *BadgeService) AttachBadgeSummariesOnPosts(posts []models.Post, perUser int) {
	users := make([]*models.User, 0, len(posts))
	for i := range posts {
		if posts[i].User.ID > 0 {
			users = append(users, &posts[i].User)
		}
	}
	s.AttachBadgeSummaries(users, perUser)
}

// AttachBadgeSummariesOnComments 给评论作者填充徽章摘要
func (s *BadgeService) AttachBadgeSummariesOnComments(comments []models.Comment, perUser int) {
	users := make([]*models.User, 0, len(comments))
	for i := range comments {
		if comments[i].User.ID > 0 {
			users = append(users, &comments[i].User)
		}
	}
	s.AttachBadgeSummaries(users, perUser)
}

// AddExp 增加经验（不可为负消耗；delta<=0 忽略）
func AddExp(userID uint, delta int) {
	if userID == 0 || delta <= 0 {
		return
	}
	_ = models.DB.Model(&models.User{}).Where("id = ?", userID).
		UpdateColumn("exp", gorm.Expr("exp + ?", delta)).Error
}

// SetUserLevel 站长设等级（调整 Exp 到门槛）
func SetUserLevel(userID uint, level int) error {
	if level < 1 || level > models.MaxLevel() {
		return errors.New("等级须在 1–10")
	}
	exp := models.ExpForLevel(level)
	return models.DB.Model(&models.User{}).Where("id = ?", userID).Update("exp", exp).Error
}

// SetVerified 设置认证
func SetVerified(userID uint, verified bool) error {
	var user models.User
	if err := models.DB.First(&user, userID).Error; err != nil {
		return errors.New("用户不存在")
	}
	return models.DB.Model(&user).Update("verified", verified).Error
}

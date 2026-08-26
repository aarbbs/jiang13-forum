package model

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/glebarez/sqlite" // 纯 Go，支持 CGO_ENABLED=0 交叉编译
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// InitDB 初始化 SQLite 并自动迁移
func InitDB(dbPath string) error {
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("创建数据库目录失败: %w", err)
	}

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return fmt.Errorf("连接 SQLite 失败: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	sqlDB.SetMaxOpenConns(1)

	if err := db.AutoMigrate(
		&User{}, &Board{}, &Post{}, &Comment{},
		&PostLike{}, &CommentLike{}, &PostFavorite{}, &PostRevision{}, &CommentRevision{}, &ForumSetting{},
		&OAuthClient{}, &OAuthAuthCode{},
		&GiteaRepo{},
		&PrivateMessage{}, &PostReport{}, &FriendLinkApply{},
		&Media{},
		&PointLedger{}, &CheckIn{}, &LotteryDraw{}, &PostContentUnlock{},
		&BadgeDef{}, &UserBadge{},
		&SitePage{}, &Poll{}, &PollOption{}, &PollVote{}, &PostLotteryWinner{},
	); err != nil {
		return fmt.Errorf("自动迁移失败: %w", err)
	}

	// 存量数据默认视为已公开，避免升级后内容全部进入待审
	_ = db.Model(&Post{}).Where("status = '' OR status IS NULL").Update("status", ContentStatusPublished).Error
	_ = db.Model(&Comment{}).Where("status = '' OR status IS NULL").Update("status", ContentStatusPublished).Error
	_ = db.Model(&Post{}).Where("post_type = '' OR post_type IS NULL").Update("post_type", PostTypeNormal).Error

	DB = db
	seedDefaultBadges(db)
	backfillUserExp(db)
	log.Println("[model] SQLite 数据库初始化完成:", dbPath)
	return nil
}

// PingDB 检测数据库连接是否可用（供健康检查使用）
func PingDB() error {
	if DB == nil {
		return fmt.Errorf("数据库未初始化")
	}
	sqlDB, err := DB.DB()
	if err != nil {
		return err
	}
	return sqlDB.Ping()
}

// seedDefaultBadges 写入内置自动徽章（已存在则跳过）
func seedDefaultBadges(db *gorm.DB) {
	defs := []BadgeDef{
		{Code: "tenure_30", Name: "初来乍到", Description: "注册满 30 天", Icon: "calendar", Kind: BadgeKindAuto, Metric: BadgeMetricTenureDays, Threshold: 30, SortOrder: 10, Enabled: true},
		{Code: "tenure_365", Name: "资深居民", Description: "注册满 365 天", Icon: "calendar-heart", Kind: BadgeKindAuto, Metric: BadgeMetricTenureDays, Threshold: 365, SortOrder: 20, Enabled: true},
		{Code: "likes_10", Name: "小有人气", Description: "帖子获赞累计 10", Icon: "heart", Kind: BadgeKindAuto, Metric: BadgeMetricLikesReceived, Threshold: 10, SortOrder: 30, Enabled: true},
		{Code: "likes_100", Name: "人气作者", Description: "帖子获赞累计 100", Icon: "heart-handshake", Kind: BadgeKindAuto, Metric: BadgeMetricLikesReceived, Threshold: 100, SortOrder: 40, Enabled: true},
		{Code: "likes_1000", Name: "人气巨星", Description: "帖子获赞累计 1000", Icon: "flame", Kind: BadgeKindAuto, Metric: BadgeMetricLikesReceived, Threshold: 1000, SortOrder: 50, Enabled: true},
		{Code: "income_100", Name: "小有进账", Description: "创作分成累计 100 积分", Icon: "coins", Kind: BadgeKindAuto, Metric: BadgeMetricCreatorIncome, Threshold: 100, SortOrder: 60, Enabled: true},
		{Code: "income_1000", Name: "创作达人", Description: "创作分成累计 1000 积分", Icon: "gem", Kind: BadgeKindAuto, Metric: BadgeMetricCreatorIncome, Threshold: 1000, SortOrder: 70, Enabled: true},
	}
	for _, d := range defs {
		var n int64
		db.Model(&BadgeDef{}).Where("code = ?", d.Code).Count(&n)
		if n == 0 {
			_ = db.Create(&d).Error
		}
	}
}

// backfillUserExp 对 Exp 仍为 0 的用户按存量公开内容粗算经验（仅补一次量级）
func backfillUserExp(db *gorm.DB) {
	var users []User
	if err := db.Select("id", "exp").Where("exp = 0").Find(&users).Error; err != nil {
		return
	}
	for _, u := range users {
		var posts, comments int64
		var likeSum int64
		_ = db.Model(&Post{}).Where("user_id = ? AND status = ?", u.ID, ContentStatusPublished).Count(&posts).Error
		_ = db.Model(&Comment{}).Where("user_id = ? AND status = ?", u.ID, ContentStatusPublished).Count(&comments).Error
		_ = db.Model(&Post{}).Select("COALESCE(SUM(like_count), 0)").Where("user_id = ? AND status = ?", u.ID, ContentStatusPublished).Scan(&likeSum).Error
		exp := int(posts)*10 + int(comments)*2 + int(likeSum)
		if exp > 0 {
			_ = db.Model(&User{}).Where("id = ? AND exp = 0", u.ID).Update("exp", exp).Error
		}
	}
}

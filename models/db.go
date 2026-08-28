package models

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

// DatabaseConfig 与 config.DatabaseConfig 对齐的精简结构（避免 models→config 循环依赖）
type DatabaseConfig struct {
	Type                string
	DSN                 string
	SQLitePath          string
	MaxOpenConns        int
	MaxIdleConns        int
	ConnMaxLifetimeSec    int
}

// InitDB 按方言初始化数据库并自动迁移
func InitDB(cfg DatabaseConfig) error {
	typ := strings.ToLower(strings.TrimSpace(cfg.Type))
	if typ == "" {
		typ = "sqlite"
	}

	dialector, err := openDialector(typ, cfg)
	if err != nil {
		return err
	}

	db, err := gorm.Open(dialector, &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return fmt.Errorf("连接数据库失败 (%s): %w — 请检查 JIANG13_DB_TYPE / JIANG13_DB_DSN", typ, err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	if cfg.MaxOpenConns > 0 {
		sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	}
	if cfg.MaxIdleConns > 0 {
		sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	}
	if cfg.ConnMaxLifetimeSec > 0 {
		sqlDB.SetConnMaxLifetime(time.Duration(cfg.ConnMaxLifetimeSec) * time.Second)
	}

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
		&Session{},
	); err != nil {
		return fmt.Errorf("自动迁移失败: %w", err)
	}

	_ = db.Model(&Post{}).Where("status = '' OR status IS NULL").Update("status", ContentStatusPublished).Error
	_ = db.Model(&Comment{}).Where("status = '' OR status IS NULL").Update("status", ContentStatusPublished).Error
	_ = db.Model(&Post{}).Where("post_type = '' OR post_type IS NULL").Update("post_type", PostTypeNormal).Error

	DB = db
	seedDefaultBadges(db)
	backfillUserExp(db)
	log.Printf("[models] 数据库初始化完成 type=%s", typ)
	return nil
}

func openDialector(typ string, cfg DatabaseConfig) (gorm.Dialector, error) {
	switch typ {
	case "sqlite", "sqlite3":
		path := cfg.SQLitePath
		if path == "" {
			path = cfg.DSN
		}
		if path == "" {
			return nil, fmt.Errorf("sqlite 需要文件路径")
		}
		if path != ":memory:" {
			if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
				return nil, fmt.Errorf("创建数据库目录失败: %w", err)
			}
		}
		return sqlite.Open(path), nil
	case "postgres", "postgresql", "pg":
		if cfg.DSN == "" {
			return nil, fmt.Errorf("postgres 需要 JIANG13_DB_DSN 或 HOST/USER/NAME")
		}
		return postgres.Open(cfg.DSN), nil
	case "mysql", "mariadb":
		if cfg.DSN == "" {
			return nil, fmt.Errorf("mysql 需要 JIANG13_DB_DSN 或 HOST/USER/NAME")
		}
		return mysql.Open(cfg.DSN), nil
	default:
		return nil, fmt.Errorf("不支持的数据库类型 %q", typ)
	}
}

// DialectorName 当前驱动名（sqlite/postgres/mysql）
func DialectorName() string {
	if DB == nil {
		return ""
	}
	return DB.Dialector.Name()
}

// PingDB 检测数据库连接是否可用
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
		{Code: "tenure_365", Name: "常驻居民", Description: "注册满 365 天", Icon: "calendar-heart", Kind: BadgeKindAuto, Metric: BadgeMetricTenureDays, Threshold: 365, SortOrder: 20, Enabled: true},
		{Code: "likes_10", Name: "小有人气", Description: "帖子获赞累计 10", Icon: "heart", Kind: BadgeKindAuto, Metric: BadgeMetricLikesReceived, Threshold: 10, SortOrder: 30, Enabled: true},
		{Code: "likes_100", Name: "人气作者", Description: "帖子获赞累计 100", Icon: "heart-handshake", Kind: BadgeKindAuto, Metric: BadgeMetricLikesReceived, Threshold: 100, SortOrder: 40, Enabled: true},
		{Code: "likes_1000", Name: "超级人气", Description: "帖子获赞累计 1000", Icon: "flame", Kind: BadgeKindAuto, Metric: BadgeMetricLikesReceived, Threshold: 1000, SortOrder: 50, Enabled: true},
		{Code: "income_100", Name: "小有进账", Description: "创作者分成累计 100 积分", Icon: "coins", Kind: BadgeKindAuto, Metric: BadgeMetricCreatorIncome, Threshold: 100, SortOrder: 60, Enabled: true},
		{Code: "income_1000", Name: "创收达人", Description: "创作者分成累计 1000 积分", Icon: "gem", Kind: BadgeKindAuto, Metric: BadgeMetricCreatorIncome, Threshold: 1000, SortOrder: 70, Enabled: true},
	}
	for _, d := range defs {
		var n int64
		db.Model(&BadgeDef{}).Where("code = ?", d.Code).Count(&n)
		if n == 0 {
			_ = db.Create(&d).Error
		}
	}
}

// backfillUserExp 对 Exp 仍为 0 的用户按发帖/评论/获赞粗算经验（仅补一次语义）
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

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
		&PostLike{}, &PostFavorite{}, &PostRevision{}, &ForumSetting{},
		&OAuthClient{}, &OAuthAuthCode{},
		&GiteaRepo{},
	); err != nil {
		return fmt.Errorf("自动迁移失败: %w", err)
	}

	DB = db
	log.Println("[model] SQLite 数据库初始化完成:", dbPath)
	return nil
}

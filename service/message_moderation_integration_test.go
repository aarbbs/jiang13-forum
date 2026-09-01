package service

import (
	"os"
	"path/filepath"
	"testing"

	"git.iioio.com/freefire/jiang13-forum/model"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// TestProductionDBModerationEnrich 用本地生产库拷贝验证 related_status 回填（无库则跳过）
func TestProductionDBModerationEnrich(t *testing.T) {
	dbPath := filepath.Join("..", "dist", "data", "jiang13.db")
	if _, err := os.Stat(dbPath); err != nil {
		t.Skip("dist/data/jiang13.db 不存在，跳过")
	}

	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	model.DB = db

	if err := BackfillModerationNotifyRefs(); err != nil {
		t.Fatal(err)
	}

	var adminID uint
	if err := db.Model(&model.User{}).Where("role = ?", model.RoleAdmin).Order("id asc").Limit(1).Pluck("id", &adminID).Error; err != nil || adminID == 0 {
		t.Skip("无管理员用户，跳过")
	}

	svc := &MessageService{}
	list, _, err := svc.ListNotifications(adminID, 1, 100, "moderation")
	if err != nil {
		t.Fatal(err)
	}
	if len(list) == 0 {
		t.Skip("无 moderation 通知")
	}

	pendingUI := 0
	published := 0
	for _, m := range list {
		if m.RelatedStatus == model.ContentStatusPublished {
			published++
		} else if m.RelatedStatus == "" || m.RelatedStatus == model.ContentStatusPending {
			pendingUI++
			t.Logf("仍无 published 状态: id=%d subject=%q status=%q content=%q", m.ID, m.Subject, m.RelatedStatus, m.Content)
		}
	}
	t.Logf("moderation=%d published=%d pending_or_empty=%d", len(list), published, pendingUI)
	if published == 0 {
		t.Fatal("没有任何 moderation 通知回填为 published")
	}
	if pendingUI > 0 {
		t.Fatalf("%d 条通知仍会被 UI 判为待审", pendingUI)
	}
}

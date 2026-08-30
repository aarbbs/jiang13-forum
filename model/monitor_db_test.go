package model

import (
	"path/filepath"
	"testing"

	"gorm.io/gorm"
)

func TestInitMonitorDBUsesSeparateFile(t *testing.T) {
	dir := t.TempDir()
	mainPath := filepath.Join(dir, "jiang13.db")
	monPath := filepath.Join(dir, "monitor.db")

	prevDB, prevMon := DB, MonitorDB
	t.Cleanup(func() {
		closeGorm(MonitorDB)
		closeGorm(DB)
		DB, MonitorDB = prevDB, prevMon
	})

	if err := InitDB(mainPath); err != nil {
		t.Fatal(err)
	}
	if err := InitMonitorDB(monPath); err != nil {
		t.Fatal(err)
	}
	if tableExists(DB, "page_views") {
		t.Fatal("主库不应创建 page_views")
	}
	if !tableExists(MonitorDB, "page_views") {
		t.Fatal("监控库缺少 page_views")
	}
}

func tableExists(db *gorm.DB, name string) bool {
	if db == nil {
		return false
	}
	var n int
	_ = db.Raw("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", name).Scan(&n).Error
	return n > 0
}

func closeGorm(db *gorm.DB) {
	if db == nil {
		return
	}
	sqlDB, err := db.DB()
	if err != nil {
		return
	}
	_ = sqlDB.Close()
}

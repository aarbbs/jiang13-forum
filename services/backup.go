package services

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"git.iioio.com/freefire/jiang13-forum/models"
)

type BackupService struct {
	dbPath  string
	dataDir string
}

func NewBackupService(dbPath, dataDir string) *BackupService {
	return &BackupService{dbPath: dbPath, dataDir: dataDir}
}

// ExportSQLite 导出 SQLite 备份文件到 data 目录（仅 sqlite）
func (s *BackupService) ExportSQLite() (string, error) {
	if models.DialectorName() != "sqlite" {
		return "", fmt.Errorf("一键文件备份仅支持 SQLite；当前为 %s，请使用数据库自带备份工具", models.DialectorName())
	}
	src, err := os.Open(s.dbPath)
	if err != nil {
		return "", fmt.Errorf("打开数据库失败: %w", err)
	}
	defer src.Close()

	filename := fmt.Sprintf("jiang13_backup_%s.db", time.Now().Format("20060102_150405"))
	destPath := filepath.Join(s.dataDir, filename)
	dst, err := os.Create(destPath)
	if err != nil {
		return "", err
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return "", err
	}
	return destPath, nil
}

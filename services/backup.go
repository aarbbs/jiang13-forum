package services

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

type BackupService struct {
	dbPath  string
	dataDir string
}

func NewBackupService(dbPath, dataDir string) *BackupService {
	return &BackupService{dbPath: dbPath, dataDir: dataDir}
}

// ExportSQLite 导出 SQLite 备份文件到 data 目录
func (s *BackupService) ExportSQLite() (string, error) {
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

// WriteDefaultFilterWords 写入默认敏感词配置
func WriteDefaultFilterWords(path string) error {
	if _, err := os.Stat(path); err == nil {
		return nil
	}
	content := `# 姜十三论坛敏感词配置，每行一个词，# 开头为注释
违禁词示例
广告刷单
`
	return os.WriteFile(path, []byte(content), 0644)
}

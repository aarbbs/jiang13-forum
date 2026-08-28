package services

import (
	"errors"
	"os"
	"path/filepath"

	"git.iioio.com/freefire/jiang13-forum/models"
)

const installLockName = "install.lock"

// InstallLockPath 安装锁文件路径
func InstallLockPath(dataDir string) string {
	return filepath.Join(dataDir, installLockName)
}

// IsInstalled 是否已完成安装向导
func IsInstalled(dataDir string) bool {
	_, err := os.Stat(InstallLockPath(dataDir))
	return err == nil
}

// EnsureInstallLockFromExistingData 已有用户时自动写锁（避免旧数据无法启动）
func EnsureInstallLockFromExistingData(dataDir string) error {
	if IsInstalled(dataDir) {
		return nil
	}
	var n int64
	if err := models.DB.Model(&models.User{}).Count(&n).Error; err != nil {
		return err
	}
	if n == 0 {
		return nil
	}
	return WriteInstallLock(dataDir)
}

// WriteInstallLock 写入安装锁
func WriteInstallLock(dataDir string) error {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(InstallLockPath(dataDir), []byte("installed\n"), 0o644)
}

// ErrAlreadyInstalled 已安装
var ErrAlreadyInstalled = errors.New("already installed")

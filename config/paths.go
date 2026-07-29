package config

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// resolveAppPath 返回可执行文件的绝对路径（解析符号链接）
func resolveAppPath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("获取可执行文件路径失败: %w", err)
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return "", fmt.Errorf("解析可执行文件路径失败: %w", err)
	}
	return exe, nil
}

// defaultWorkPath 类似 Gitea：默认可执行文件所在目录；
// go run 时二进制在临时目录，回退为当前工作目录。
func defaultWorkPath() (string, error) {
	exe, err := resolveAppPath()
	if err != nil {
		return "", err
	}
	dir := filepath.Dir(exe)
	if isEphemeralExeDir(dir) {
		wd, err := os.Getwd()
		if err != nil {
			return "", fmt.Errorf("获取当前目录失败: %w", err)
		}
		return filepath.Clean(wd), nil
	}
	return dir, nil
}

func isEphemeralExeDir(dir string) bool {
	lower := strings.ToLower(filepath.Clean(dir))
	sep := string(filepath.Separator)
	markers := []string{
		sep + "go-build",
		sep + "go-run",
	}
	if runtime.GOOS == "windows" {
		markers = append(markers, "\\go-build", "\\go-run")
	}
	for _, m := range markers {
		if strings.Contains(lower, strings.ToLower(m)) {
			return true
		}
	}
	return false
}

func absPath(base, p string) (string, error) {
	p = strings.TrimSpace(p)
	if p == "" {
		return "", fmt.Errorf("路径为空")
	}
	if filepath.IsAbs(p) {
		return filepath.Clean(p), nil
	}
	return filepath.Abs(filepath.Join(base, p))
}

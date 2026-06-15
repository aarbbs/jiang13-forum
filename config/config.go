package config

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
)

// Config 应用全局配置，通过命令行参数注入
type Config struct {
	// 监听端口
	Port int
	// 数据目录：SQLite 数据库、上传头像、日志文件均存放于此
	DataDir string
	// JWT 签名密钥
	JWTSecret string
	// 日志文件路径（相对 DataDir）
	LogFile string
}

// Parse 解析命令行参数并初始化目录
func Parse() (*Config, error) {
	port := flag.Int("port", 3000, "HTTP 监听端口")
	dataDir := flag.String("data", "./data", "数据存储目录（数据库、上传、日志）")
	jwtSecret := flag.String("jwt-secret", "", "JWT 签名密钥（留空则自动生成并持久化）")
	flag.Parse()

	// 确保数据目录存在
	if err := os.MkdirAll(*dataDir, 0755); err != nil {
		return nil, fmt.Errorf("创建数据目录失败: %w", err)
	}
	uploadDir := filepath.Join(*dataDir, "uploads", "avatars")
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		return nil, fmt.Errorf("创建上传目录失败: %w", err)
	}
	postImgDir := filepath.Join(*dataDir, "uploads", "posts")
	if err := os.MkdirAll(postImgDir, 0755); err != nil {
		return nil, fmt.Errorf("创建帖子图片目录失败: %w", err)
	}

	cfg := &Config{
		Port:      *port,
		DataDir:   *dataDir,
		JWTSecret: *jwtSecret,
		LogFile:   filepath.Join(*dataDir, "jiang13.log"),
	}

	// 处理 JWT 密钥持久化
	secretFile := filepath.Join(*dataDir, ".jwt_secret")
	if cfg.JWTSecret == "" {
		if data, err := os.ReadFile(secretFile); err == nil && len(data) > 0 {
			cfg.JWTSecret = string(data)
		} else {
			cfg.JWTSecret = generateRandomSecret(32)
			_ = os.WriteFile(secretFile, []byte(cfg.JWTSecret), 0600)
		}
	}

	return cfg, nil
}

// DBPath 返回 SQLite 数据库文件路径
func (c *Config) DBPath() string {
	return filepath.Join(c.DataDir, "jiang13.db")
}

// AvatarUploadDir 返回头像上传目录
func (c *Config) AvatarUploadDir() string {
	return filepath.Join(c.DataDir, "uploads", "avatars")
}

// PostImageUploadDir 返回帖子正文图片上传目录
func (c *Config) PostImageUploadDir() string {
	return filepath.Join(c.DataDir, "uploads", "posts")
}

// UploadDir 返回头像上传目录（兼容旧调用）
func (c *Config) UploadDir() string {
	return c.AvatarUploadDir()
}

// FilterWordsPath 返回敏感词配置文件路径
func (c *Config) FilterWordsPath() string {
	return filepath.Join(c.DataDir, "filter_words.txt")
}

func generateRandomSecret(n int) string {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = chars[i%len(chars)]
	}
	return string(b)
}

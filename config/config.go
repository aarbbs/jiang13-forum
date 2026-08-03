package config

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// StorageTypeLocal / StorageTypeS3 上传存储后端
const (
	StorageTypeLocal = "local"
	StorageTypeS3    = "s3"
)

// S3Config S3 兼容对象存储（MinIO / 七牛 / 又拍 / 阿里云 OSS 等）
type S3Config struct {
	Endpoint       string // 例：https://s3.example.com 或 s3.example.com:9000
	Region         string
	Bucket         string
	AccessKey      string
	SecretKey      string
	PublicBaseURL  string // 公开访问根 URL（无尾斜杠），上传后返回此前缀下的绝对地址
	Prefix         string // 对象 key 前缀（可选，如 forum/）
	ForcePathStyle bool   // path-style（MinIO 等通常为 true；AWS 官方多为 false）
}

// Config 应用全局配置：默认读工作目录下 app.ini，命令行可覆盖
type Config struct {
	// 工作目录（默认可执行文件所在目录）
	WorkPath string
	// 配置文件绝对路径
	ConfigFile string
	// 监听端口
	Port int
	// 对外公网根地址（无尾斜杠），OIDC Issuer 使用
	RootURL string
	// 数据目录：SQLite、上传、日志（绝对路径）
	DataDir string
	// JWT 签名密钥
	JWTSecret string
	// OIDC 客户端（P0：写死在 app.ini，供 Gitea 对接）
	OAuthClientID     string
	OAuthClientSecret string
	OAuthRedirectURIs []string
	// Gitea API 同步种子（可选，运行时以管理后台为准）
	GiteaBaseURL     string
	GiteaToken       string
	GiteaSyncEnabled bool
	// 上传存储：local（默认）或 s3
	StorageType string
	S3          S3Config
	// 日志文件路径
	LogFile string
	// 系统服务控制动作：install|uninstall|start|stop|restart|status，空表示正常运行
	ServiceAction string
}

// Parse 解析命令行与 app.ini，并初始化数据目录
//
// 优先级（高 → 低）：命令行显式参数 > app.ini > 内置默认值
func Parse() (*Config, error) {
	configFlag := flag.String("config", "", "配置文件路径（默认：工作目录/app.ini）")
	workFlag := flag.String("work-path", "", "工作目录（默认：可执行文件所在目录）")
	portFlag := flag.Int("port", 0, "HTTP 监听端口（覆盖配置文件；0 表示不覆盖）")
	dataFlag := flag.String("data", "", "数据存储目录（覆盖配置文件）")
	jwtFlag := flag.String("jwt-secret", "", "JWT 签名密钥（覆盖配置文件；留空则自动生成）")
	serviceFlag := flag.String("service", "", "系统服务控制：install|uninstall|start|stop|restart|status")
	flag.Parse()

	action := strings.ToLower(strings.TrimSpace(*serviceFlag))
	if action != "" && !validServiceAction(action) {
		return nil, fmt.Errorf("无效的 -service 动作 %q，可选：install|uninstall|start|stop|restart|status", *serviceFlag)
	}

	workPath, err := resolveWorkPath(*workFlag)
	if err != nil {
		return nil, err
	}

	configFile, err := resolveConfigPath(workPath, *configFlag)
	if err != nil {
		return nil, err
	}

	fileCfg := defaultFileSettings()
	configExists := false
	if st, err := os.Stat(configFile); err == nil && !st.IsDir() {
		configExists = true
		fileCfg, err = loadAppINI(configFile)
		if err != nil {
			return nil, err
		}
	}

	port := fileCfg.Port
	if *portFlag > 0 {
		port = *portFlag
	}

	dataInput := fileCfg.DataRel
	if strings.TrimSpace(*dataFlag) != "" {
		dataInput = *dataFlag
	}
	absData, err := absPath(workPath, dataInput)
	if err != nil {
		return nil, fmt.Errorf("解析数据目录失败: %w", err)
	}

	jwtSecret := strings.TrimSpace(*jwtFlag)
	if jwtSecret == "" {
		jwtSecret = fileCfg.JWTSecret
	}

	storageType := strings.ToLower(strings.TrimSpace(fileCfg.StorageType))
	if storageType == "" {
		storageType = StorageTypeLocal
	}
	if storageType != StorageTypeLocal && storageType != StorageTypeS3 {
		return nil, fmt.Errorf("storage.TYPE 无效: %q（可选 local / s3）", fileCfg.StorageType)
	}

	cfg := &Config{
		WorkPath:          workPath,
		ConfigFile:        configFile,
		Port:              port,
		RootURL:           normalizeRootURL(fileCfg.RootURL),
		DataDir:           absData,
		JWTSecret:         jwtSecret,
		OAuthClientID:     fileCfg.OAuthClientID,
		OAuthClientSecret: fileCfg.OAuthClientSecret,
		OAuthRedirectURIs: splitCSV(fileCfg.OAuthRedirectURIs),
		GiteaBaseURL:      normalizeRootURL(fileCfg.GiteaBaseURL),
		GiteaToken:        fileCfg.GiteaToken,
		GiteaSyncEnabled:  fileCfg.GiteaSyncEnabled,
		StorageType:       storageType,
		S3: S3Config{
			Endpoint:       strings.TrimSpace(fileCfg.S3Endpoint),
			Region:         strings.TrimSpace(fileCfg.S3Region),
			Bucket:         strings.TrimSpace(fileCfg.S3Bucket),
			AccessKey:      strings.TrimSpace(fileCfg.S3AccessKey),
			SecretKey:      strings.TrimSpace(fileCfg.S3SecretKey),
			PublicBaseURL:  normalizeRootURL(fileCfg.S3PublicBaseURL),
			Prefix:         normalizeStoragePrefix(fileCfg.S3Prefix),
			ForcePathStyle: fileCfg.S3ForcePathStyle,
		},
		LogFile:       filepath.Join(absData, "jiang13.log"),
		ServiceAction: action,
	}

	// [storage] 仅作首次种子；运行时以管理后台为准，此处不强制校验 S3 完整性

	needDirs := action == "" || action == "install"
	if needDirs {
		// 首次启动自动生成 app.ini，便于像 Gitea 一样改文件而不记一长串参数
		if !configExists {
			dataRel := resolveDataRelForINI(workPath, absData)
			if err := writeAppINI(configFile, fileSettings{
				Port:              port,
				DataRel:           dataRel,
				StorageType:       StorageTypeLocal,
				S3ForcePathStyle:  true,
				S3Region:          "us-east-1",
			}); err != nil {
				return nil, fmt.Errorf("生成默认配置文件失败: %w", err)
			}
			fmt.Fprintf(os.Stderr, "已生成默认配置: %s\n", configFile)
		} else if action == "install" {
			// 安装服务前把当前生效配置写回，避免服务只读旧 app.ini
			dataRel := resolveDataRelForINI(workPath, absData)
			iniJWT := fileCfg.JWTSecret
			if strings.TrimSpace(*jwtFlag) != "" {
				iniJWT = jwtSecret
			}
			if err := writeAppINI(configFile, fileSettings{
				Port:              port,
				DataRel:           dataRel,
				JWTSecret:         iniJWT,
				RootURL:           fileCfg.RootURL,
				OAuthClientID:     fileCfg.OAuthClientID,
				OAuthClientSecret: fileCfg.OAuthClientSecret,
				OAuthRedirectURIs: fileCfg.OAuthRedirectURIs,
				GiteaBaseURL:      fileCfg.GiteaBaseURL,
				GiteaToken:        fileCfg.GiteaToken,
				GiteaSyncEnabled:  fileCfg.GiteaSyncEnabled,
				StorageType:       fileCfg.StorageType,
				S3Endpoint:        fileCfg.S3Endpoint,
				S3Region:          fileCfg.S3Region,
				S3Bucket:          fileCfg.S3Bucket,
				S3AccessKey:       fileCfg.S3AccessKey,
				S3SecretKey:       fileCfg.S3SecretKey,
				S3PublicBaseURL:   fileCfg.S3PublicBaseURL,
				S3Prefix:          fileCfg.S3Prefix,
				S3ForcePathStyle:  fileCfg.S3ForcePathStyle,
			}); err != nil {
				return nil, fmt.Errorf("更新配置文件失败: %w", err)
			}
		}

		if err := ensureDataDirs(absData); err != nil {
			return nil, err
		}
		if err := cfg.resolveJWT(); err != nil {
			return nil, err
		}
	}

	return cfg, nil
}

func resolveWorkPath(flagVal string) (string, error) {
	if strings.TrimSpace(flagVal) != "" {
		abs, err := filepath.Abs(flagVal)
		if err != nil {
			return "", fmt.Errorf("解析工作目录失败: %w", err)
		}
		return filepath.Clean(abs), nil
	}
	return defaultWorkPath()
}

func resolveConfigPath(workPath, flagVal string) (string, error) {
	if strings.TrimSpace(flagVal) != "" {
		return absPath(workPath, flagVal)
	}
	return filepath.Join(workPath, defaultConfName), nil
}

func ensureDataDirs(dataDir string) error {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return fmt.Errorf("创建数据目录失败: %w", err)
	}
	for _, sub := range []string{
		filepath.Join(dataDir, "uploads", "avatars"),
		filepath.Join(dataDir, "uploads", "posts"),
		filepath.Join(dataDir, "uploads", "site"),
	} {
		if err := os.MkdirAll(sub, 0755); err != nil {
			return fmt.Errorf("创建上传目录失败: %w", err)
		}
	}
	return nil
}

func (c *Config) resolveJWT() error {
	secretFile := filepath.Join(c.DataDir, ".jwt_secret")
	if c.JWTSecret != "" {
		_ = os.WriteFile(secretFile, []byte(c.JWTSecret), 0600)
		return nil
	}
	if data, err := os.ReadFile(secretFile); err == nil && len(data) > 0 {
		c.JWTSecret = string(data)
		return nil
	}
	c.JWTSecret = generateRandomSecret(32)
	if err := os.WriteFile(secretFile, []byte(c.JWTSecret), 0600); err != nil {
		return fmt.Errorf("写入 JWT 密钥失败: %w", err)
	}
	return nil
}

func validServiceAction(action string) bool {
	switch action {
	case "install", "uninstall", "start", "stop", "restart", "status":
		return true
	default:
		return false
	}
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

// SiteUploadDir 返回站点品牌资源（Logo / Favicon）目录
func (c *Config) SiteUploadDir() string {
	return filepath.Join(c.DataDir, "uploads", "site")
}

// FilterWordsPath 返回敏感词配置文件路径
func (c *Config) FilterWordsPath() string {
	return filepath.Join(c.DataDir, "filter_words.txt")
}

func normalizeRootURL(raw string) string {
	u := strings.TrimSpace(raw)
	u = strings.TrimRight(u, "/")
	return u
}

// normalizeStoragePrefix 规范化对象 key 前缀：去首尾空白与首斜杠，非空时保证尾斜杠
func normalizeStoragePrefix(raw string) string {
	p := strings.TrimSpace(raw)
	p = strings.TrimPrefix(p, "/")
	if p == "" {
		return ""
	}
	return strings.TrimSuffix(p, "/") + "/"
}

func (s S3Config) validate() error {
	if s.Endpoint == "" {
		return fmt.Errorf("storage.TYPE=s3 时必须配置 ENDPOINT")
	}
	if s.Bucket == "" {
		return fmt.Errorf("storage.TYPE=s3 时必须配置 BUCKET")
	}
	if s.AccessKey == "" || s.SecretKey == "" {
		return fmt.Errorf("storage.TYPE=s3 时必须配置 ACCESS_KEY 与 SECRET_KEY")
	}
	if s.PublicBaseURL == "" {
		return fmt.Errorf("storage.TYPE=s3 时必须配置 PUBLIC_BASE_URL（公开访问根地址）")
	}
	return nil
}

func splitCSV(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func generateRandomSecret(n int) string {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = chars[i%len(chars)]
	}
	return string(b)
}

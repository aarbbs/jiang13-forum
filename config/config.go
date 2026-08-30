package config

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// StorageTypeLocal / StorageTypeS3 上传存储后端（管理后台运行时配置）
const (
	StorageTypeLocal = "local"
	StorageTypeS3    = "s3"
)

// Config 应用全局配置：默认读工作目录下 app.ini，命令行可覆盖
type Config struct {
	// 工作目录（默认可执行文件所在目录）
	WorkPath string
	// 配置文件绝对路径
	ConfigFile string
	// 监听端口
	Port int
	// 数据目录：SQLite、上传、日志（绝对路径）
	DataDir string
	// JWT 签名密钥
	JWTSecret string
	// 日志文件路径
	LogFile string
	// 系统服务控制动作：install|uninstall|start|stop|restart|status，空表示正常运行
	ServiceAction string
	// 开发模式：后端代理前端请求到 Vite 开发服务器（非内嵌静态资源）
	DevMode bool
	// CommunityHub 维护者选项：开启后本站接收其它实例自愿上报（默认关闭）。
	// 官方站 bbs.iioio.com 会按域名自动识别为枢纽，无需开启；本项仅给非官网枢纽镜像。
	CommunityHub bool
}

// Parse 解析命令行、环境变量与 app.ini，并初始化数据目录
//
// 优先级（高 → 低）：命令行显式参数 > 环境变量 > app.ini > 内置默认值
func Parse() (*Config, error) {
	configFlag := flag.String("config", "", "配置文件路径（默认：工作目录/app.ini）")
	workFlag := flag.String("work-path", "", "工作目录（默认：可执行文件所在目录）")
	portFlag := flag.Int("port", 0, "HTTP 监听端口（覆盖配置文件；0 表示不覆盖）")
	dataFlag := flag.String("data", "", "数据存储目录（覆盖配置文件）")
	jwtFlag := flag.String("jwt-secret", "", "JWT 签名密钥（覆盖配置文件；留空则自动生成）")
	serviceFlag := flag.String("service", "", "系统服务控制：install|uninstall|start|stop|restart|status")
	devFlag := flag.Bool("dev", false, "开发模式：代理前端到 Vite 开发服务器（默认 http://localhost:5173）")
	flag.Parse()

	action := strings.ToLower(strings.TrimSpace(*serviceFlag))
	if action != "" && !validServiceAction(action) {
		return nil, fmt.Errorf("无效的 -service 动作 %q，可选：install|uninstall|start|stop|restart|status", *serviceFlag)
	}

	workPathInput := strings.TrimSpace(*workFlag)
	if workPathInput == "" {
		workPathInput = envOrDefault(envWorkPath)
	}
	workPath, err := resolveWorkPath(workPathInput)
	if err != nil {
		return nil, err
	}

	configInput := strings.TrimSpace(*configFlag)
	if configInput == "" {
		configInput = envOrDefault(envConfig)
	}
	configFile, err := resolveConfigPath(workPath, configInput)
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
	if p := envIntOrZero(envHTTPPort); p > 0 {
		port = p
	}
	if *portFlag > 0 {
		port = *portFlag
	}

	dataInput := fileCfg.DataRel
	if v := envOrDefault(envData); v != "" {
		dataInput = v
	}
	if strings.TrimSpace(*dataFlag) != "" {
		dataInput = *dataFlag
	}
	absData, err := absPath(workPath, dataInput)
	if err != nil {
		return nil, fmt.Errorf("解析数据目录失败: %w", err)
	}

	jwtSecret := fileCfg.JWTSecret
	if v := envOrDefault(envJWTSecret); v != "" {
		jwtSecret = v
	}
	if strings.TrimSpace(*jwtFlag) != "" {
		jwtSecret = strings.TrimSpace(*jwtFlag)
	}

	communityHub := fileCfg.CommunityHub
	if v := envBoolOrNil(envCommunityHub); v != nil {
		communityHub = *v
	}

	cfg := &Config{
		WorkPath:      workPath,
		ConfigFile:    configFile,
		Port:          port,
		DataDir:       absData,
		JWTSecret:     jwtSecret,
		LogFile:       filepath.Join(absData, "jiang13.log"),
		ServiceAction: action,
		DevMode:       *devFlag,
		CommunityHub:  communityHub,
	}

	needDirs := action == "" || action == "install"
	if needDirs {
		// 首次启动自动生成 app.ini，便于像 Gitea 一样改文件而不记一长串参数
		if !configExists {
			dataRel := resolveDataRelForINI(workPath, absData)
			if err := writeAppINI(configFile, fileSettings{
				Port:    port,
				DataRel: dataRel,
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
				Port:      port,
				DataRel:   dataRel,
				JWTSecret: iniJWT,
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
		filepath.Join(dataDir, "logs", "access"),
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

// DBPath 返回主库 SQLite 路径
func (c *Config) DBPath() string {
	return filepath.Join(c.DataDir, "jiang13.db")
}

// MonitorDBPath 返回监控独立库路径（page_views）
func (c *Config) MonitorDBPath() string {
	return filepath.Join(c.DataDir, "monitor.db")
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

func generateRandomSecret(n int) string {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = chars[i%len(chars)]
	}
	return string(b)
}

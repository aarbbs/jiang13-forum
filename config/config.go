package config

import (
	"crypto/rand"
	"encoding/base64"
	"flag"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	defaultPort    = 3000
	defaultDataRel = "data"

	DBTypeSQLite   = "sqlite"
	DBTypePostgres = "postgres"
	DBTypeMySQL    = "mysql"

	// StorageTypeLocal / StorageTypeS3 上传存储后端（管理后台运行时配置）
	StorageTypeLocal = "local"
	StorageTypeS3    = "s3"
)

// DatabaseConfig 数据库引导配置（需重启）
type DatabaseConfig struct {
	Type     string // sqlite | postgres | mysql
	DSN      string // 非空则优先
	Host     string
	User     string
	Password string
	Name     string
	SSLMode  string // postgres
	// SQLite 文件路径（Type=sqlite 时由 DataDir 推导或 DSN）
	SQLitePath string

	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetimeSec int
}

// Config 进程引导配置：仅 CLI / 环境变量（无 INI）
type Config struct {
	WorkPath      string
	HTTPAddr      string // 空表示 0.0.0.0
	Port          int
	DataDir       string
	JWTSecret     string
	LogFile       string
	ServiceAction string
	DevMode       bool
	DB            DatabaseConfig
}

// Parse 解析命令行与环境变量并准备数据目录
// 优先级：命令行显式参数 > 环境变量 > 内置默认
func Parse() (*Config, error) {
	workFlag := flag.String("work-path", "", "工作目录（默认：可执行文件所在目录）")
	portFlag := flag.Int("port", 0, "HTTP 监听端口（0 表示用环境变量或默认 3000）")
	addrFlag := flag.String("http-addr", "", "HTTP 监听地址（默认空=全接口）")
	dataFlag := flag.String("data", "", "数据存储目录")
	dbTypeFlag := flag.String("db-type", "", "数据库类型：sqlite|postgres|mysql")
	dbDSNFlag := flag.String("db-dsn", "", "数据库 DSN（优先于拆分参数）")
	dbHostFlag := flag.String("db-host", "", "数据库主机")
	dbUserFlag := flag.String("db-user", "", "数据库用户")
	dbPassFlag := flag.String("db-pass", "", "数据库密码")
	dbNameFlag := flag.String("db-name", "", "数据库名")
	dbSSLFlag := flag.String("db-sslmode", "", "PostgreSQL sslmode")
	serviceFlag := flag.String("service", "", "系统服务控制：install|uninstall|start|stop|restart|status")
	devFlag := flag.Bool("dev", false, "开发模式")
	_ = flag.String("config", "", "已废弃：不再使用 ini 配置文件")
	_ = flag.String("jwt-secret", "", "已废弃：JWT 仅使用 data/.jwt_secret")
	flag.Parse()

	action := strings.ToLower(strings.TrimSpace(*serviceFlag))
	if action != "" && !validServiceAction(action) {
		return nil, fmt.Errorf("无效的 -service 动作 %q，可选：install|uninstall|start|stop|restart|status", *serviceFlag)
	}

	workPathInput := firstNonEmpty(*workFlag, envOrDefault(envWorkPath))
	workPath, err := resolveWorkPath(workPathInput)
	if err != nil {
		return nil, err
	}

	port := defaultPort
	if p := envIntOrZero(envHTTPPort); p > 0 {
		port = p
	}
	if *portFlag > 0 {
		port = *portFlag
	}

	httpAddr := firstNonEmpty(*addrFlag, envOrDefault(envHTTPAddr))

	dataInput := firstNonEmpty(*dataFlag, envOrDefault(envData), defaultDataRel)
	absData, err := absPath(workPath, dataInput)
	if err != nil {
		return nil, fmt.Errorf("解析数据目录失败: %w", err)
	}

	dbCfg, err := buildDatabaseConfig(absData, dbFlags{
		Type: *dbTypeFlag, DSN: *dbDSNFlag, Host: *dbHostFlag,
		User: *dbUserFlag, Pass: *dbPassFlag, Name: *dbNameFlag, SSL: *dbSSLFlag,
	})
	if err != nil {
		return nil, err
	}

	cfg := &Config{
		WorkPath:      workPath,
		HTTPAddr:      httpAddr,
		Port:          port,
		DataDir:       absData,
		LogFile:       filepath.Join(absData, "jiang13.log"),
		ServiceAction: action,
		DevMode:       *devFlag,
		DB:            dbCfg,
	}

	needDirs := action == "" || action == "install"
	if needDirs {
		if err := ensureDataDirs(absData); err != nil {
			return nil, err
		}
		if err := cfg.resolveJWT(); err != nil {
			return nil, err
		}
	}

	return cfg, nil
}

type dbFlags struct {
	Type, DSN, Host, User, Pass, Name, SSL string
}

func buildDatabaseConfig(dataDir string, f dbFlags) (DatabaseConfig, error) {
	typ := strings.ToLower(firstNonEmpty(f.Type, envOrDefault(envDBType), DBTypeSQLite))
	switch typ {
	case "sqlite", "sqlite3":
		typ = DBTypeSQLite
	case "postgres", "postgresql", "pg":
		typ = DBTypePostgres
	case "mysql", "mariadb":
		typ = DBTypeMySQL
	default:
		return DatabaseConfig{}, fmt.Errorf("不支持的数据库类型 %q，可选：sqlite|postgres|mysql", typ)
	}

	out := DatabaseConfig{
		Type:                typ,
		DSN:                 firstNonEmpty(f.DSN, envOrDefault(envDBDSN)),
		Host:                firstNonEmpty(f.Host, envOrDefault(envDBHost)),
		User:                firstNonEmpty(f.User, envOrDefault(envDBUser)),
		Password:            firstNonEmpty(f.Pass, envOrDefault(envDBPass)),
		Name:                firstNonEmpty(f.Name, envOrDefault(envDBName)),
		SSLMode:             firstNonEmpty(f.SSL, envOrDefault(envDBSSLMode), "disable"),
		MaxOpenConns:        envIntDefault(envDBMaxOpen, 0),
		MaxIdleConns:        envIntDefault(envDBMaxIdle, 0),
		ConnMaxLifetimeSec:    envIntDefault(envDBConnLife, 0),
	}

	if typ == DBTypeSQLite {
		if out.DSN != "" {
			out.SQLitePath = out.DSN
		} else {
			out.SQLitePath = filepath.Join(dataDir, "jiang13.db")
			out.DSN = out.SQLitePath
		}
		if out.MaxOpenConns == 0 {
			out.MaxOpenConns = 1
		}
		if out.MaxIdleConns == 0 {
			out.MaxIdleConns = 1
		}
		return out, nil
	}

	if out.DSN == "" {
		dsn, err := buildDSN(out)
		if err != nil {
			return DatabaseConfig{}, err
		}
		out.DSN = dsn
	}
	if out.MaxOpenConns == 0 {
		out.MaxOpenConns = 25
	}
	if out.MaxIdleConns == 0 {
		out.MaxIdleConns = 5
	}
	if out.ConnMaxLifetimeSec == 0 {
		out.ConnMaxLifetimeSec = 300
	}
	return out, nil
}

func buildDSN(c DatabaseConfig) (string, error) {
	if c.Host == "" || c.User == "" || c.Name == "" {
		return "", fmt.Errorf("%s 需要 JIANG13_DB_DSN，或 JIANG13_DB_HOST/USER/NAME（及可选 PASS）", c.Type)
	}
	switch c.Type {
	case DBTypePostgres:
		u := url.URL{
			Scheme: "postgres",
			User:   url.UserPassword(c.User, c.Password),
			Host:   c.Host,
			Path:   "/" + c.Name,
		}
		q := url.Values{}
		q.Set("sslmode", c.SSLMode)
		u.RawQuery = q.Encode()
		return u.String(), nil
	case DBTypeMySQL:
		// 特殊字符密码请直接用 JIANG13_DB_DSN；此处为拆分参数简易拼接
		return fmt.Sprintf("%s:%s@tcp(%s)/%s?parseTime=true&loc=Local&charset=utf8mb4",
			c.User, c.Password, c.Host, c.Name), nil
	default:
		return "", fmt.Errorf("无法为 %s 拼接 DSN", c.Type)
	}
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
	if data, err := os.ReadFile(secretFile); err == nil && len(bytesTrimSpace(data)) > 0 {
		c.JWTSecret = string(bytesTrimSpace(data))
		return nil
	}
	sec, err := generateRandomSecret(32)
	if err != nil {
		return err
	}
	c.JWTSecret = sec
	if err := os.WriteFile(secretFile, []byte(c.JWTSecret), 0600); err != nil {
		return fmt.Errorf("写入 JWT 密钥失败: %w", err)
	}
	return nil
}

func bytesTrimSpace(b []byte) []byte {
	return []byte(strings.TrimSpace(string(b)))
}

func validServiceAction(action string) bool {
	switch action {
	case "install", "uninstall", "start", "stop", "restart", "status":
		return true
	default:
		return false
	}
}

// ListenAddr 返回 host:port
func (c *Config) ListenAddr() string {
	if c.HTTPAddr == "" {
		return fmt.Sprintf(":%d", c.Port)
	}
	return fmt.Sprintf("%s:%d", c.HTTPAddr, c.Port)
}

// SQLitePath 兼容旧调用：仅 sqlite 有意义
func (c *Config) DBPath() string {
	if c.DB.Type == DBTypeSQLite {
		return c.DB.SQLitePath
	}
	return c.DB.DSN
}

func (c *Config) AvatarUploadDir() string {
	return filepath.Join(c.DataDir, "uploads", "avatars")
}
func (c *Config) PostImageUploadDir() string {
	return filepath.Join(c.DataDir, "uploads", "posts")
}
func (c *Config) SiteUploadDir() string {
	return filepath.Join(c.DataDir, "uploads", "site")
}
func (c *Config) FilterWordsPath() string {
	return filepath.Join(c.DataDir, "filter_words.txt")
}

func generateRandomSecret(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("生成密钥失败: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func envIntDefault(key string, def int) int {
	v := envOrDefault(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		return def
	}
	return n
}

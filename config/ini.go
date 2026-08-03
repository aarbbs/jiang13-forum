package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"gopkg.in/ini.v1"
)

const (
	defaultPort     = 3000
	defaultDataRel  = "data"
	defaultConfName = "app.ini"
)

// fileSettings 从 app.ini 读出的原始值（尚未解析为绝对路径）
type fileSettings struct {
	Port              int
	DataRel           string
	JWTSecret         string
	RootURL           string
	OAuthClientID     string
	OAuthClientSecret string
	OAuthRedirectURIs string
	GiteaBaseURL      string
	GiteaToken        string
	GiteaSyncEnabled  bool
	StorageType       string
	S3Endpoint        string
	S3Region          string
	S3Bucket          string
	S3AccessKey       string
	S3SecretKey       string
	S3PublicBaseURL   string
	S3Prefix          string
	S3ForcePathStyle  bool
}

func defaultFileSettings() fileSettings {
	return fileSettings{
		Port:             defaultPort,
		DataRel:          defaultDataRel,
		StorageType:      StorageTypeLocal,
		S3Region:         "us-east-1",
		S3ForcePathStyle: true,
	}
}

func loadAppINI(path string) (fileSettings, error) {
	out := defaultFileSettings()
	cfg, err := ini.LoadSources(ini.LoadOptions{
		IgnoreInlineComment: true,
	}, path)
	if err != nil {
		return out, fmt.Errorf("读取配置文件失败: %w", err)
	}

	if sec, err := cfg.GetSection("server"); err == nil {
		if k := sec.Key("HTTP_PORT"); k.String() != "" {
			p, err := k.Int()
			if err != nil {
				return out, fmt.Errorf("server.HTTP_PORT 无效: %w", err)
			}
			if p <= 0 || p > 65535 {
				return out, fmt.Errorf("server.HTTP_PORT 超出范围: %d", p)
			}
			out.Port = p
		}
		out.RootURL = strings.TrimSpace(sec.Key("ROOT_URL").String())
	}

	if sec, err := cfg.GetSection("paths"); err == nil {
		if v := strings.TrimSpace(sec.Key("DATA").String()); v != "" {
			out.DataRel = v
		}
	}

	if sec, err := cfg.GetSection("security"); err == nil {
		out.JWTSecret = strings.TrimSpace(sec.Key("JWT_SECRET").String())
	}

	if sec, err := cfg.GetSection("oauth"); err == nil {
		out.OAuthClientID = strings.TrimSpace(sec.Key("CLIENT_ID").String())
		out.OAuthClientSecret = strings.TrimSpace(sec.Key("CLIENT_SECRET").String())
		out.OAuthRedirectURIs = strings.TrimSpace(sec.Key("REDIRECT_URIS").String())
	}

	if sec, err := cfg.GetSection("gitea"); err == nil {
		out.GiteaBaseURL = strings.TrimSpace(sec.Key("BASE_URL").String())
		out.GiteaToken = strings.TrimSpace(sec.Key("TOKEN").String())
		out.GiteaSyncEnabled = sec.Key("SYNC_ENABLED").MustBool(false)
	}

	if sec, err := cfg.GetSection("storage"); err == nil {
		if v := strings.TrimSpace(sec.Key("TYPE").String()); v != "" {
			out.StorageType = v
		}
		out.S3Endpoint = strings.TrimSpace(sec.Key("ENDPOINT").String())
		if v := strings.TrimSpace(sec.Key("REGION").String()); v != "" {
			out.S3Region = v
		}
		out.S3Bucket = strings.TrimSpace(sec.Key("BUCKET").String())
		out.S3AccessKey = strings.TrimSpace(sec.Key("ACCESS_KEY").String())
		out.S3SecretKey = strings.TrimSpace(sec.Key("SECRET_KEY").String())
		out.S3PublicBaseURL = strings.TrimSpace(sec.Key("PUBLIC_BASE_URL").String())
		out.S3Prefix = strings.TrimSpace(sec.Key("PREFIX").String())
		if sec.HasKey("FORCE_PATH_STYLE") {
			out.S3ForcePathStyle = sec.Key("FORCE_PATH_STYLE").MustBool(true)
		}
	}

	return out, nil
}

// writeAppINI 写入/覆盖 app.ini（安装服务或首次生成时使用）
func writeAppINI(path string, s fileSettings) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}

	storageType := strings.TrimSpace(s.StorageType)
	if storageType == "" {
		storageType = StorageTypeLocal
	}
	region := strings.TrimSpace(s.S3Region)
	if region == "" {
		region = "us-east-1"
	}

	var b strings.Builder
	b.WriteString("; 姜十三论坛 Jiang13 Forum — 配置文件（风格类似 Gitea app.ini）\n")
	b.WriteString("; 修改后重启进程/服务生效。命令行参数优先级高于本文件。\n")
	b.WriteString(";\n")
	b.WriteString("; 默认位置：程序工作目录下的 app.ini\n")
	b.WriteString("; 可用 --config / --work-path 覆盖。\n")
	b.WriteString("\n")
	b.WriteString("[server]\n")
	b.WriteString("HTTP_PORT = ")
	b.WriteString(strconv.Itoa(s.Port))
	b.WriteString("\n")
	b.WriteString("; 对外公网根地址（无尾斜杠），OIDC Issuer / Discovery 依赖此项\n")
	b.WriteString("; 例：https://bbs.iioio.com\n")
	b.WriteString("ROOT_URL = ")
	b.WriteString(s.RootURL)
	b.WriteString("\n\n")
	b.WriteString("[paths]\n")
	b.WriteString("; 相对路径相对于工作目录（默认可执行文件所在目录）\n")
	b.WriteString("DATA = ")
	b.WriteString(s.DataRel)
	b.WriteString("\n\n")
	b.WriteString("[security]\n")
	b.WriteString("; 留空则自动生成并持久化到 data/.jwt_secret（勿把生产密钥提交到仓库）\n")
	b.WriteString("JWT_SECRET = ")
	b.WriteString(s.JWTSecret)
	b.WriteString("\n\n")
	b.WriteString("[oauth]\n")
	b.WriteString("; 作为 OIDC Provider 时，给 Gitea 等客户端使用的凭据（P0 写死在配置）\n")
	b.WriteString("; Gitea 认证源名称需与回调路径一致，例如名称 jiang13 对应：\n")
	b.WriteString("; https://git.iioio.com/user/oauth2/jiang13/callback\n")
	b.WriteString("CLIENT_ID = ")
	b.WriteString(s.OAuthClientID)
	b.WriteString("\n")
	b.WriteString("CLIENT_SECRET = ")
	b.WriteString(s.OAuthClientSecret)
	b.WriteString("\n")
	b.WriteString("; 多个回调用逗号分隔\n")
	b.WriteString("REDIRECT_URIS = ")
	b.WriteString(s.OAuthRedirectURIs)
	b.WriteString("\n\n")
	b.WriteString("[gitea]\n")
	b.WriteString("; 可选：同步会员公开仓库到侧栏 /projects\n")
	b.WriteString("BASE_URL = ")
	b.WriteString(s.GiteaBaseURL)
	b.WriteString("\n")
	b.WriteString("TOKEN = ")
	b.WriteString(s.GiteaToken)
	b.WriteString("\n")
	b.WriteString("SYNC_ENABLED = ")
	b.WriteString(strconv.FormatBool(s.GiteaSyncEnabled))
	b.WriteString("\n\n")
	b.WriteString("[storage]\n")
	b.WriteString("; 可选种子：日常请在管理后台「系统设置 → 对象存储」配置（保存即生效）\n")
	b.WriteString("TYPE = ")
	b.WriteString(storageType)
	b.WriteString("\n")
	b.WriteString("; 以下仅作首次种子（MinIO / 七牛 / 又拍 / 阿里云 OSS 等）\n")
	b.WriteString("; ENDPOINT = https://s3.example.com\n")
	b.WriteString("ENDPOINT = ")
	b.WriteString(s.S3Endpoint)
	b.WriteString("\n")
	b.WriteString("REGION = ")
	b.WriteString(region)
	b.WriteString("\n")
	b.WriteString("BUCKET = ")
	b.WriteString(s.S3Bucket)
	b.WriteString("\n")
	b.WriteString("ACCESS_KEY = ")
	b.WriteString(s.S3AccessKey)
	b.WriteString("\n")
	b.WriteString("SECRET_KEY = ")
	b.WriteString(s.S3SecretKey)
	b.WriteString("\n")
	b.WriteString("; 公开访问根 URL（无尾斜杠）；上传后返回 PUBLIC_BASE_URL/avatars/xxx.jpg\n")
	b.WriteString("; PUBLIC_BASE_URL = https://cdn.example.com/forum\n")
	b.WriteString("PUBLIC_BASE_URL = ")
	b.WriteString(s.S3PublicBaseURL)
	b.WriteString("\n")
	b.WriteString("; 对象 key 前缀（可选），如 forum/\n")
	b.WriteString("PREFIX = ")
	b.WriteString(s.S3Prefix)
	b.WriteString("\n")
	b.WriteString("; MinIO 等多为 true；AWS S3 官方多为 false\n")
	b.WriteString("FORCE_PATH_STYLE = ")
	b.WriteString(strconv.FormatBool(s.S3ForcePathStyle))
	b.WriteString("\n")

	return os.WriteFile(path, []byte(b.String()), 0644)
}

// resolveDataRelForINI 把绝对数据目录尽量写成相对工作目录的路径，便于 app.ini 可读
func resolveDataRelForINI(workPath, absData string) string {
	rel, err := filepath.Rel(workPath, absData)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return absData
	}
	return filepath.ToSlash(rel)
}

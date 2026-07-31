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
}

func defaultFileSettings() fileSettings {
	return fileSettings{
		Port:    defaultPort,
		DataRel: defaultDataRel,
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

	return out, nil
}

// writeAppINI 写入/覆盖 app.ini（安装服务或首次生成时使用）
func writeAppINI(path string, s fileSettings) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
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

package config

import (
	"os"
	"strconv"
	"strings"
)

// 容器 / 编排常用环境变量（优先级：命令行 > 环境变量 > app.ini > 内置默认）
const (
	envWorkPath     = "JIANG13_WORK_PATH"
	envConfig       = "JIANG13_CONFIG"
	envHTTPPort     = "JIANG13_HTTP_PORT"
	envData         = "JIANG13_DATA"
	envJWTSecret    = "JIANG13_JWT_SECRET"
	envCommunityHub = "JIANG13_COMMUNITY_HUB"
)

func envOrDefault(key string) string {
	return strings.TrimSpace(os.Getenv(key))
}

func envIntOrZero(key string) int {
	v := envOrDefault(key)
	if v == "" {
		return 0
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 || n > 65535 {
		return 0
	}
	return n
}

// envBoolOrNil 解析布尔环境变量；未设置返回 nil
func envBoolOrNil(key string) *bool {
	v := strings.ToLower(envOrDefault(key))
	if v == "" {
		return nil
	}
	switch v {
	case "1", "true", "yes", "on":
		t := true
		return &t
	case "0", "false", "no", "off":
		f := false
		return &f
	default:
		return nil
	}
}

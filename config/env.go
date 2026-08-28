package config

import (
	"os"
	"strconv"
	"strings"
)

// 引导环境变量（无 INI）
const (
	envWorkPath  = "JIANG13_WORK_PATH"
	envHTTPPort  = "JIANG13_HTTP_PORT"
	envHTTPAddr  = "JIANG13_HTTP_ADDR"
	envData      = "JIANG13_DATA"
	envDBType    = "JIANG13_DB_TYPE"
	envDBDSN     = "JIANG13_DB_DSN"
	envDBHost    = "JIANG13_DB_HOST"
	envDBUser    = "JIANG13_DB_USER"
	envDBPass    = "JIANG13_DB_PASS"
	envDBName    = "JIANG13_DB_NAME"
	envDBSSLMode = "JIANG13_DB_SSLMODE"
	envDBMaxOpen = "JIANG13_DB_MAX_OPEN"
	envDBMaxIdle = "JIANG13_DB_MAX_IDLE"
	envDBConnLife = "JIANG13_DB_CONN_MAX_LIFETIME_SEC"
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

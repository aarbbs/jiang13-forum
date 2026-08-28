package main

import (
	"fmt"
	"log"
	"os"

	kardsvc "github.com/kardianos/service"

	"git.iioio.com/freefire/jiang13-forum/config"
)

// version 由构建脚本通过 -ldflags "-X main.version=..." 注入
var version = "dev"

func main() {
	cfg, err := config.Parse()
	if err != nil {
		log.Fatalf("配置解析失败: %v", err)
	}

	svcCfg, err := buildServiceConfig(cfg)
	if err != nil {
		log.Fatalf("构建服务配置失败: %v", err)
	}

	prg := &program{cfg: cfg}
	svc, err := kardsvc.New(prg, svcCfg)
	if err != nil {
		log.Fatalf("创建系统服务失败: %v", err)
	}

	if cfg.ServiceAction != "" {
		if err := runServiceControl(svc, cfg.ServiceAction); err != nil {
			fmt.Fprintf(os.Stderr, "服务操作失败 (%s): %v\n", cfg.ServiceAction, err)
			os.Exit(1)
		}
		return
	}

	// 交互终端或由服务管理器拉起时均走 Run：
	// Windows Service / systemd 负责生命周期；前台运行时仍响应 Ctrl+C / SIGTERM
	if err := svc.Run(); err != nil {
		log.Fatalf("运行失败: %v", err)
	}
}

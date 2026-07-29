package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/kardianos/service"

	"git.iioio.com/freefire/jiang13-forum/config"
	"git.iioio.com/freefire/jiang13-forum/model"
	"git.iioio.com/freefire/jiang13-forum/router"
)

const (
	svcName        = "jiang13"
	svcDisplayName = "姜十三论坛"
	svcDescription = "姜十三论坛 Jiang13 Forum — 轻量单二进制论坛服务"
)

// program 实现 kardianos/service.Interface，兼容 Windows Service 与 Linux systemd
type program struct {
	cfg    *config.Config
	server *http.Server
}

func (p *program) Start(s service.Service) error {
	if err := p.setup(); err != nil {
		return err
	}
	go func() {
		if err := p.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("HTTP 服务异常: %v", err)
		}
	}()
	return nil
}

func (p *program) Stop(s service.Service) error {
	log.Println("收到关机信号，正在优雅关闭...")
	if p.server == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := p.server.Shutdown(ctx); err != nil {
		log.Printf("HTTP 服务关闭异常: %v", err)
		return err
	}
	log.Println("姜十三论坛已安全退出")
	return nil
}

func (p *program) setup() error {
	cfg := p.cfg

	logFile, err := os.OpenFile(cfg.LogFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return fmt.Errorf("打开日志文件失败: %w", err)
	}
	// 服务模式下 stdout 可能不可用，仅写文件；前台运行则双写
	if service.Interactive() {
		log.SetOutput(io.MultiWriter(os.Stdout, logFile))
	} else {
		log.SetOutput(logFile)
	}
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	log.Println("========================================")
	log.Println("  姜十三论坛 Jiang13 Forum 启动中...")
	log.Println("========================================")

	if err := model.InitDB(cfg.DBPath()); err != nil {
		return fmt.Errorf("数据库初始化失败: %w", err)
	}

	engine, err := router.Setup(cfg)
	if err != nil {
		return fmt.Errorf("路由初始化失败: %w", err)
	}

	addr := fmt.Sprintf(":%d", cfg.Port)
	p.server = &http.Server{
		Addr:    addr,
		Handler: engine,
	}

	log.Printf("姜十三论坛已启动: http://localhost%s", addr)
	log.Printf("后台管理地址: http://localhost%s/admin/dashboard", addr)
	log.Printf("工作目录: %s", cfg.WorkPath)
	log.Printf("配置文件: %s", cfg.ConfigFile)
	log.Printf("数据目录: %s", cfg.DataDir)
	return nil
}

func buildServiceConfig(cfg *config.Config) (*service.Config, error) {
	// 服务只绑定工作目录与配置文件；端口/数据目录改 app.ini 后重启即可，无需重装服务
	return &service.Config{
		Name:             svcName,
		DisplayName:      svcDisplayName,
		Description:      svcDescription,
		WorkingDirectory: cfg.WorkPath,
		Arguments: []string{
			"--work-path", cfg.WorkPath,
			"--config", cfg.ConfigFile,
		},
		Option: service.KeyValue{
			// systemd：异常退出后自动拉起
			"Restart": "always",
			// Windows：崩溃后重启
			"OnFailure": "restart",
		},
	}, nil
}

func runServiceControl(s service.Service, action string) error {
	if action == "status" {
		st, err := s.Status()
		if err != nil {
			return err
		}
		switch st {
		case service.StatusRunning:
			fmt.Println("服务状态: 运行中 (running)")
		case service.StatusStopped:
			fmt.Println("服务状态: 已停止 (stopped)")
		default:
			fmt.Println("服务状态: 未知 (unknown)")
		}
		return nil
	}

	if err := service.Control(s, action); err != nil {
		return err
	}

	switch action {
	case "install":
		fmt.Println("服务已安装。可用以下命令启动：")
		fmt.Printf("  %s --service start\n", os.Args[0])
		fmt.Println("或使用系统工具：")
		fmt.Println("  Linux:   sudo systemctl start jiang13 && sudo systemctl enable jiang13")
		fmt.Println("  Windows: Start-Service jiang13")
	case "uninstall":
		fmt.Println("服务已卸载")
	case "start":
		fmt.Println("服务已启动")
	case "stop":
		fmt.Println("服务已停止")
	case "restart":
		fmt.Println("服务已重启")
	}
	return nil
}

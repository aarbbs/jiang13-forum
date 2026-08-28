package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	kardsvc "github.com/kardianos/service"

	"git.iioio.com/freefire/jiang13-forum/config"
	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/routers"
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

func (p *program) Start(s kardsvc.Service) error {
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

func (p *program) Stop(s kardsvc.Service) error {
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
	if kardsvc.Interactive() {
		log.SetOutput(io.MultiWriter(os.Stdout, logFile))
	} else {
		log.SetOutput(logFile)
	}
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	log.Println("========================================")
	log.Println("  姜十三论坛 Jiang13 Forum 启动中...")
	log.Printf("  版本: %s", version)
	log.Println("========================================")

	if err := models.InitDB(models.DatabaseConfig{
		Type:             cfg.DB.Type,
		DSN:              cfg.DB.DSN,
		SQLitePath:       cfg.DB.SQLitePath,
		MaxOpenConns:     cfg.DB.MaxOpenConns,
		MaxIdleConns:     cfg.DB.MaxIdleConns,
		ConnMaxLifetimeSec: cfg.DB.ConnMaxLifetimeSec,
	}); err != nil {
		return fmt.Errorf("数据库初始化失败: %w", err)
	}

	engine, err := routers.Setup(cfg)
	if err != nil {
		return fmt.Errorf("路由初始化失败: %w", err)
	}

	addr := cfg.ListenAddr()
	p.server = &http.Server{
		Addr:    addr,
		Handler: engine,
	}

	log.Printf("姜十三论坛已启动: http://localhost:%d", cfg.Port)
	log.Printf("后台管理地址: http://localhost:%d/admin/dashboard", cfg.Port)
	log.Printf("工作目录: %s", cfg.WorkPath)
	log.Printf("数据目录: %s", cfg.DataDir)
	log.Printf("数据库: %s", cfg.DB.Type)
	return nil
}

func buildServiceConfig(cfg *config.Config) (*kardsvc.Config, error) {
	// 服务绑定工作目录与数据目录；改端口 / DB_* 需重启进程（可用 Env 或重装服务参数）
	args := []string{
		"--work-path", cfg.WorkPath,
		"--data", cfg.DataDir,
		"--port", fmt.Sprintf("%d", cfg.Port),
		"--db-type", cfg.DB.Type,
	}
	if cfg.DB.Type == config.DBTypeSQLite {
		args = append(args, "--db-dsn", cfg.DB.SQLitePath)
	} else if cfg.DB.DSN != "" {
		args = append(args, "--db-dsn", cfg.DB.DSN)
	}
	return &kardsvc.Config{
		Name:             svcName,
		DisplayName:      svcDisplayName,
		Description:      svcDescription,
		WorkingDirectory: cfg.WorkPath,
		Arguments:        args,
		Option: kardsvc.KeyValue{
			// systemd：异常退出后自动拉起
			"Restart": "always",
			// Windows：崩溃后重启
			"OnFailure": "restart",
		},
	}, nil
}

func runServiceControl(s kardsvc.Service, action string) error {
	if action == "status" {
		st, err := s.Status()
		if err != nil {
			return err
		}
		switch st {
		case kardsvc.StatusRunning:
			fmt.Println("服务状态: 运行中 (running)")
		case kardsvc.StatusStopped:
			fmt.Println("服务状态: 已停止 (stopped)")
		default:
			fmt.Println("服务状态: 未知 (unknown)")
		}
		return nil
	}

	if err := kardsvc.Control(s, action); err != nil {
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

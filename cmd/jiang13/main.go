package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jiang13/forum/config"
	"github.com/jiang13/forum/model"
	"github.com/jiang13/forum/router"
)

func main() {
	cfg, err := config.Parse()
	if err != nil {
		log.Fatalf("配置解析失败: %v", err)
	}

	// 日志同时输出到控制台和文件
	logFile, err := os.OpenFile(cfg.LogFile, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		log.Fatalf("打开日志文件失败: %v", err)
	}
	defer logFile.Close()
	log.SetOutput(io.MultiWriter(os.Stdout, logFile))
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	log.Println("========================================")
	log.Println("  姜十三论坛 Jiang13 Forum 启动中...")
	log.Println("========================================")

	// 初始化数据库
	if err := model.InitDB(cfg.DBPath()); err != nil {
		log.Fatalf("数据库初始化失败: %v", err)
	}

	// 设置路由
	engine, err := router.Setup(cfg)
	if err != nil {
		log.Fatalf("路由初始化失败: %v", err)
	}

	addr := fmt.Sprintf(":%d", cfg.Port)
	srv := &http.Server{
		Addr:    addr,
		Handler: engine,
	}

	// 优雅关机
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("收到关机信号，正在优雅关闭...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("HTTP 服务关闭异常: %v", err)
		}
	}()

	log.Printf("姜十三论坛已启动: http://localhost%s", addr)
	log.Printf("后台管理地址: http://localhost%s/admin/dashboard", addr)
	log.Printf("数据目录: %s", cfg.DataDir)

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("HTTP 服务异常: %v", err)
	}
	log.Println("姜十三论坛已安全退出")
}

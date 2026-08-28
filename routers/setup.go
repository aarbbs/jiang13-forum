package routers

import (
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"

	"git.iioio.com/freefire/jiang13-forum/config"
	"git.iioio.com/freefire/jiang13-forum/modules/auth"
	webpublic "git.iioio.com/freefire/jiang13-forum/public"
	"git.iioio.com/freefire/jiang13-forum/routers/api"
	"git.iioio.com/freefire/jiang13-forum/routers/install"
	webpages "git.iioio.com/freefire/jiang13-forum/routers/web"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

func Setup(cfg *config.Config) (*gin.Engine, error) {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(gin.Logger())

	if err := services.EnsureInstallLockFromExistingData(cfg.DataDir); err != nil {
		fmt.Fprintf(os.Stderr, "警告: 安装锁检查失败: %v\n", err)
	}

	if sub, err := fs.Sub(webpublic.Assets, "assets"); err == nil {
		ssrFiles := http.StripPrefix("/ssr-assets", http.FileServer(http.FS(sub)))
		r.GET("/ssr-assets/*filepath", func(c *gin.Context) {
			c.Header("Cache-Control", "public, max-age=86400")
			ssrFiles.ServeHTTP(c.Writer, c.Request)
		})
	}

	r.Use(install.Guard(cfg.DataDir))

	filter := services.NewSensitiveFilter()
	settingsSvc := services.NewForumSettingsService()
	services.EnsureFilterWordsInSettings(settingsSvc, cfg.FilterWordsPath(), filter)

	authSvc := services.NewAuthService(cfg.JWTSecret, filter, settingsSvc)
	userSvc := services.NewUserService(filter, settingsSvc)
	boardSvc := services.NewBoardService()
	boardSvc.EnsureDefaultBoard()
	postSvc := services.NewPostService(filter, settingsSvc)
	commentSvc := services.NewCommentService(filter, settingsSvc)
	messageSvc := services.NewMessageService(filter, settingsSvc)
	reportSvc := services.NewReportService(filter, settingsSvc, messageSvc, postSvc, commentSvc)
	backupSvc := services.NewBackupService(cfg.DBPath(), cfg.DataDir)
	limiter := services.NewRateLimiter(settingsSvc)
	captchaSvc := services.NewCaptchaService()
	mailSvc := services.NewMailService(settingsSvc)
	emailCodeSvc := services.NewEmailCodeService(mailSvc)
	notifySvc := services.NewNotifyService(messageSvc, mailSvc, settingsSvc)
	friendLinkApplySvc := services.NewFriendLinkApplyService(settingsSvc, messageSvc)
	oidcSvc, err := services.NewOIDCService(cfg, settingsSvc)
	if err != nil {
		return nil, err
	}
	// Gitea 仓库同步后置：本阶段不启动后台同步，亦不挂管理入口
	giteaSvc := services.NewGiteaService(settingsSvc)

	uploadStore := services.NewUploadStore(cfg.DataDir, settingsSvc)
	if err := uploadStore.ReloadFromSettings(settingsSvc); err != nil {
		fmt.Fprintf(os.Stderr, "警告: 对象存储初始化失败，暂用本地磁盘: %v\n", err)
		_ = uploadStore.Apply(services.StorageConfig{Type: "local"})
	}
	go func() {
		if n, err := uploadStore.SyncMediaIndex(); err != nil {
			fmt.Fprintf(os.Stderr, "警告: 媒体索引同步失败: %v\n", err)
		} else if n > 0 {
			fmt.Fprintf(os.Stderr, "媒体索引已同步 %d 条\n", n)
		}
	}()

	h := &api.Handlers{
		Cfg: cfg, Store: uploadStore, Auth: authSvc, User: userSvc, Board: boardSvc,
		Post: postSvc, Comment: commentSvc, Message: messageSvc, Notify: notifySvc, Report: reportSvc,
		Backup: backupSvc,
		Filter: filter, Limiter: limiter, Settings: settingsSvc,
		Captcha: captchaSvc, Mail: mailSvc, EmailCode: emailCodeSvc,
		OIDC: oidcSvc, Gitea: giteaSvc,
		Points: services.NewPointsService(), Badge: services.NewBadgeService(),
		SitePage:        services.NewSitePageService(filter),
		FriendLinkApply: friendLinkApplySvc,
	}
	authMW := auth.NewAuthMiddleware(authSvc)

	install.Register(r, install.Deps{
		DataDir: cfg.DataDir, JWTSecret: cfg.JWTSecret,
		Auth: authSvc, Settings: settingsSvc,
	})

	webpages.Register(r, webpages.Deps{
		DataDir: cfg.DataDir, JWTSecret: cfg.JWTSecret,
		Settings: settingsSvc, Auth: authSvc, User: userSvc,
		Board: boardSvc, Post: postSvc, Comment: commentSvc,
		Message: messageSvc, Filter: filter,
		Limiter: limiter, EmailCode: emailCodeSvc, Store: uploadStore,
	}, authMW)

	r.GET("/media/thumb/*filepath", h.ServeImageThumb)
	r.Static("/uploads", filepath.Join(cfg.DataDir, "uploads"))
	r.GET("/health", h.APIHealth)
	r.GET("/robots.txt", h.RobotsTxt)
	r.GET("/sitemap.xml", h.SitemapXML)

	// OIDC Provider（外部机器 / Gitea SSO）
	r.GET("/.well-known/openid-configuration", h.OIDCDiscovery)
	r.GET("/oauth/jwks", h.OIDCJWKS)
	r.GET("/oauth/authorize", authMW.OptionalAuth(), h.OIDCAuthorize)
	r.POST("/oauth/token", h.OIDCToken)
	r.GET("/oauth/userinfo", h.OIDCUserInfo)
	r.POST("/oauth/userinfo", h.OIDCUserInfo)
	r.GET("/oauth/logout", h.OIDCLogout)
	r.POST("/oauth/logout", h.OIDCLogout)

	// 精简机器 API：健康检查已注册；保留只读探测与 OIDC，论坛 UI 不再走 /api
	r.NoRoute(webpages.Deps{
		DataDir: cfg.DataDir, JWTSecret: cfg.JWTSecret,
		Settings: settingsSvc, Auth: authSvc,
		Board: boardSvc, Post: postSvc, Comment: commentSvc,
	}.NotFound)

	return r, nil
}

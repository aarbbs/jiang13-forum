package router

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"git.iioio.com/freefire/jiang13-forum/config"
	"git.iioio.com/freefire/jiang13-forum/embed_static"
	"git.iioio.com/freefire/jiang13-forum/handler"
	"git.iioio.com/freefire/jiang13-forum/middleware"
	"git.iioio.com/freefire/jiang13-forum/service"
)

func Setup(cfg *config.Config) (*gin.Engine, error) {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(gin.Logger())

	if err := embed_static.SetupEmbed(r); err != nil {
		return nil, err
	}

	filter := service.NewSensitiveFilter()
	_ = service.WriteDefaultFilterWords(cfg.FilterWordsPath())
	filter.LoadFromFile(cfg.FilterWordsPath())

	settingsSvc := service.NewForumSettingsService()
	// SPA 入口 HTML 注入标题与品牌 JSON，避免刷新时先闪默认文案
	embed_static.SetSPADocumentTitle(func() string {
		return settingsSvc.SiteBranding().DocumentTitle()
	})
	embed_static.SetSPABrandingJSON(func() []byte {
		b, err := json.Marshal(settingsSvc.SiteBranding())
		if err != nil {
			return nil
		}
		return b
	})
	authSvc := service.NewAuthService(cfg.JWTSecret, filter, settingsSvc)
	userSvc := service.NewUserService(filter, settingsSvc)
	boardSvc := service.NewBoardService()
	boardSvc.EnsureDefaultBoard()
	postSvc := service.NewPostService(filter, settingsSvc)
	commentSvc := service.NewCommentService(filter, settingsSvc)
	messageSvc := service.NewMessageService(filter, settingsSvc)
	reportSvc := service.NewReportService(filter, settingsSvc, messageSvc, postSvc)
	backupSvc := service.NewBackupService(cfg.DBPath(), cfg.DataDir)
	limiter := service.NewRateLimiter(settingsSvc)
	captchaSvc := service.NewCaptchaService()
	mailSvc := service.NewMailService(settingsSvc)
	emailCodeSvc := service.NewEmailCodeService(mailSvc)
	oidcSvc, err := service.NewOIDCService(cfg, settingsSvc)
	if err != nil {
		return nil, err
	}
	giteaSvc := service.NewGiteaService(settingsSvc)
	giteaSvc.StartBackgroundSync()

	uploadStore := service.NewUploadStore(cfg.DataDir, settingsSvc)
	if err := uploadStore.ReloadFromSettings(settingsSvc); err != nil {
		// 配置不完整时保持本地磁盘，避免进程无法启动；管理员可在后台修正后热切换
		fmt.Fprintf(os.Stderr, "警告: 对象存储初始化失败，暂用本地磁盘: %v\n", err)
		_ = uploadStore.Apply(service.StorageConfig{Type: "local"})
	}
	// 后台同步存量文件到媒体索引，避免列表依赖实时扫盘
	go func() {
		if n, err := uploadStore.SyncMediaIndex(); err != nil {
			fmt.Fprintf(os.Stderr, "警告: 媒体索引同步失败: %v\n", err)
		} else if n > 0 {
			fmt.Fprintf(os.Stderr, "媒体索引已同步 %d 条\n", n)
		}
	}()

	h := &handler.Handlers{
		Cfg: cfg, Store: uploadStore, Auth: authSvc, User: userSvc, Board: boardSvc,
		Post: postSvc, Comment: commentSvc, Message: messageSvc, Report: reportSvc,
		Backup: backupSvc,
		Filter: filter, Limiter: limiter, Settings: settingsSvc,
		Captcha: captchaSvc, Mail: mailSvc, EmailCode: emailCodeSvc,
		OIDC: oidcSvc, Gitea: giteaSvc,
	}
	authMW := middleware.NewAuthMiddleware(authSvc)

	// 缩略图使用独立前缀，避免与 Static("/uploads/*filepath") 路由冲突
	r.GET("/media/thumb/*filepath", h.ServeImageThumb)
	r.Static("/uploads", filepath.Join(cfg.DataDir, "uploads"))

	// SEO：抓取规则与站点地图
	r.GET("/robots.txt", h.RobotsTxt)
	r.GET("/sitemap.xml", h.SitemapXML)

	// OIDC Provider（Gitea 等外部站点 SSO）
	r.GET("/.well-known/openid-configuration", h.OIDCDiscovery)
	r.GET("/oauth/jwks", h.OIDCJWKS)
	r.GET("/oauth/authorize", authMW.OptionalAuth(), h.OIDCAuthorize)
	r.POST("/oauth/token", h.OIDCToken)
	r.GET("/oauth/userinfo", h.OIDCUserInfo)
	r.POST("/oauth/userinfo", h.OIDCUserInfo)
	r.GET("/oauth/logout", h.OIDCLogout)
	r.POST("/oauth/logout", h.OIDCLogout)

	// 公开 JSON API（可选登录）
	pubAPI := r.Group("/api", authMW.OptionalAuth())
	{
		pubAPI.GET("/me", h.APIMe)
		pubAPI.GET("/boards", h.APIBoards)
		pubAPI.GET("/stats", h.APIStats)
		pubAPI.GET("/forum-limits", h.APIForumLimits)
		pubAPI.GET("/site-branding", h.APISiteBranding)
		pubAPI.GET("/captcha", h.APICaptcha)
		pubAPI.GET("/register/config", h.APIRegisterConfig)
		pubAPI.POST("/register/email-code", middleware.RateLimitMiddleware(limiter, "register"), h.APISendRegisterEmailCode)
		pubAPI.GET("/posts", h.APIPosts)
		pubAPI.GET("/posts/hot", h.APIHotPosts)
		pubAPI.GET("/tags", h.APITags)
		pubAPI.GET("/comments/recent", h.APIRecentComments)
		pubAPI.GET("/users/:id", h.APIUserPublic)
		pubAPI.GET("/posts/:id", h.APIPostDetail)
		pubAPI.GET("/posts/:id/comments", h.APIPostComments)
		pubAPI.POST("/posts/:id/comments", middleware.RateLimitMiddleware(limiter, "comment"), h.APICreateComment)
		pubAPI.GET("/projects", h.APIProjects)
		pubAPI.POST("/register", middleware.RateLimitMiddleware(limiter, "register"), h.APIRegister)
		pubAPI.POST("/login", middleware.RateLimitMiddleware(limiter, "login"), h.APILogin)
	}

	// 需登录 API
	api := r.Group("/api", authMW.RequireAuth())
	{
		api.POST("/logout", h.APILogout)
		api.GET("/favorites", h.APIFavorites)
		api.GET("/profile/stats", h.APIProfileStats)
		api.POST("/profile/nickname", h.APIUpdateProfile)
		api.POST("/profile/signature", h.APIUpdateSignature)
		api.POST("/profile/password", h.APIUpdatePassword)
		api.POST("/profile/avatar", h.APIUploadAvatar)
		api.POST("/uploads/image", h.APIUploadPostImage)
		api.POST("/posts", middleware.RateLimitMiddleware(limiter, "post"), h.APICreatePost)
		api.PUT("/posts/:id", h.APIUpdatePost)
		api.DELETE("/posts/:id", h.APIDeletePost)
		api.GET("/posts/:id/revisions", h.APIPostRevisions)
		api.GET("/posts/:id/revisions/:revId", h.APIPostRevisionDetail)
		api.POST("/posts/:id/like", h.APIToggleLike)
		api.POST("/posts/:id/favorite", h.APIToggleFavorite)
		api.POST("/posts/:id/report", middleware.RateLimitMiddleware(limiter, "report"), h.APICreatePostReport)
		api.GET("/messages/unread-count", h.APIMessageUnreadCount)
		api.GET("/messages/conversations", h.APIMessageConversations)
		api.GET("/messages/conversations/:peerId", h.APIConversationMessages)
		api.POST("/messages/conversations/:peerId/read", h.APIMarkConversationRead)
		api.POST("/messages", middleware.RateLimitMiddleware(limiter, "message"), h.APISendMessage)
		api.POST("/messages/read-all", h.APIMarkAllMessagesRead)
		api.DELETE("/comments/:id", h.APIDeleteComment)
		api.PUT("/comments/:id", h.APIUpdateComment)
	}

	// 管理员 API（React SPA 后台统一使用 JSON）
	adminAPI := r.Group("/api/admin", authMW.RequireAuth(), authMW.RequireAdmin())
	{
		adminAPI.GET("/dashboard", h.APIAdminDashboard)
		adminAPI.GET("/settings", h.APIAdminSettings)
		adminAPI.PUT("/settings/forum", h.APIAdminUpdateForumSettings)
		adminAPI.PUT("/settings/mail", h.APIAdminUpdateMailSettings)
		adminAPI.POST("/settings/mail/test", h.APIAdminTestMail)
		adminAPI.PUT("/settings/oidc", h.APIAdminUpdateOIDCSettings)
		adminAPI.PUT("/settings/gitea", h.APIAdminUpdateGiteaSettings)
		adminAPI.POST("/settings/gitea/sync", h.APIAdminSyncGitea)
		adminAPI.PUT("/settings/storage", h.APIAdminUpdateStorageSettings)
		adminAPI.PUT("/settings/branding", h.APIAdminUpdateBranding)
		adminAPI.POST("/settings/branding/upload", h.APIAdminUploadBrandingAsset)
		adminAPI.POST("/settings/branding/clear", h.APIAdminClearBrandingAsset)
		adminAPI.GET("/oauth/clients", h.APIAdminListOAuthClients)
		adminAPI.POST("/oauth/clients", h.APIAdminCreateOAuthClient)
		adminAPI.PUT("/oauth/clients/:id", h.APIAdminUpdateOAuthClient)
		adminAPI.DELETE("/oauth/clients/:id", h.APIAdminDeleteOAuthClient)
		adminAPI.GET("/settings/filter-words", h.APIAdminFilterWords)
		adminAPI.PUT("/settings/filter-words", h.APIAdminUpdateFilterWords)
		adminAPI.POST("/boards", h.APIAdminCreateBoard)
		adminAPI.PUT("/boards/:id", h.APIAdminUpdateBoard)
		adminAPI.DELETE("/boards/:id", h.APIAdminDeleteBoard)
		adminAPI.GET("/posts", h.APIAdminPosts)
		adminAPI.GET("/posts/trash", h.APIAdminTrashPosts)
		adminAPI.POST("/posts/:id/pin", h.APIAdminPinPost)
		adminAPI.POST("/posts/:id/feature", h.APIAdminFeaturePost)
		adminAPI.POST("/posts/:id/lock", h.APIAdminLockPost)
		adminAPI.POST("/posts/:id/approve", h.APIAdminApprovePost)
		adminAPI.POST("/posts/:id/reject", h.APIAdminRejectPost)
		adminAPI.POST("/posts/:id/restore", h.APIAdminRestorePost)
		adminAPI.DELETE("/posts/:id/purge", h.APIAdminPurgePost)
		adminAPI.DELETE("/posts/:id", h.APIAdminDeletePost)
		adminAPI.GET("/reports", h.APIAdminReports)
		adminAPI.POST("/reports/:id/handle", h.APIAdminHandleReport)
		adminAPI.GET("/comments", h.APIAdminComments)
		adminAPI.GET("/comments/:id/revisions", h.APIAdminCommentRevisions)
		adminAPI.POST("/comments/:id/approve", h.APIAdminApproveComment)
		adminAPI.POST("/comments/:id/reject", h.APIAdminRejectComment)
		adminAPI.DELETE("/comments/:id", h.APIAdminDeleteComment)
		adminAPI.GET("/users", h.APIAdminUsers)
		adminAPI.POST("/users/:id/ban", h.APIAdminBanUser)
		adminAPI.GET("/media", h.APIAdminMedia)
		adminAPI.POST("/media/delete", h.APIAdminDeleteMedia)
		adminAPI.POST("/backup", h.APIAdminBackup)
		adminAPI.GET("/backup/download/:name", h.APIAdminDownloadBackup)
	}

	// 后台管理页面由 React SPA 渲染（JSON API 见上方 /api/admin）
	admin := r.Group("/admin")
	{
		admin.GET("/login", func(c *gin.Context) {
			c.Redirect(http.StatusFound, "/login")
		})

		adminAuth := admin.Group("/", authMW.RequireAuth(), authMW.RequireAdmin())
		{
			adminAuth.GET("/", func(c *gin.Context) { c.Redirect(http.StatusFound, "/admin/dashboard") })
			for _, page := range []string{"dashboard", "boards", "posts", "comments", "reports", "users", "media", "settings"} {
				adminAuth.GET("/"+page, embed_static.ServeSPANoIndex)
			}
		}
	}

	// React SPA 入口（公开页注入 SEO meta / JSON-LD / 预渲染摘要）
	r.GET("/", h.ServePublicSPA)
	r.NoRoute(func(c *gin.Context) {
		if embed_static.IsSPARoute(c.Request.URL.Path) {
			h.ServePublicSPA(c)
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	})

	return r, nil
}

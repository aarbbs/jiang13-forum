package router

import (
	"net/http"
	"path/filepath"
	"time"

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

	authSvc := service.NewAuthService(cfg.JWTSecret, filter)
	userSvc := service.NewUserService(filter)
	boardSvc := service.NewBoardService()
	settingsSvc := service.NewForumSettingsService()
	postSvc := service.NewPostService(filter, settingsSvc)
	commentSvc := service.NewCommentService(filter)
	backupSvc := service.NewBackupService(cfg.DBPath(), cfg.DataDir)
	onlineSvc := service.NewOnlineService()
	limiter := service.NewRateLimiter(10, time.Minute)

	h := &handler.Handlers{
		Cfg: cfg, Auth: authSvc, User: userSvc, Board: boardSvc,
		Post: postSvc, Comment: commentSvc, Backup: backupSvc,
		Filter: filter, Limiter: limiter, Online: onlineSvc,
		Settings: settingsSvc,
	}
	authMW := middleware.NewAuthMiddleware(authSvc)

	r.Static("/uploads", filepath.Join(cfg.DataDir, "uploads"))

	// 公开 JSON API（可选登录）
	pubAPI := r.Group("/api", authMW.OptionalAuth(), middleware.PresenceMiddleware(onlineSvc))
	{
		pubAPI.GET("/me", h.APIMe)
		pubAPI.GET("/boards", h.APIBoards)
		pubAPI.GET("/stats", h.APIStats)
		pubAPI.GET("/posts", h.APIPosts)
		pubAPI.GET("/posts/hot", h.APIHotPosts)
		pubAPI.GET("/notifications", h.APINotifications)
		pubAPI.GET("/online", h.APIOnline)
		pubAPI.POST("/presence", h.APIPresence)
		pubAPI.GET("/posts/:id", h.APIPostDetail)
		pubAPI.GET("/posts/:id/comments", h.APIPostComments)
		pubAPI.POST("/posts/:id/comments", middleware.RateLimitMiddleware(limiter, "comment"), h.APICreateComment)
		pubAPI.POST("/register", middleware.RateLimitMiddleware(limiter, "register"), h.APIRegister)
		pubAPI.POST("/login", middleware.RateLimitMiddleware(limiter, "login"), h.APILogin)
	}

	// 需登录 API
	api := r.Group("/api", authMW.RequireAuth(), middleware.PresenceMiddleware(onlineSvc))
	{
		api.POST("/logout", h.APILogout)
		api.POST("/ping", h.APIPing)
		api.GET("/favorites", h.APIFavorites)
		api.POST("/profile/nickname", h.APIUpdateProfile)
		api.POST("/profile/password", h.APIUpdatePassword)
		api.POST("/profile/avatar", h.APIUploadAvatar)
		api.POST("/posts", middleware.RateLimitMiddleware(limiter, "post"), h.APICreatePost)
		api.PUT("/posts/:id", h.APIUpdatePost)
		api.DELETE("/posts/:id", h.APIDeletePost)
		api.GET("/posts/:id/revisions", h.APIPostRevisions)
		api.GET("/posts/:id/revisions/:revId", h.APIPostRevisionDetail)
		api.POST("/posts/:id/like", h.APIToggleLike)
		api.POST("/posts/:id/favorite", h.APIToggleFavorite)
		api.DELETE("/comments/:id", h.APIDeleteComment)
	}

	// 管理员 API（React SPA 后台统一使用 JSON）
	adminAPI := r.Group("/api/admin", authMW.RequireAuth(), authMW.RequireAdmin())
	{
		adminAPI.GET("/dashboard", h.APIAdminDashboard)
		adminAPI.GET("/settings", h.APIAdminSettings)
		adminAPI.PUT("/settings/forum", h.APIAdminUpdateForumSettings)
		adminAPI.POST("/boards", h.APIAdminCreateBoard)
		adminAPI.PUT("/boards/:id", h.APIAdminUpdateBoard)
		adminAPI.DELETE("/boards/:id", h.APIAdminDeleteBoard)
		adminAPI.GET("/posts", h.APIAdminPosts)
		adminAPI.POST("/posts/:id/pin", h.APIAdminPinPost)
		adminAPI.POST("/posts/:id/lock", h.APIAdminLockPost)
		adminAPI.DELETE("/posts/:id", h.APIAdminDeletePost)
		adminAPI.GET("/comments", h.APIAdminComments)
		adminAPI.DELETE("/comments/:id", h.APIAdminDeleteComment)
		adminAPI.GET("/users", h.APIAdminUsers)
		adminAPI.POST("/users/:id/ban", h.APIAdminBanUser)
		adminAPI.POST("/backup", h.APIAdminBackup)
		adminAPI.GET("/backup/download/:name", h.APIAdminDownloadBackup)
	}

	// 后台管理：API 保留兼容，页面统一由 React SPA 渲染
	admin := r.Group("/admin")
	{
		admin.GET("/login", func(c *gin.Context) {
			c.Redirect(http.StatusFound, "/login")
		})
		admin.POST("/api/login", middleware.RateLimitMiddleware(limiter, "admin_login"), h.AdminAPILogin)

		adminAuth := admin.Group("/", authMW.RequireAuth(), authMW.RequireAdmin())
		{
			adminAuth.POST("/api/logout", h.AdminAPILogout)
			// 遗留 form API（旧模板脚本仍可能调用）
			adminAuth.POST("/api/boards", h.AdminAPICreateBoard)
			adminAuth.PUT("/api/boards/:id", h.AdminAPIUpdateBoard)
			adminAuth.DELETE("/api/boards/:id", h.AdminAPIDeleteBoard)
			adminAuth.POST("/api/posts/:id/pin", h.AdminAPIPinPost)
			adminAuth.DELETE("/api/posts/:id", h.AdminAPIDeletePost)
			adminAuth.DELETE("/api/comments/:id", h.AdminAPIDeleteComment)
			adminAuth.POST("/api/users/:id/ban", h.AdminAPIBanUser)
			adminAuth.POST("/api/backup", h.AdminAPIBackup)
			adminAuth.GET("/api/backup/download/:name", h.AdminDownloadBackup)

			// React SPA 管理页面
			adminAuth.GET("/", func(c *gin.Context) { c.Redirect(http.StatusFound, "/admin/dashboard") })
			for _, page := range []string{"dashboard", "boards", "posts", "comments", "users", "settings"} {
				adminAuth.GET("/"+page, embed_static.ServeSPA)
			}
		}
	}

	// React SPA 入口
	r.GET("/", embed_static.ServeSPA)
	r.NoRoute(func(c *gin.Context) {
		if embed_static.IsSPARoute(c.Request.URL.Path) {
			embed_static.ServeSPA(c)
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	})

	return r, nil
}

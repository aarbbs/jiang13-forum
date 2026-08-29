package install

import (
	"net/http"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/modules/webctx"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

// Deps 安装依赖
type Deps struct {
	DataDir      string
	JWTSecret    string
	AssetVersion string
	Auth         *services.AuthService
	Settings     *services.ForumSettingsService
}

type pageData struct {
	Title                 string
	Description           string
	SiteName              string
	Slogan                string
	LogoMark              string
	LogoURL               string
	FaviconURL            string
	OGImageURL            string
	AssetVersion          string
	ShowFriendLinksFooter bool
	FooterPages           []struct {
		Title string
		Slug  string
	}
	CSRF          string
	Error         string
	Flash         string
	AdminUsername string
	AdminEmail    string
	AdminNickname string
}

// Register 未安装时的路由（仅 /install）
func Register(r *gin.Engine, deps Deps) {
	r.GET("/install", deps.Get)
	r.POST("/install", deps.Post)
}

// Get 安装页
func (d Deps) Get(c *gin.Context) {
	if services.IsInstalled(d.DataDir) {
		c.Redirect(http.StatusFound, "/")
		return
	}
	ctx := webctx.New(c, d.JWTSecret)
	brand := d.Settings.SiteBranding()
	name := brand.Name
	if name == "" {
		name = "姜十三论坛"
	}
	ctx.HTML(http.StatusOK, "install", pageData{
		Title: "安装 · " + name, SiteName: name, LogoMark: "姜",
		AssetVersion: d.assetVersion(),
		CSRF: ctx.EnsureCSRF(), AdminUsername: "admin",
	})
}

// Post 提交安装
func (d Deps) Post(c *gin.Context) {
	if services.IsInstalled(d.DataDir) {
		c.Redirect(http.StatusSeeOther, "/")
		return
	}
	ctx := webctx.New(c, d.JWTSecret)
	brand := d.Settings.SiteBranding()
	siteName := strings.TrimSpace(c.PostForm("site_name"))
	if siteName == "" {
		siteName = "姜十三论坛"
	}
	data := pageData{
		Title: "安装 · " + siteName, SiteName: siteName, LogoMark: "姜",
		AssetVersion:  d.assetVersion(),
		CSRF:          ctx.EnsureCSRF(),
		AdminUsername: strings.TrimSpace(c.PostForm("admin_username")),
		AdminEmail:    strings.TrimSpace(c.PostForm("admin_email")),
		AdminNickname: strings.TrimSpace(c.PostForm("admin_nickname")),
	}
	if !ctx.CheckCSRF() {
		data.Error = "无效请求，请重试"
		ctx.HTML(http.StatusBadRequest, "install", data)
		return
	}
	pass := c.PostForm("admin_password")
	pass2 := c.PostForm("admin_password2")
	if pass != pass2 {
		data.Error = "两次密码不一致"
		ctx.HTML(http.StatusBadRequest, "install", data)
		return
	}
	if _, err := d.Auth.CreateAdmin(data.AdminUsername, pass, data.AdminNickname, data.AdminEmail); err != nil {
		data.Error = err.Error()
		ctx.HTML(http.StatusBadRequest, "install", data)
		return
	}
	b := d.Settings.SiteBranding()
	b.Name = siteName
	_ = d.Settings.UpdateSiteBranding(b)
	if err := services.WriteInstallLock(d.DataDir); err != nil {
		data.Error = "写入安装锁失败: " + err.Error()
		ctx.HTML(http.StatusInternalServerError, "install", data)
		return
	}
	ctx.HTML(http.StatusOK, "post-install", pageData{
		Title: "安装完成", SiteName: siteName, LogoMark: "姜",
		AssetVersion: d.assetVersion(),
	})
	_ = brand
}

func (d Deps) assetVersion() string {
	v := strings.TrimSpace(d.AssetVersion)
	if v == "" {
		return "dev"
	}
	return v
}

// Guard 未安装则只允许 install / assets / health
func Guard(dataDir string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if services.IsInstalled(dataDir) {
			c.Next()
			return
		}
		path := c.Request.URL.Path
		if path == "/install" || path == "/health" ||
			strings.HasPrefix(path, "/ssr-assets/") {
			c.Next()
			return
		}
		c.Redirect(http.StatusFound, "/install")
		c.Abort()
	}
}

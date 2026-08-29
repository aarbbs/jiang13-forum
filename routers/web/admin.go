package web

import (
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/modules/webctx"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

// AdminChrome 后台布局公共字段
type AdminChrome struct {
	PageChrome
	NavActive string
}

func (d Deps) adminChrome(ctx *webctx.Context, title, nav string) AdminChrome {
	site := d.Settings.SiteBranding().Name
	if title == "" {
		title = "管理后台 · " + site
	} else {
		title = title + " · " + site
	}
	base := d.chrome(ctx, title, "", "")
	return AdminChrome{PageChrome: base, NavActive: nav}
}

type adminDashData struct {
	AdminChrome
	UserCount       int64
	PostCount       int64
	PendingPosts    int64
	PendingComments int64
	PendingReports  int64
	BoardCount      int64
}

// AdminDashboard 概览
func (d Deps) AdminDashboard(c *gin.Context) {
	ctx := d.ctx(c)
	var users, posts, boards int64
	_ = models.DB.Model(&models.User{}).Count(&users).Error
	_ = models.DB.Model(&models.Post{}).Where("status = ?", models.ContentStatusPublished).Count(&posts).Error
	_ = models.DB.Model(&models.Board{}).Count(&boards).Error
	pendingPosts, _ := d.Post.PendingPostCount()
	pendingComments, _ := d.Comment.PendingCommentCount()
	var pendingReports int64
	if d.Report != nil {
		pendingReports, _ = d.Report.PendingCount()
	}
	ctx.HTML(http.StatusOK, "admin/dashboard", adminDashData{
		AdminChrome:     d.adminChrome(ctx, "仪表盘", "dashboard"),
		UserCount:       users,
		PostCount:       posts,
		PendingPosts:    pendingPosts,
		PendingComments: pendingComments,
		PendingReports:  pendingReports,
		BoardCount:      boards,
	})
}

type adminBoardRow struct {
	ID          uint
	Name        string
	Description string
	Icon        string
	ColorIndex  int
	SortOrder   int
	PostCount   int
}

type adminBoardsData struct {
	AdminChrome
	Boards []adminBoardRow
	Form   adminBoardForm
}

type adminBoardForm struct {
	ID          uint
	Name        string
	Description string
	Icon        string
	ColorIndex  int
	SortOrder   int
}

// AdminBoardsGet 板块列表
func (d Deps) AdminBoardsGet(c *gin.Context) {
	ctx := d.ctx(c)
	d.renderAdminBoards(ctx, "", adminBoardForm{})
}

func (d Deps) renderAdminBoards(ctx *webctx.Context, errMsg string, form adminBoardForm) {
	list, _ := d.Board.ListWithStats()
	rows := make([]adminBoardRow, 0, len(list))
	for _, b := range list {
		rows = append(rows, adminBoardRow{
			ID: b.ID, Name: b.Name, Description: b.Description,
			Icon: b.Icon, ColorIndex: b.ColorIndex, SortOrder: b.SortOrder,
			PostCount: b.PostCount,
		})
	}
	data := adminBoardsData{
		AdminChrome: d.adminChrome(ctx, "板块", "boards"),
		Boards:      rows,
		Form:        form,
	}
	data.Error = errMsg
	ctx.HTML(http.StatusOK, "admin/boards", data)
}

// AdminBoardCreate 新建板块
func (d Deps) AdminBoardCreate(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminBoards(ctx, "无效请求，请重试", adminBoardFormFrom(c))
		return
	}
	form := adminBoardFormFrom(c)
	if strings.TrimSpace(form.Name) == "" {
		d.renderAdminBoards(ctx, "请填写板块名称", form)
		return
	}
	if _, err := d.Board.Create(form.Name, form.Description, form.Icon, form.ColorIndex, form.SortOrder); err != nil {
		d.renderAdminBoards(ctx, err.Error(), form)
		return
	}
	ctx.SetFlash("板块已创建")
	ctx.Redirect("/admin/boards")
}

// AdminBoardUpdate 更新板块
func (d Deps) AdminBoardUpdate(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminBoards(ctx, "无效请求，请重试", adminBoardFormFrom(c))
		return
	}
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	form := adminBoardFormFrom(c)
	form.ID = uint(id)
	if strings.TrimSpace(form.Name) == "" {
		d.renderAdminBoards(ctx, "请填写板块名称", form)
		return
	}
	if err := d.Board.Update(uint(id), form.Name, form.Description, form.Icon, form.ColorIndex, form.SortOrder); err != nil {
		d.renderAdminBoards(ctx, err.Error(), form)
		return
	}
	ctx.SetFlash("板块已更新")
	ctx.Redirect("/admin/boards")
}

// AdminBoardDelete 删除板块
func (d Deps) AdminBoardDelete(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect("/admin/boards")
		return
	}
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := d.Board.Delete(uint(id)); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect("/admin/boards")
		return
	}
	ctx.SetFlash("板块已删除")
	ctx.Redirect("/admin/boards")
}

func adminBoardFormFrom(c *gin.Context) adminBoardForm {
	color, _ := strconv.Atoi(c.PostForm("color_index"))
	sort, _ := strconv.Atoi(c.PostForm("sort_order"))
	return adminBoardForm{
		Name:        strings.TrimSpace(c.PostForm("name")),
		Description: strings.TrimSpace(c.PostForm("description")),
		Icon:        strings.TrimSpace(c.PostForm("icon")),
		ColorIndex:  color,
		SortOrder:   sort,
	}
}

type adminModPostRow struct {
	ID         uint
	Title      string
	AuthorName string
	BoardName  string
	CreatedAt  string
}

type adminModCommentRow struct {
	ID         uint
	PostID     uint
	PostTitle  string
	Floor      int
	AuthorName string
	Excerpt    string
	CreatedAt  string
}

type adminModData struct {
	AdminChrome
	Posts    []adminModPostRow
	Comments []adminModCommentRow
}

// AdminModerationGet 待审帖/评
func (d Deps) AdminModerationGet(c *gin.Context) {
	ctx := d.ctx(c)
	posts, _, _ := d.Post.List(services.PostListQuery{
		Page: 1, Size: 50,
		ViewerIsAdmin: true,
		Status:        models.ContentStatusPending,
		Sort:          "latest",
	})
	postRows := make([]adminModPostRow, 0, len(posts))
	for _, p := range posts {
		author := ""
		if p.User.ID > 0 {
			author = p.User.Nickname
			if author == "" {
				author = p.User.Username
			}
		}
		board := ""
		if p.Board.ID > 0 {
			board = p.Board.Name
		}
		postRows = append(postRows, adminModPostRow{
			ID: p.ID, Title: p.Title, AuthorName: author, BoardName: board,
			CreatedAt: p.CreatedAt.Format("2006-01-02 15:04"),
		})
	}
	comments, _, _ := d.Comment.ListPending(1, 50)
	commentRows := make([]adminModCommentRow, 0, len(comments))
	for _, cm := range comments {
		author := "游客"
		if cm.UserID > 0 {
			author = cm.User.Nickname
			if author == "" {
				author = cm.User.Username
			}
		} else if cm.GuestNick != "" {
			author = cm.GuestNick
		}
		excerpt := strings.TrimSpace(stripTagsRough(cm.Content))
		runes := []rune(excerpt)
		if len(runes) > 80 {
			excerpt = string(runes[:80]) + "…"
		}
		title := ""
		if cm.Post.ID > 0 {
			title = cm.Post.Title
		}
		commentRows = append(commentRows, adminModCommentRow{
			ID: cm.ID, PostID: cm.PostID, PostTitle: title, Floor: cm.Floor,
			AuthorName: author, Excerpt: excerpt,
			CreatedAt: cm.CreatedAt.Format("2006-01-02 15:04"),
		})
	}
	ctx.HTML(http.StatusOK, "admin/moderation", adminModData{
		AdminChrome: d.adminChrome(ctx, "内容审核", "moderation"),
		Posts:       postRows,
		Comments:    commentRows,
	})
}

func stripTagsRough(s string) string {
	var b strings.Builder
	inTag := false
	for _, r := range s {
		switch {
		case r == '<':
			inTag = true
		case r == '>':
			inTag = false
		case !inTag:
			b.WriteRune(r)
		}
	}
	return b.String()
}

// AdminPostApprove 通过帖子
func (d Deps) AdminPostApprove(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect("/admin/moderation")
		return
	}
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := d.Post.SetStatus(uint(id), models.ContentStatusPublished); err != nil {
		ctx.SetFlash(err.Error())
	} else {
		ctx.SetFlash("帖子已通过")
	}
	ctx.Redirect("/admin/moderation")
}

// AdminPostReject 拒绝帖子
func (d Deps) AdminPostReject(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect("/admin/moderation")
		return
	}
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	reason := strings.TrimSpace(c.PostForm("reason"))
	if reason == "" {
		ctx.SetFlash("请填写拒绝原因")
		ctx.Redirect("/admin/moderation")
		return
	}
	post, err := d.Post.FindByID(uint(id))
	if err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect("/admin/moderation")
		return
	}
	if err := d.Post.SetStatus(post.ID, models.ContentStatusRejected); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect("/admin/moderation")
		return
	}
	pid := post.ID
	if d.Message != nil {
		_, _ = d.Message.SendSystem(
			post.UserID,
			"帖子《"+post.Title+"》未通过审核",
			services.FormatRejectContent(post.Title, post.ID, reason),
			models.MessageKindReject,
			&pid,
			nil,
		)
	}
	ctx.SetFlash("已拒绝该帖")
	ctx.Redirect("/admin/moderation")
}

// AdminCommentApprove 通过评论
func (d Deps) AdminCommentApprove(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect("/admin/moderation")
		return
	}
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := d.Comment.SetStatus(uint(id), models.ContentStatusPublished); err != nil {
		ctx.SetFlash(err.Error())
	} else {
		if d.Notify != nil {
			if comment, err := d.Comment.GetByID(uint(id)); err == nil {
				comment.Status = models.ContentStatusPublished
				d.Notify.AsyncNotifyCommentPublished(comment)
				d.Notify.AsyncNotifyCommentMentions(comment)
			}
		}
		ctx.SetFlash("评论已通过")
	}
	ctx.Redirect("/admin/moderation")
}

// AdminCommentReject 拒绝评论
func (d Deps) AdminCommentReject(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect("/admin/moderation")
		return
	}
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	reason := strings.TrimSpace(c.PostForm("reason"))
	if reason == "" {
		ctx.SetFlash("请填写拒绝原因")
		ctx.Redirect("/admin/moderation")
		return
	}
	cm, err := d.Comment.GetByID(uint(id))
	if err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect("/admin/moderation")
		return
	}
	if err := d.Comment.SetStatus(cm.ID, models.ContentStatusRejected); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect("/admin/moderation")
		return
	}
	if d.Message != nil && cm.UserID > 0 {
		pid := cm.PostID
		title := cm.Post.Title
		_, _ = d.Message.SendSystem(
			cm.UserID,
			fmt.Sprintf("评论未通过审核（帖 #%d）", cm.PostID),
			services.FormatCommentRejectContent(title, cm.PostID, cm.Floor, reason),
			models.MessageKindReject,
			&pid,
			nil,
		)
	}
	ctx.SetFlash("已拒绝该评论")
	ctx.Redirect("/admin/moderation")
}

type adminAsideWidgetRow struct {
	ID         string
	Label      string
	Enabled    bool
	Index      int
	CanMoveUp  bool
	CanMoveDown bool
}

type adminSettingsData struct {
	AdminChrome
	Brand        services.SiteBranding
	RatePost     int
	RateComment  int
	RateReg      int
	RateLogin    int
	RateWindow   int
	FilterWords  string
	FilterCount  int
	Mail         services.MailConfig
	MailReady    bool
	TestTo       string
	AsideWidgets []adminAsideWidgetRow
	CanBackup    bool
}

// AdminSettingsGet 设置页
func (d Deps) AdminSettingsGet(c *gin.Context) {
	ctx := d.ctx(c)
	d.renderAdminSettings(ctx, "")
}

func (d Deps) renderAdminSettings(ctx *webctx.Context, errMsg string) {
	words := d.Settings.FilterWordsContent()
	lim := d.Settings.Limits()
	mail := d.Settings.MailConfigPublic()
	widgets := d.Settings.AsideWidgets()
	asideRows := make([]adminAsideWidgetRow, 0, len(widgets))
	last := len(widgets) - 1
	for i, w := range widgets {
		asideRows = append(asideRows, adminAsideWidgetRow{
			ID: w.ID, Label: asideWidgetLabel(w.ID), Enabled: w.Enabled, Index: i,
			CanMoveUp: i > 0, CanMoveDown: i < last,
		})
	}
	data := adminSettingsData{
		AdminChrome:  d.adminChrome(ctx, "站点设置", "settings"),
		Brand:        d.Settings.SiteBranding(),
		RatePost:     lim.RateLimitPost,
		RateComment:  lim.RateLimitComment,
		RateReg:      lim.RateLimitRegister,
		RateLogin:    lim.RateLimitLogin,
		RateWindow:   lim.RateLimitWindowSec,
		FilterWords:  words,
		FilterCount:  services.CountFilterWords(words),
		Mail:         mail,
		MailReady:    d.Settings.MailReady(),
		AsideWidgets: asideRows,
		CanBackup:    models.DialectorName() == "sqlite",
	}
	data.Error = errMsg
	ctx.HTML(http.StatusOK, "admin/settings", data)
}

func asideWidgetLabel(id string) string {
	switch id {
	case services.AsideWidgetTagCloud:
		return "标签云"
	case services.AsideWidgetRecentComments:
		return "最新评论"
	case services.AsideWidgetRecentUsers:
		return "最新用户"
	case services.AsideWidgetFriendLinks:
		return "友链"
	default:
		return id
	}
}

// AdminSettingsBrandPost 品牌
func (d Deps) AdminSettingsBrandPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminSettings(ctx, "无效请求，请重试")
		return
	}
	cur := d.Settings.SiteBranding()
	in := services.SiteBranding{
		Name:        strings.TrimSpace(c.PostForm("name")),
		Slogan:      strings.TrimSpace(c.PostForm("slogan")),
		Description: strings.TrimSpace(c.PostForm("description")),
		Keywords:    strings.TrimSpace(c.PostForm("keywords")),
		LogoMark:    strings.TrimSpace(c.PostForm("logo_mark")),
		Logo:        cur.Logo,
		Favicon:     cur.Favicon,
		OGImage:     cur.OGImage,
		ICPBeian:    strings.TrimSpace(c.PostForm("icp_beian")),
		ICPBeianURL: strings.TrimSpace(c.PostForm("icp_beian_url")),
		FriendLinks: cur.FriendLinks,
	}
	if err := d.Settings.UpdateSiteBranding(in); err != nil {
		d.renderAdminSettings(ctx, err.Error())
		return
	}
	ctx.SetFlash("品牌设置已保存")
	ctx.Redirect("/admin/settings")
}

// AdminSettingsBrandUploadPost 上传 Logo / Favicon / OG 图
func (d Deps) AdminSettingsBrandUploadPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminSettings(ctx, "无效请求，请重试")
		return
	}
	if d.Store == nil {
		d.renderAdminSettings(ctx, "上传存储未就绪")
		return
	}
	kind := strings.TrimSpace(c.PostForm("kind"))
	if kind != "logo" && kind != "favicon" && kind != "og_image" {
		d.renderAdminSettings(ctx, "请选择 Logo、Favicon 或 OG 图")
		return
	}
	file, err := c.FormFile("file")
	if err != nil {
		d.renderAdminSettings(ctx, "请选择图片文件")
		return
	}
	const maxBytes = 2 * 1024 * 1024
	if file.Size > maxBytes {
		d.renderAdminSettings(ctx, "图片不能超过 2MB")
		return
	}
	url, err := services.SaveUploadedImage(d.Store, file, services.UploadCategorySite, kind)
	if err != nil {
		d.renderAdminSettings(ctx, err.Error())
		return
	}
	prev := d.Settings.SiteBranding()
	switch kind {
	case "logo":
		_ = d.Settings.SetSiteLogo(url)
		d.Store.DeleteByURL(prev.Logo)
		ctx.SetFlash("Logo 已上传")
	case "favicon":
		_ = d.Settings.SetSiteFavicon(url)
		d.Store.DeleteByURL(prev.Favicon)
		ctx.SetFlash("Favicon 已上传")
	case "og_image":
		_ = d.Settings.SetSiteOGImage(url)
		d.Store.DeleteByURL(prev.OGImage)
		ctx.SetFlash("默认 OG 图已上传")
	}
	ctx.Redirect("/admin/settings")
}

// AdminSettingsBrandClearPost 清除品牌图片
func (d Deps) AdminSettingsBrandClearPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminSettings(ctx, "无效请求，请重试")
		return
	}
	kind := strings.TrimSpace(c.PostForm("kind"))
	brand := d.Settings.SiteBranding()
	switch kind {
	case "logo":
		_ = d.Settings.SetSiteLogo("")
		if d.Store != nil {
			d.Store.DeleteByURL(brand.Logo)
		}
		ctx.SetFlash("已清除 Logo")
	case "favicon":
		_ = d.Settings.SetSiteFavicon("")
		if d.Store != nil {
			d.Store.DeleteByURL(brand.Favicon)
		}
		ctx.SetFlash("已清除 Favicon")
	case "og_image":
		_ = d.Settings.SetSiteOGImage("")
		if d.Store != nil {
			d.Store.DeleteByURL(brand.OGImage)
		}
		ctx.SetFlash("已清除 OG 图")
	default:
		d.renderAdminSettings(ctx, "无效的资源类型")
		return
	}
	ctx.Redirect("/admin/settings")
}

// AdminSettingsLimitsPost 限流
func (d Deps) AdminSettingsLimitsPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminSettings(ctx, "无效请求，请重试")
		return
	}
	postN, _ := strconv.Atoi(c.PostForm("rate_limit_post"))
	commentN, _ := strconv.Atoi(c.PostForm("rate_limit_comment"))
	regN, _ := strconv.Atoi(c.PostForm("rate_limit_register"))
	loginN, _ := strconv.Atoi(c.PostForm("rate_limit_login"))
	windowN, _ := strconv.Atoi(c.PostForm("rate_limit_window_sec"))
	if err := d.Settings.UpdateRateLimits(postN, commentN, regN, loginN, windowN); err != nil {
		d.renderAdminSettings(ctx, err.Error())
		return
	}
	ctx.SetFlash("限流设置已保存")
	ctx.Redirect("/admin/settings")
}

// AdminSettingsFilterWordsPost 敏感词
func (d Deps) AdminSettingsFilterWordsPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminSettings(ctx, "无效请求，请重试")
		return
	}
	content := c.PostForm("filter_words")
	if err := d.Settings.UpdateFilterWords(content, d.Filter); err != nil {
		d.renderAdminSettings(ctx, err.Error())
		return
	}
	ctx.SetFlash(fmt.Sprintf("敏感词已更新（有效词 %d 个）· %s", services.CountFilterWords(content), time.Now().Format("15:04:05")))
	ctx.Redirect("/admin/settings")
}

// AdminSettingsMailPost 保存 SMTP
func (d Deps) AdminSettingsMailPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminSettings(ctx, "无效请求，请重试")
		return
	}
	port, _ := strconv.Atoi(c.PostForm("port"))
	cfg := services.MailConfig{
		Enabled:    c.PostForm("enabled") == "1" || c.PostForm("enabled") == "on",
		Host:       strings.TrimSpace(c.PostForm("host")),
		Port:       port,
		Username:   strings.TrimSpace(c.PostForm("username")),
		Password:   c.PostForm("password"),
		From:       strings.TrimSpace(c.PostForm("from")),
		FromName:   strings.TrimSpace(c.PostForm("from_name")),
		Encryption: strings.TrimSpace(c.PostForm("encryption")),
	}
	if err := d.Settings.UpdateMailConfig(cfg); err != nil {
		d.renderAdminSettings(ctx, err.Error())
		return
	}
	ctx.SetFlash("邮件设置已保存")
	ctx.Redirect("/admin/settings")
}

// AdminSettingsMailTestPost 发送测试信
func (d Deps) AdminSettingsMailTestPost(c *gin.Context) {
	ctx := d.ctx(c)
	to := strings.TrimSpace(c.PostForm("test_to"))
	if !ctx.CheckCSRF() {
		d.renderAdminSettings(ctx, "无效请求，请重试")
		return
	}
	if err := services.ValidateEmail(to); err != nil {
		d.renderAdminSettings(ctx, err.Error())
		return
	}
	if !d.Settings.MailReady() {
		d.renderAdminSettings(ctx, services.ErrMailNotConfigured.Error())
		return
	}
	if d.Mail == nil {
		d.renderAdminSettings(ctx, "邮件服务未就绪")
		return
	}
	siteName := d.Settings.SiteBranding().Name
	err := d.Mail.Send(services.NormalizeEmail(to), "邮件配置测试",
		fmt.Sprintf("这是一封来自%s的测试邮件，说明 SMTP 配置正常。", siteName))
	if err != nil {
		d.renderAdminSettings(ctx, err.Error())
		return
	}
	ctx.SetFlash("测试邮件已发送至 " + to)
	ctx.Redirect("/admin/settings")
}

// AdminSettingsAsideWidgetsPost 侧栏组件开关与排序
func (d Deps) AdminSettingsAsideWidgetsPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminSettings(ctx, "无效请求，请重试")
		return
	}
	order := c.PostFormArray("order")
	enabledSet := make(map[string]bool)
	for _, id := range c.PostFormArray("enabled") {
		id = strings.TrimSpace(id)
		if id != "" {
			enabledSet[id] = true
		}
	}
	widgets := make([]services.AsideWidget, 0, len(order))
	for _, id := range order {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		widgets = append(widgets, services.AsideWidget{ID: id, Enabled: enabledSet[id]})
	}
	widgets = services.NormalizeAsideWidgets(widgets)
	if move := strings.TrimSpace(c.PostForm("move")); move != "" {
		widgets = moveAsideWidget(widgets, move)
	}
	if err := d.Settings.UpdateAsideWidgets(widgets); err != nil {
		d.renderAdminSettings(ctx, err.Error())
		return
	}
	ctx.SetFlash("侧栏组件已保存")
	ctx.Redirect("/admin/settings")
}

// AdminSettingsBackupPost 一键导出 SQLite 备份并跳转下载
func (d Deps) AdminSettingsBackupPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminSettings(ctx, "无效请求，请重试")
		return
	}
	if d.Backup == nil {
		d.renderAdminSettings(ctx, "备份服务未就绪")
		return
	}
	path, err := d.Backup.ExportSQLite()
	if err != nil {
		d.renderAdminSettings(ctx, err.Error())
		return
	}
	name := filepath.Base(path)
	ctx.Redirect("/admin/settings/backup/download/" + name)
}

// AdminSettingsBackupDownload 下载 data 目录下的备份文件
func (d Deps) AdminSettingsBackupDownload(c *gin.Context) {
	name := c.Param("name")
	if !strings.HasPrefix(name, "jiang13_backup_") || !strings.HasSuffix(name, ".db") {
		c.String(http.StatusBadRequest, "无效的备份文件名")
		return
	}
	path := filepath.Join(d.DataDir, name)
	c.FileAttachment(path, name)
}

// moveAsideWidget 解析 move 值「up:id」或「down:id」并交换相邻项
func moveAsideWidget(widgets []services.AsideWidget, move string) []services.AsideWidget {
	parts := strings.SplitN(move, ":", 2)
	if len(parts) != 2 {
		return widgets
	}
	dir, id := parts[0], strings.TrimSpace(parts[1])
	idx := -1
	for i, w := range widgets {
		if w.ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return widgets
	}
	switch dir {
	case "up":
		if idx == 0 {
			return widgets
		}
		widgets[idx-1], widgets[idx] = widgets[idx], widgets[idx-1]
	case "down":
		if idx >= len(widgets)-1 {
			return widgets
		}
		widgets[idx], widgets[idx+1] = widgets[idx+1], widgets[idx]
	}
	return widgets
}

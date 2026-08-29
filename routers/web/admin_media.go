package web

import (
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/modules/webctx"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

type adminMediaRow struct {
	ID           uint
	Category     string
	CategoryLabel string
	Name         string
	URL          string
	ThumbURL     string
	SizeLabel    string
	Modified     string
	StorageType  string
}

type adminMediaData struct {
	AdminChrome
	Files          []adminMediaRow
	Keyword        string
	Category       string
	Page           int
	Total          int
	HasPrev        bool
	HasMore        bool
	PrevPage       int
	NextPage       int
	QuerySuffix    string
	StorageType    string
	CountAll       int
	CountAvatars   int
	CountPosts     int
	CountSite      int
}

// AdminMediaGet 媒体库列表
func (d Deps) AdminMediaGet(c *gin.Context) {
	ctx := d.ctx(c)
	d.renderAdminMedia(ctx, "")
}

func (d Deps) renderAdminMedia(ctx *webctx.Context, errMsg string) {
	chrome := d.adminChrome(ctx, "媒体", "media")
	chrome.Error = errMsg
	page, _ := strconv.Atoi(ctx.C.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	keyword := strings.TrimSpace(ctx.C.Query("q"))
	category := strings.TrimSpace(ctx.C.DefaultQuery("category", "all"))
	if category == "" {
		category = "all"
	}
	size := 24
	data := adminMediaData{
		AdminChrome: chrome,
		Keyword:     keyword,
		Category:    category,
		Page:        page,
		PrevPage:    page - 1,
		NextPage:    page + 1,
		HasPrev:     page > 1,
		Files:       []adminMediaRow{},
	}
	q := url.Values{}
	if keyword != "" {
		q.Set("q", keyword)
	}
	if category != "" && category != "all" {
		q.Set("category", category)
	}
	data.QuerySuffix = q.Encode()

	if d.Store == nil {
		chrome.Error = "上传存储未就绪"
		data.AdminChrome = chrome
		ctx.HTML(http.StatusOK, "admin/media", data)
		return
	}
	result, err := d.Store.ListMedia(category, keyword, page, size)
	if err != nil {
		chrome.Error = err.Error()
		data.AdminChrome = chrome
		ctx.HTML(http.StatusOK, "admin/media", data)
		return
	}
	data.Total = result.Total
	data.Page = result.Page
	data.HasPrev = result.Page > 1
	data.HasMore = result.Page < result.TotalPages
	data.PrevPage = result.Page - 1
	data.NextPage = result.Page + 1
	data.StorageType = result.StorageType
	data.CountAvatars = result.CategoryCounts[services.UploadCategoryAvatars]
	data.CountPosts = result.CategoryCounts[services.UploadCategoryPosts]
	data.CountSite = result.CategoryCounts[services.UploadCategorySite]
	data.CountAll = data.CountAvatars + data.CountPosts + data.CountSite
	data.Files = make([]adminMediaRow, 0, len(result.Files))
	for _, f := range result.Files {
		thumb := services.ThumbURLFromUpload(f.URL)
		if thumb == "" {
			thumb = f.URL
		}
		data.Files = append(data.Files, adminMediaRow{
			ID: f.ID, Category: f.Category, CategoryLabel: adminMediaCategoryLabel(f.Category),
			Name: f.Name, URL: f.URL, ThumbURL: thumb,
			SizeLabel: formatByteSize(f.Size), Modified: f.ModifiedAt.Local().Format("2006-01-02 15:04"),
			StorageType: f.StorageType,
		})
	}
	ctx.HTML(http.StatusOK, "admin/media", data)
}

func adminMediaCategoryLabel(cat string) string {
	switch cat {
	case services.UploadCategoryAvatars:
		return "头像"
	case services.UploadCategoryPosts:
		return "帖图"
	case services.UploadCategorySite:
		return "站点"
	default:
		return cat
	}
}

func formatByteSize(n int64) string {
	if n < 1024 {
		return fmt.Sprintf("%d B", n)
	}
	if n < 1024*1024 {
		return fmt.Sprintf("%.1f KB", float64(n)/1024)
	}
	return fmt.Sprintf("%.1f MB", float64(n)/(1024*1024))
}

func (d Deps) mediaRedirectQuery(c *gin.Context) string {
	q := url.Values{}
	if v := strings.TrimSpace(c.Query("q")); v != "" {
		q.Set("q", v)
	}
	if v := strings.TrimSpace(c.Query("category")); v != "" && v != "all" {
		q.Set("category", v)
	}
	if v := strings.TrimSpace(c.Query("page")); v != "" && v != "1" {
		q.Set("page", v)
	}
	// POST 表单也可带回筛选
	if v := strings.TrimSpace(c.PostForm("q")); v != "" {
		q.Set("q", v)
	}
	if v := strings.TrimSpace(c.PostForm("category")); v != "" && v != "all" {
		q.Set("category", v)
	}
	if v := strings.TrimSpace(c.PostForm("page")); v != "" && v != "1" {
		q.Set("page", v)
	}
	s := q.Encode()
	if s == "" {
		return "/admin/media"
	}
	return "/admin/media?" + s
}

// AdminMediaDeletePost 按 ID 删除单条
func (d Deps) AdminMediaDeletePost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminMedia(ctx, "无效请求，请重试")
		return
	}
	if d.Store == nil {
		d.renderAdminMedia(ctx, "上传存储未就绪")
		return
	}
	id64, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	n, err := d.Store.DeleteMediaByIDs([]uint{uint(id64)})
	if err != nil {
		d.renderAdminMedia(ctx, err.Error())
		return
	}
	if n == 0 {
		d.renderAdminMedia(ctx, "未找到可删除的媒体")
		return
	}
	ctx.SetFlash("已删除 1 项媒体")
	ctx.Redirect(d.mediaRedirectQuery(c))
}

// AdminMediaBatchDeletePost 批量删除
func (d Deps) AdminMediaBatchDeletePost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminMedia(ctx, "无效请求，请重试")
		return
	}
	if d.Store == nil {
		d.renderAdminMedia(ctx, "上传存储未就绪")
		return
	}
	raw := c.PostFormArray("ids")
	ids := make([]uint, 0, len(raw))
	for _, s := range raw {
		id64, err := strconv.ParseUint(strings.TrimSpace(s), 10, 64)
		if err != nil || id64 == 0 {
			continue
		}
		ids = append(ids, uint(id64))
	}
	if len(ids) == 0 {
		d.renderAdminMedia(ctx, "请选择要删除的文件")
		return
	}
	if len(ids) > 100 {
		d.renderAdminMedia(ctx, "单次最多删除 100 个文件")
		return
	}
	n, err := d.Store.DeleteMediaByIDs(ids)
	if err != nil {
		d.renderAdminMedia(ctx, err.Error())
		return
	}
	ctx.SetFlash(fmt.Sprintf("已删除 %d 项媒体", n))
	ctx.Redirect(d.mediaRedirectQuery(c))
}

// AdminMediaSyncPost 扫盘回填索引
func (d Deps) AdminMediaSyncPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderAdminMedia(ctx, "无效请求，请重试")
		return
	}
	if d.Store == nil {
		d.renderAdminMedia(ctx, "上传存储未就绪")
		return
	}
	n, err := d.Store.SyncMediaIndex()
	if err != nil {
		d.renderAdminMedia(ctx, err.Error())
		return
	}
	ctx.SetFlash(fmt.Sprintf("索引已同步（处理 %d 条）", n))
	ctx.Redirect("/admin/media")
}

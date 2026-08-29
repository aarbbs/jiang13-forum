package web

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/modules/webctx"
	"github.com/gin-gonic/gin"
)

func (d Deps) adminPostRedirect(postID uint) string {
	return fmt.Sprintf("/post/%d", postID)
}

func (d Deps) parseAdminPostID(c *gin.Context) (uint, string, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		return 0, "/", false
	}
	return uint(id), d.adminPostRedirect(uint(id)), true
}

func (d Deps) requireAdminPostCSRF(ctx *webctx.Context, redir string) bool {
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect(redir)
		return false
	}
	return true
}

func formBoolEnable(c *gin.Context) bool {
	v := strings.TrimSpace(c.PostForm("enable"))
	return v == "1" || strings.EqualFold(v, "true") || v == "on"
}

// AdminPostPinPost 全局置顶切换
func (d Deps) AdminPostPinPost(c *gin.Context) {
	ctx := d.ctx(c)
	id, redir, ok := d.parseAdminPostID(c)
	if !ok {
		ctx.Redirect("/")
		return
	}
	if !d.requireAdminPostCSRF(ctx, redir) {
		return
	}
	enable := formBoolEnable(c)
	if err := d.Post.SetPinned(id, enable); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(redir)
		return
	}
	if enable {
		ctx.SetFlash("已全局置顶")
	} else {
		ctx.SetFlash("已取消全局置顶")
	}
	ctx.Redirect(redir)
}

// AdminPostBoardPinPost 版内置顶切换
func (d Deps) AdminPostBoardPinPost(c *gin.Context) {
	ctx := d.ctx(c)
	id, redir, ok := d.parseAdminPostID(c)
	if !ok {
		ctx.Redirect("/")
		return
	}
	if !d.requireAdminPostCSRF(ctx, redir) {
		return
	}
	enable := formBoolEnable(c)
	if err := d.Post.SetBoardPinned(id, enable); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(redir)
		return
	}
	if enable {
		ctx.SetFlash("已版内置顶")
	} else {
		ctx.SetFlash("已取消版内置顶")
	}
	ctx.Redirect(redir)
}

// AdminPostFeaturePost 精华切换
func (d Deps) AdminPostFeaturePost(c *gin.Context) {
	ctx := d.ctx(c)
	id, redir, ok := d.parseAdminPostID(c)
	if !ok {
		ctx.Redirect("/")
		return
	}
	if !d.requireAdminPostCSRF(ctx, redir) {
		return
	}
	enable := formBoolEnable(c)
	if err := d.Post.SetFeatured(id, enable); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(redir)
		return
	}
	if enable {
		ctx.SetFlash("已设为精华")
	} else {
		ctx.SetFlash("已取消精华")
	}
	ctx.Redirect(redir)
}

// AdminPostEditLockPost 禁止编辑切换
func (d Deps) AdminPostEditLockPost(c *gin.Context) {
	ctx := d.ctx(c)
	id, redir, ok := d.parseAdminPostID(c)
	if !ok {
		ctx.Redirect("/")
		return
	}
	if !d.requireAdminPostCSRF(ctx, redir) {
		return
	}
	enable := formBoolEnable(c)
	if err := d.Post.SetEditLocked(id, enable); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(redir)
		return
	}
	if enable {
		ctx.SetFlash("已禁止编辑")
	} else {
		ctx.SetFlash("已允许编辑")
	}
	ctx.Redirect(redir)
}

// AdminPostCommentsLockPost 禁止评论切换
func (d Deps) AdminPostCommentsLockPost(c *gin.Context) {
	ctx := d.ctx(c)
	id, redir, ok := d.parseAdminPostID(c)
	if !ok {
		ctx.Redirect("/")
		return
	}
	if !d.requireAdminPostCSRF(ctx, redir) {
		return
	}
	enable := formBoolEnable(c)
	if err := d.Post.SetCommentsLocked(id, enable); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(redir)
		return
	}
	if enable {
		ctx.SetFlash("已锁定评论")
	} else {
		ctx.SetFlash("已解锁评论")
	}
	ctx.Redirect(redir)
}

// AdminPostDeletePost 软删进回收站
func (d Deps) AdminPostDeletePost(c *gin.Context) {
	ctx := d.ctx(c)
	id, redir, ok := d.parseAdminPostID(c)
	if !ok {
		ctx.Redirect("/")
		return
	}
	if !d.requireAdminPostCSRF(ctx, redir) {
		return
	}
	if err := d.Post.Delete(ctx.UserID(), id, true); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(redir)
		return
	}
	ctx.SetFlash("帖子已移入回收站")
	ctx.Redirect("/admin/trash")
}

type adminTrashRow struct {
	ID           uint
	Title        string
	AuthorName   string
	BoardName    string
	DeletedLabel string
}

type adminTrashData struct {
	AdminChrome
	Items    []adminTrashRow
	Page     int
	HasPrev  bool
	HasMore  bool
	PrevPage int
	NextPage int
	Keyword  string
}

// AdminTrashGet 回收站
func (d Deps) AdminTrashGet(c *gin.Context) {
	ctx := d.ctx(c)
	d.renderAdminTrash(ctx, "")
}

func (d Deps) renderAdminTrash(ctx *webctx.Context, errMsg string) {
	chrome := d.adminChrome(ctx, "回收站", "trash")
	chrome.Error = errMsg
	page, _ := strconv.Atoi(ctx.C.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	keyword := strings.TrimSpace(ctx.C.Query("keyword"))
	size := d.Settings.PageSizeDefault()
	data := adminTrashData{
		AdminChrome: chrome,
		Page:        page,
		PrevPage:    page - 1,
		NextPage:    page + 1,
		HasPrev:     page > 1,
		Keyword:     keyword,
	}
	list, total, err := d.Post.ListTrash(page, size, keyword)
	if err != nil {
		data.Error = err.Error()
		ctx.HTML(http.StatusOK, "admin/trash", data)
		return
	}
	data.HasMore = int64(page*size) < total
	data.Items = make([]adminTrashRow, 0, len(list))
	for _, it := range list {
		author := strings.TrimSpace(it.User.Nickname)
		if author == "" {
			author = it.User.Username
		}
		bname := ""
		if it.Board.ID > 0 {
			bname = it.Board.Name
		}
		data.Items = append(data.Items, adminTrashRow{
			ID: it.ID, Title: it.Title, AuthorName: author, BoardName: bname,
			DeletedLabel: it.DeletedAt.Local().Format("2006-01-02 15:04"),
		})
	}
	ctx.HTML(http.StatusOK, "admin/trash", data)
}

// AdminTrashRestorePost 恢复
func (d Deps) AdminTrashRestorePost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect("/admin/trash")
		return
	}
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := d.Post.Restore(uint(id)); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect("/admin/trash")
		return
	}
	ctx.SetFlash("已恢复")
	ctx.Redirect(fmt.Sprintf("/post/%d", id))
}

// AdminTrashPurgePost 彻底删除
func (d Deps) AdminTrashPurgePost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect("/admin/trash")
		return
	}
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := d.Post.Purge(uint(id)); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect("/admin/trash")
		return
	}
	ctx.SetFlash("已彻底删除")
	ctx.Redirect("/admin/trash")
}

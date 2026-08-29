package web

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// PostReportPost 举报帖子
func (d Deps) PostReportPost(c *gin.Context) {
	ctx := d.ctx(c)
	postID, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	redir := fmt.Sprintf("/post/%d", postID)
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect(redir)
		return
	}
	if d.Report == nil {
		ctx.SetFlash("举报服务未就绪")
		ctx.Redirect(redir)
		return
	}
	if d.Limiter != nil && !d.Limiter.Allow("report", fmt.Sprintf("%d", ctx.UserID())) {
		ctx.SetFlash("举报过于频繁，请稍后再试")
		ctx.Redirect(redir)
		return
	}
	reason := strings.TrimSpace(c.PostForm("reason"))
	detail := strings.TrimSpace(c.PostForm("detail"))
	if _, err := d.Report.Create(ctx.UserID(), uint(postID), reason, detail); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(redir)
		return
	}
	ctx.SetFlash("举报已提交，感谢反馈")
	ctx.Redirect(redir)
}

// CommentReportPost 举报评论
func (d Deps) CommentReportPost(c *gin.Context) {
	ctx := d.ctx(c)
	postID, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	cid, _ := strconv.ParseUint(c.Param("cid"), 10, 64)
	redir := fmt.Sprintf("/post/%d", postID)
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect(redir)
		return
	}
	if d.Report == nil {
		ctx.SetFlash("举报服务未就绪")
		ctx.Redirect(redir)
		return
	}
	if d.Limiter != nil && !d.Limiter.Allow("report", fmt.Sprintf("%d", ctx.UserID())) {
		ctx.SetFlash("举报过于频繁，请稍后再试")
		ctx.Redirect(redir)
		return
	}
	reason := strings.TrimSpace(c.PostForm("reason"))
	detail := strings.TrimSpace(c.PostForm("detail"))
	if _, err := d.Report.CreateCommentReport(ctx.UserID(), uint(cid), reason, detail); err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect(redir)
		return
	}
	ctx.SetFlash("举报已提交，感谢反馈")
	ctx.Redirect(redir)
}

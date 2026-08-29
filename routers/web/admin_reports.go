package web

import (
	"net/http"
	"strconv"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/modules/webctx"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

type adminReportRow struct {
	ID             uint
	CreatedAt      string
	Status         string
	StatusLabel    string
	ReasonLabel    string
	Detail         string
	ReporterName   string
	TargetLabel    string
	PostID         uint
	IsComment      bool
	Pending        bool
}

type adminReportsData struct {
	AdminChrome
	Reports      []adminReportRow
	PendingCount int64
	StatusFilter string
	Page         int
	HasPrev      bool
	HasMore      bool
	PrevPage     int
	NextPage     int
}

// AdminReportsGet 举报列表
func (d Deps) AdminReportsGet(c *gin.Context) {
	ctx := d.ctx(c)
	d.renderAdminReports(ctx, "")
}

func (d Deps) renderAdminReports(ctx *webctx.Context, errMsg string) {
	chrome := d.adminChrome(ctx, "举报", "reports")
	chrome.Error = errMsg
	status := strings.TrimSpace(ctx.C.DefaultQuery("status", "pending"))
	if status == "" {
		status = "pending"
	}
	page, _ := strconv.Atoi(ctx.C.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	data := adminReportsData{
		AdminChrome:  chrome,
		StatusFilter: status,
		Page:         page,
		PrevPage:     page - 1,
		NextPage:     page + 1,
		HasPrev:      page > 1,
	}
	if d.Report != nil {
		data.PendingCount, _ = d.Report.PendingCount()
		list, total, _ := d.Report.ListAdmin(services.ReportListQuery{
			Status: status, Page: page, Size: d.Settings.PageSizeDefault(),
		})
		data.HasMore = int64(page*d.Settings.PageSizeDefault()) < total
		data.Reports = make([]adminReportRow, 0, len(list))
		for _, r := range list {
			row := adminReportRow{
				ID: r.ID, CreatedAt: r.CreatedAt.Format("2006-01-02 15:04"),
				Status: r.Status, StatusLabel: reportStatusLabel(r.Status),
				ReasonLabel: services.ReportReasonLabel(r.Reason), Detail: r.Detail,
				PostID: r.PostID, Pending: r.Status == models.ReportStatusPending,
			}
			if r.Reporter.ID > 0 {
				row.ReporterName = r.Reporter.Username
			}
			isComment := r.CommentID != nil && *r.CommentID > 0
			row.IsComment = isComment
			title := ""
			if r.Post.ID > 0 {
				title = r.Post.Title
			}
			if isComment {
				floor := 0
				if r.Comment != nil {
					floor = r.Comment.Floor
				}
				row.TargetLabel = "评论 #" + strconv.Itoa(floor) + " · 《" + title + "》"
			} else {
				row.TargetLabel = "帖子 · 《" + title + "》"
			}
			data.Reports = append(data.Reports, row)
		}
	}
	ctx.HTML(http.StatusOK, "admin/reports", data)
}

// AdminReportHandlePost 处理举报
func (d Deps) AdminReportHandlePost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect("/admin/reports")
		return
	}
	if d.Report == nil {
		ctx.SetFlash("举报服务未就绪")
		ctx.Redirect("/admin/reports")
		return
	}
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	action := strings.TrimSpace(c.PostForm("action"))
	if _, err := d.Report.Handle(services.HandleReportInput{
		ReportID:     uint(id),
		HandlerID:    ctx.UserID(),
		Action:       action,
		HandleNote:   strings.TrimSpace(c.PostForm("handle_note")),
		RejectReason: strings.TrimSpace(c.PostForm("reject_reason")),
	}); err != nil {
		d.renderAdminReports(ctx, err.Error())
		return
	}
	ctx.SetFlash("举报已处理")
	ctx.Redirect("/admin/reports?status=pending")
}

func reportStatusLabel(s string) string {
	switch s {
	case models.ReportStatusPending:
		return "待处理"
	case models.ReportStatusResolved:
		return "已处理"
	case models.ReportStatusDismissed:
		return "已驳回"
	default:
		return s
	}
}

package services

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"git.iioio.com/freefire/jiang13-forum/models"
	"gorm.io/gorm"
)

var (
	ErrReportNotFound         = errors.New("举报不存在")
	ErrReportAlreadyExists    = errors.New("你已举报过该内容，请等待处理")
	ErrCannotReportOwnPost    = errors.New("不能举报自己的帖子")
	ErrCannotReportOwnComment = errors.New("不能举报自己的评论")
)

type ReportService struct {
	filter   *SensitiveFilter
	settings *ForumSettingsService
	messages *MessageService
	posts    *PostService
	comments *CommentService
}

func NewReportService(
	filter *SensitiveFilter,
	settings *ForumSettingsService,
	messages *MessageService,
	posts *PostService,
	comments *CommentService,
) *ReportService {
	return &ReportService{filter: filter, settings: settings, messages: messages, posts: posts, comments: comments}
}

func normalizeReportReason(reason string) (string, error) {
	switch strings.TrimSpace(reason) {
	case models.ReportReasonSpam,
		models.ReportReasonAbuse,
		models.ReportReasonIllegal,
		models.ReportReasonIrrelevant,
		models.ReportReasonOther:
		return reason, nil
	default:
		return "", errors.New("请选择有效的举报原因")
	}
}

func ReportReasonLabel(reason string) string {
	switch reason {
	case models.ReportReasonSpam:
		return "垃圾广告"
	case models.ReportReasonAbuse:
		return "人身攻击 / 辱骂"
	case models.ReportReasonIllegal:
		return "违法违规"
	case models.ReportReasonIrrelevant:
		return "内容无关 / 灌水"
	case models.ReportReasonOther:
		return "其他"
	default:
		return reason
	}
}

// Create 用户举报帖子
func (s *ReportService) Create(reporterID, postID uint, reason, detail string) (*models.PostReport, error) {
	reason, err := normalizeReportReason(reason)
	if err != nil {
		return nil, err
	}
	detail = strings.TrimSpace(detail)
	if utf8.RuneCountInString(detail) > 500 {
		return nil, errors.New("补充说明过长")
	}
	if s.filter != nil && detail != "" {
		detail = s.filter.Filter(detail)
	}

	var post models.Post
	if err := models.DB.Select("id", "user_id", "title").First(&post, postID).Error; err != nil {
		return nil, ErrPostNotFound
	}
	if post.UserID == reporterID {
		return nil, ErrCannotReportOwnPost
	}

	var existing int64
	models.DB.Model(&models.PostReport{}).
		Where("post_id = ? AND reporter_id = ? AND status = ?", postID, reporterID, models.ReportStatusPending).
		Count(&existing)
	if existing > 0 {
		return nil, ErrReportAlreadyExists
	}

	rep := &models.PostReport{
		PostID:     postID,
		ReporterID: reporterID,
		Reason:     reason,
		Detail:     detail,
		Status:     models.ReportStatusPending,
	}
	if err := models.DB.Create(rep).Error; err != nil {
		return nil, err
	}
	_ = models.DB.Preload("Post").Preload("Reporter").First(rep, rep.ID).Error
	return rep, nil
}

// CreateCommentReport 用户举报评论
func (s *ReportService) CreateCommentReport(reporterID, commentID uint, reason, detail string) (*models.PostReport, error) {
	reason, err := normalizeReportReason(reason)
	if err != nil {
		return nil, err
	}
	detail = strings.TrimSpace(detail)
	if utf8.RuneCountInString(detail) > 500 {
		return nil, errors.New("补充说明过长")
	}
	if s.filter != nil && detail != "" {
		detail = s.filter.Filter(detail)
	}

	comment, err := s.comments.GetByID(commentID)
	if err != nil {
		return nil, err
	}
	if comment.UserID > 0 && comment.UserID == reporterID {
		return nil, ErrCannotReportOwnComment
	}

	var existing int64
	models.DB.Model(&models.PostReport{}).
		Where("comment_id = ? AND reporter_id = ? AND status = ?", commentID, reporterID, models.ReportStatusPending).
		Count(&existing)
	if existing > 0 {
		return nil, ErrReportAlreadyExists
	}

	cid := commentID
	rep := &models.PostReport{
		PostID:     comment.PostID,
		CommentID:  &cid,
		ReporterID: reporterID,
		Reason:     reason,
		Detail:     detail,
		Status:     models.ReportStatusPending,
	}
	if err := models.DB.Create(rep).Error; err != nil {
		return nil, err
	}
	_ = models.DB.Preload("Post").Preload("Comment").Preload("Reporter").First(rep, rep.ID).Error
	return rep, nil
}

type ReportListQuery struct {
	Status string
	Page   int
	Size   int
}

// ListAdmin 管理员举报列表
func (s *ReportService) ListAdmin(q ReportListQuery) ([]models.PostReport, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	q.Size = s.settings.NormalizePageSize(q.Size)

	db := models.DB.Model(&models.PostReport{})
	if q.Status != "" && q.Status != "all" {
		db = db.Where("status = ?", q.Status)
	}

	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var list []models.PostReport
	err := db.Preload("Post", func(tx *gorm.DB) *gorm.DB {
		return tx.Unscoped()
	}).Preload("Post.User").Preload("Comment", func(tx *gorm.DB) *gorm.DB {
		return tx.Unscoped()
	}).Preload("Comment.User").Preload("Reporter").Preload("Handler").
		Order("CASE WHEN status = 'pending' THEN 0 ELSE 1 END, id DESC").
		Offset((q.Page - 1) * q.Size).
		Limit(q.Size).
		Find(&list).Error
	return list, total, err
}

// PendingCount 待处理举报数
func (s *ReportService) PendingCount() (int64, error) {
	var n int64
	err := models.DB.Model(&models.PostReport{}).
		Where("status = ?", models.ReportStatusPending).
		Count(&n).Error
	return n, err
}

type HandleReportInput struct {
	ReportID     uint
	HandlerID    uint
	Action       string // dismiss | resolve | reject_post | reject_comment
	HandleNote   string
	RejectReason string // reject_post / reject_comment 时发给作者
}

// Handle 处理举报
func (s *ReportService) Handle(in HandleReportInput) (*models.PostReport, error) {
	var rep models.PostReport
	if err := models.DB.Preload("Post", func(tx *gorm.DB) *gorm.DB {
		return tx.Unscoped()
	}).Preload("Comment", func(tx *gorm.DB) *gorm.DB {
		return tx.Unscoped()
	}).First(&rep, in.ReportID).Error; err != nil {
		return nil, ErrReportNotFound
	}
	if rep.Status != models.ReportStatusPending {
		return nil, errors.New("该举报已处理")
	}

	note := strings.TrimSpace(in.HandleNote)
	if utf8.RuneCountInString(note) > 500 {
		return nil, errors.New("处理备注过长")
	}

	now := time.Now()
	handlerID := in.HandlerID
	rep.HandlerID = &handlerID
	rep.HandleNote = note
	rep.HandledAt = &now

	postID := rep.PostID
	postTitle := ""
	authorID := uint(0)
	if rep.Post.ID > 0 {
		postTitle = rep.Post.Title
		authorID = rep.Post.UserID
	}
	isCommentReport := rep.CommentID != nil && *rep.CommentID > 0
	commentAuthorID := uint(0)
	commentFloor := 0
	if isCommentReport && rep.Comment != nil {
		commentAuthorID = rep.Comment.UserID
		commentFloor = rep.Comment.Floor
	}

	switch in.Action {
	case "dismiss":
		rep.Status = models.ReportStatusDismissed
	case "resolve":
		rep.Status = models.ReportStatusResolved
	case "reject_post":
		if isCommentReport {
			return nil, errors.New("评论举报请使用「拒绝该评论」")
		}
		reason := strings.TrimSpace(in.RejectReason)
		if reason == "" {
			return nil, errors.New("请填写拒绝原因（将私信通知作者）")
		}
		if utf8.RuneCountInString(reason) > 1000 {
			return nil, errors.New("拒绝原因过长")
		}
		if err := s.posts.SetStatus(postID, models.ContentStatusRejected); err != nil {
			return nil, err
		}
		rep.Status = models.ReportStatusResolved
		if note == "" {
			rep.HandleNote = "已拒绝该帖并通知作者"
		}
		if authorID > 0 {
			pid := postID
			rid := rep.ID
			_, _ = s.messages.SendSystem(
				authorID,
				fmt.Sprintf("帖子《%s》未通过审核", postTitle),
				FormatRejectContent(postTitle, postID, reason),
				models.MessageKindReject,
				&pid,
				&rid,
			)
		}
	case "reject_comment":
		if !isCommentReport {
			return nil, errors.New("仅评论举报可拒绝评论")
		}
		reason := strings.TrimSpace(in.RejectReason)
		if reason == "" {
			return nil, errors.New("请填写拒绝原因（将私信通知作者）")
		}
		if utf8.RuneCountInString(reason) > 1000 {
			return nil, errors.New("拒绝原因过长")
		}
		if err := s.comments.SetStatus(*rep.CommentID, models.ContentStatusRejected); err != nil {
			return nil, err
		}
		rep.Status = models.ReportStatusResolved
		if note == "" {
			rep.HandleNote = "已拒绝该评论并通知作者"
		}
		if commentAuthorID > 0 {
			pid := postID
			rid := rep.ID
			body := fmt.Sprintf("你在帖子《%s》下的评论（#%d）未通过审核。\n\n原因：\n%s", postTitle, commentFloor, reason)
			_, _ = s.messages.SendSystem(
				commentAuthorID,
				fmt.Sprintf("评论未通过审核 · 《%s》", postTitle),
				body,
				models.MessageKindReject,
				&pid,
				&rid,
			)
		}
	default:
		return nil, errors.New("无效的处理操作")
	}

	if err := models.DB.Save(&rep).Error; err != nil {
		return nil, err
	}

	// 通知举报人处理结果
	resultText := "已忽略"
	if rep.Status == models.ReportStatusResolved {
		switch in.Action {
		case "reject_post":
			resultText = "已核实并下架该帖"
		case "reject_comment":
			resultText = "已核实并处理该评论"
		default:
			resultText = "已处理"
		}
	}
	targetDesc := fmt.Sprintf("帖子《%s》（#%d）", postTitle, postID)
	if isCommentReport {
		targetDesc = fmt.Sprintf("帖子《%s》下的评论（#%d）", postTitle, commentFloor)
	}
	content := fmt.Sprintf("你举报的%s已处理：%s。", targetDesc, resultText)
	if note != "" {
		content += "\n\n管理员备注：\n" + note
	}
	pid := postID
	rid := rep.ID
	_, _ = s.messages.SendSystem(
		rep.ReporterID,
		"举报处理结果通知",
		content,
		models.MessageKindReportResult,
		&pid,
		&rid,
	)

	_ = models.DB.Preload("Post", func(tx *gorm.DB) *gorm.DB {
		return tx.Unscoped()
	}).Preload("Comment", func(tx *gorm.DB) *gorm.DB {
		return tx.Unscoped()
	}).Preload("Reporter").Preload("Handler").First(&rep, rep.ID).Error
	return &rep, nil
}

package service

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"git.iioio.com/freefire/jiang13-forum/model"
	"gorm.io/gorm"
)

var (
	ErrReportNotFound      = errors.New("举报不存在")
	ErrReportAlreadyExists = errors.New("你已举报过该帖子，请等待处理")
	ErrCannotReportOwnPost = errors.New("不能举报自己的帖子")
)

type ReportService struct {
	filter   *SensitiveFilter
	settings *ForumSettingsService
	messages *MessageService
	posts    *PostService
}

func NewReportService(
	filter *SensitiveFilter,
	settings *ForumSettingsService,
	messages *MessageService,
	posts *PostService,
) *ReportService {
	return &ReportService{filter: filter, settings: settings, messages: messages, posts: posts}
}

func normalizeReportReason(reason string) (string, error) {
	switch strings.TrimSpace(reason) {
	case model.ReportReasonSpam,
		model.ReportReasonAbuse,
		model.ReportReasonIllegal,
		model.ReportReasonIrrelevant,
		model.ReportReasonOther:
		return reason, nil
	default:
		return "", errors.New("请选择有效的举报原因")
	}
}

func ReportReasonLabel(reason string) string {
	switch reason {
	case model.ReportReasonSpam:
		return "垃圾广告"
	case model.ReportReasonAbuse:
		return "人身攻击 / 辱骂"
	case model.ReportReasonIllegal:
		return "违法违规"
	case model.ReportReasonIrrelevant:
		return "内容无关 / 灌水"
	case model.ReportReasonOther:
		return "其他"
	default:
		return reason
	}
}

// Create 用户举报帖子
func (s *ReportService) Create(reporterID, postID uint, reason, detail string) (*model.PostReport, error) {
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

	var post model.Post
	if err := model.DB.Select("id", "user_id", "title").First(&post, postID).Error; err != nil {
		return nil, ErrPostNotFound
	}
	if post.UserID == reporterID {
		return nil, ErrCannotReportOwnPost
	}

	var existing int64
	model.DB.Model(&model.PostReport{}).
		Where("post_id = ? AND reporter_id = ? AND status = ?", postID, reporterID, model.ReportStatusPending).
		Count(&existing)
	if existing > 0 {
		return nil, ErrReportAlreadyExists
	}

	rep := &model.PostReport{
		PostID:     postID,
		ReporterID: reporterID,
		Reason:     reason,
		Detail:     detail,
		Status:     model.ReportStatusPending,
	}
	if err := model.DB.Create(rep).Error; err != nil {
		return nil, err
	}
	_ = model.DB.Preload("Post").Preload("Reporter").First(rep, rep.ID).Error
	return rep, nil
}

type ReportListQuery struct {
	Status string
	Page   int
	Size   int
}

// ListAdmin 管理员举报列表
func (s *ReportService) ListAdmin(q ReportListQuery) ([]model.PostReport, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	q.Size = s.settings.NormalizePageSize(q.Size)

	db := model.DB.Model(&model.PostReport{})
	if q.Status != "" && q.Status != "all" {
		db = db.Where("status = ?", q.Status)
	}

	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var list []model.PostReport
	err := db.Preload("Post", func(tx *gorm.DB) *gorm.DB {
		return tx.Unscoped()
	}).Preload("Post.User").Preload("Reporter").Preload("Handler").
		Order("CASE WHEN status = 'pending' THEN 0 ELSE 1 END, id DESC").
		Offset((q.Page - 1) * q.Size).
		Limit(q.Size).
		Find(&list).Error
	return list, total, err
}

// PendingCount 待处理举报数
func (s *ReportService) PendingCount() (int64, error) {
	var n int64
	err := model.DB.Model(&model.PostReport{}).
		Where("status = ?", model.ReportStatusPending).
		Count(&n).Error
	return n, err
}

type HandleReportInput struct {
	ReportID   uint
	HandlerID  uint
	Action     string // dismiss | resolve | reject_post
	HandleNote string
	RejectReason string // reject_post 时必填，发给作者
}

// Handle 处理举报
func (s *ReportService) Handle(in HandleReportInput) (*model.PostReport, error) {
	var rep model.PostReport
	if err := model.DB.Preload("Post", func(tx *gorm.DB) *gorm.DB {
		return tx.Unscoped()
	}).First(&rep, in.ReportID).Error; err != nil {
		return nil, ErrReportNotFound
	}
	if rep.Status != model.ReportStatusPending {
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

	switch in.Action {
	case "dismiss":
		rep.Status = model.ReportStatusDismissed
	case "resolve":
		rep.Status = model.ReportStatusResolved
	case "reject_post":
		reason := strings.TrimSpace(in.RejectReason)
		if reason == "" {
			return nil, errors.New("请填写拒绝原因（将私信通知作者）")
		}
		if utf8.RuneCountInString(reason) > 1000 {
			return nil, errors.New("拒绝原因过长")
		}
		if err := s.posts.SetStatus(postID, model.ContentStatusRejected); err != nil {
			return nil, err
		}
		rep.Status = model.ReportStatusResolved
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
				model.MessageKindReject,
				&pid,
				&rid,
			)
		}
	default:
		return nil, errors.New("无效的处理操作")
	}

	if err := model.DB.Save(&rep).Error; err != nil {
		return nil, err
	}

	// 通知举报人处理结果
	resultText := "已忽略"
	if rep.Status == model.ReportStatusResolved {
		if in.Action == "reject_post" {
			resultText = "已核实并下架该帖"
		} else {
			resultText = "已处理"
		}
	}
	content := fmt.Sprintf(
		"你举报的帖子《%s》（#%d）已处理：%s。",
		postTitle, postID, resultText,
	)
	if note != "" {
		content += "\n\n管理员备注：\n" + note
	}
	pid := postID
	rid := rep.ID
	_, _ = s.messages.SendSystem(
		rep.ReporterID,
		"举报处理结果通知",
		content,
		model.MessageKindReportResult,
		&pid,
		&rid,
	)

	_ = model.DB.Preload("Post", func(tx *gorm.DB) *gorm.DB {
		return tx.Unscoped()
	}).Preload("Reporter").Preload("Handler").First(&rep, rep.ID).Error
	return &rep, nil
}

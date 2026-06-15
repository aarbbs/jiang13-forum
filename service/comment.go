package service

import (
	"errors"
	"net/mail"
	"net/url"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/model"
)

type CommentService struct {
	filter   *SensitiveFilter
	settings *ForumSettingsService
}

func NewCommentService(filter *SensitiveFilter, settings *ForumSettingsService) *CommentService {
	return &CommentService{filter: filter, settings: settings}
}

type CommentCreateInput struct {
	UserID     uint
	PostID     uint
	Content    string
	ReplyTo    *uint
	GuestNick  string
	GuestEmail string
	GuestURL   string
	IsPrivate  bool
}

func (s *CommentService) canViewPrivate(c model.Comment, viewerID uint, isAdmin bool, postAuthorID uint, guestSet map[uint]struct{}) bool {
	if !c.IsPrivate {
		return true
	}
	if isAdmin {
		return true
	}
	if viewerID > 0 && viewerID == postAuthorID {
		return true
	}
	if c.UserID > 0 && viewerID == c.UserID {
		return true
	}
	if _, ok := guestSet[c.ID]; ok {
		return true
	}
	return false
}

func (s *CommentService) fillReplyTargets(comments []model.Comment, loadMissing bool) {
	idMap := make(map[uint]model.Comment, len(comments))
	for _, c := range comments {
		idMap[c.ID] = c
	}
	for i := range comments {
		if comments[i].ReplyTo == nil {
			continue
		}
		if target, ok := idMap[*comments[i].ReplyTo]; ok {
			t := target
			comments[i].ReplyTarget = &t
			continue
		}
		if loadMissing {
			var target model.Comment
			if model.DB.Preload("User").First(&target, *comments[i].ReplyTo).Error == nil {
				comments[i].ReplyTarget = &target
			}
		}
	}
}

func (s *CommentService) ListByPost(postID, viewerID uint, isAdmin bool, postAuthorID uint, visibleGuestIDs []uint) ([]model.Comment, error) {
	var comments []model.Comment
	err := model.DB.Preload("User").Where("post_id = ?", postID).Order("floor asc").Find(&comments).Error
	if err != nil {
		return nil, err
	}

	guestSet := make(map[uint]struct{}, len(visibleGuestIDs))
	for _, id := range visibleGuestIDs {
		guestSet[id] = struct{}{}
	}

	for i := range comments {
		if comments[i].IsPrivate && !s.canViewPrivate(comments[i], viewerID, isAdmin, postAuthorID, guestSet) {
			comments[i].ContentHidden = true
			comments[i].Content = ""
		}
	}

	s.fillReplyTargets(comments, false)
	return comments, nil
}

func (s *CommentService) Create(in CommentCreateInput) (*model.Comment, error) {
	content := s.filter.Filter(strings.TrimSpace(in.Content))
	if content == "" {
		return nil, errors.New("评论内容不能为空")
	}
	if err := s.settings.ValidateTextLength(content, s.settings.CommentMax(), ErrCommentTooLong); err != nil {
		return nil, err
	}

	var post model.Post
	if err := model.DB.First(&post, in.PostID).Error; err != nil {
		return nil, ErrPostNotFound
	}

	if in.UserID > 0 {
		var user model.User
		if err := model.DB.First(&user, in.UserID).Error; err != nil {
			return nil, errors.New("用户不存在")
		}
		if user.Banned {
			return nil, errors.New("账号已被禁言")
		}
	} else {
		nick := strings.TrimSpace(in.GuestNick)
		if nick == "" {
			return nil, errors.New("请填写昵称")
		}
		if len([]rune(nick)) > 32 {
			return nil, errors.New("昵称过长")
		}
		if email := strings.TrimSpace(in.GuestEmail); email != "" {
			if _, err := mail.ParseAddress(email); err != nil {
				return nil, errors.New("邮箱格式不正确")
			}
		}
		if rawURL := strings.TrimSpace(in.GuestURL); rawURL != "" {
			u, err := url.ParseRequestURI(rawURL)
			if err != nil || u.Scheme == "" || u.Host == "" {
				return nil, errors.New("网址格式不正确")
			}
		}
	}

	var maxFloor int
	model.DB.Model(&model.Comment{}).Where("post_id = ?", in.PostID).Select("COALESCE(MAX(floor), 0)").Scan(&maxFloor)

	if in.ReplyTo != nil {
		var target model.Comment
		if err := model.DB.Where("id = ? AND post_id = ?", *in.ReplyTo, in.PostID).First(&target).Error; err != nil {
			return nil, ErrCommentNotFound
		}
	}

	comment := &model.Comment{
		PostID:     in.PostID,
		UserID:     in.UserID,
		Floor:      maxFloor + 1,
		Content:    content,
		ReplyTo:    in.ReplyTo,
		GuestNick:  strings.TrimSpace(in.GuestNick),
		GuestEmail: strings.TrimSpace(in.GuestEmail),
		GuestURL:   strings.TrimSpace(in.GuestURL),
		IsPrivate:  in.IsPrivate,
	}
	return comment, model.DB.Create(comment).Error
}

func (s *CommentService) Delete(userID, commentID uint, isAdmin bool) error {
	var comment model.Comment
	if err := model.DB.First(&comment, commentID).Error; err != nil {
		return ErrCommentNotFound
	}
	if !isAdmin && comment.UserID != userID {
		return ErrPermissionDenied
	}
	return model.DB.Delete(&comment).Error
}

func (s *CommentService) AdminDelete(commentID uint) error {
	return model.DB.Delete(&model.Comment{}, commentID).Error
}

// ListRecent 管理员查看最近评论
func (s *CommentService) ListRecent(page, size int) ([]model.Comment, int64, error) {
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 20
	}
	var total int64
	model.DB.Model(&model.Comment{}).Count(&total)
	var comments []model.Comment
	err := model.DB.Preload("User").Preload("Post").
		Order("id desc").Offset((page-1)*size).Limit(size).Find(&comments).Error
	if err != nil {
		return nil, 0, err
	}
	s.fillReplyTargets(comments, true)
	return comments, total, err
}

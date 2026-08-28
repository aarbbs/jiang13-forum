package service

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"git.iioio.com/freefire/jiang13-forum/model"
	"gorm.io/gorm"
)

var (
	ErrFriendLinkApplyPending  = errors.New("该 URL 已有待审核申请")
	ErrFriendLinkApplyExists   = errors.New("该 URL 已在友情链接中")
	ErrFriendLinkApplyNotFound = errors.New("申请不存在")
	ErrFriendLinkApplyHandled  = errors.New("申请已处理")
	ErrFriendLinkApplyFull     = errors.New("友情链接已达上限（20 条）")
)

const (
	maxFriendLinkApplyDesc = 200
)

type FriendLinkApplyListQuery struct {
	Page   int
	Size   int
	Status string
}

type FriendLinkApplyInput struct {
	UserID            uint
	Name              string
	URL               string
	Logo              string
	LinkOnHomepage    bool
	ReciprocalPageURL string
	OurSiteURL        string
}

type FriendLinkApplyCreateResult struct {
	Apply *model.FriendLinkApply
}

type FriendLinkApplyService struct {
	settings *ForumSettingsService
	messages *MessageService
}

func NewFriendLinkApplyService(settings *ForumSettingsService, messages *MessageService) *FriendLinkApplyService {
	return &FriendLinkApplyService{settings: settings, messages: messages}
}

func normalizeFriendLinkApplyURL(raw string) (string, error) {
	href := strings.TrimSpace(raw)
	if href == "" {
		return "", errors.New("请填写 URL")
	}
	u, err := url.Parse(href)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", errors.New("URL 格式无效")
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return "", errors.New("URL 需为 http 或 https")
	}
	return href, nil
}

func friendLinkURLKey(href string) string {
	u, err := url.Parse(strings.TrimSpace(href))
	if err != nil {
		return strings.ToLower(strings.TrimSpace(href))
	}
	u.Scheme = strings.ToLower(u.Scheme)
	u.Host = strings.ToLower(u.Host)
	u.Path = strings.TrimSuffix(u.Path, "/")
	return u.String()
}

func (s *FriendLinkApplyService) urlInFriendLinks(href string) bool {
	key := friendLinkURLKey(href)
	brand := s.settings.SiteBranding()
	for _, l := range brand.FriendLinks {
		if friendLinkURLKey(l.URL) == key {
			return true
		}
	}
	return false
}

// Create 提交友链申请
func (s *FriendLinkApplyService) Create(in FriendLinkApplyInput) (*FriendLinkApplyCreateResult, error) {
	name, href, logo, reciprocal, err := s.prepareApplyFields(in, "")
	if err != nil {
		return nil, err
	}

	dup, err := s.hasPendingApplyForURL(in.UserID, 0, href)
	if err != nil {
		return nil, err
	}
	if dup {
		return nil, ErrFriendLinkApplyPending
	}

	apply := &model.FriendLinkApply{
		UserID:            in.UserID,
		Name:              name,
		URL:               href,
		Logo:              logo,
		ReciprocalPageURL: reciprocal,
		LinkOnHomepage:    in.LinkOnHomepage,
		Status:            model.FriendLinkApplyStatusPending,
	}
	if err := model.DB.Create(apply).Error; err != nil {
		return nil, err
	}
	s.startReciprocalCheck(apply.ID, reciprocal, in.OurSiteURL)
	_ = model.DB.Preload("User").First(apply, apply.ID).Error
	return &FriendLinkApplyCreateResult{Apply: apply}, nil
}

// PendingCount 待审数量
func (s *FriendLinkApplyService) PendingCount() (int64, error) {
	var n int64
	err := model.DB.Model(&model.FriendLinkApply{}).
		Where("status = ?", model.FriendLinkApplyStatusPending).
		Count(&n).Error
	return n, err
}

// ListAdmin 管理员列表
func (s *FriendLinkApplyService) ListAdmin(q FriendLinkApplyListQuery) ([]model.FriendLinkApply, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Size < 1 || q.Size > 50 {
		q.Size = 20
	}
	db := model.DB.Model(&model.FriendLinkApply{})
	status := strings.TrimSpace(q.Status)
	if status != "" && status != "all" {
		db = db.Where("status = ?", status)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.FriendLinkApply
	err := db.Preload("User").
		Order("CASE WHEN status = 'pending' THEN 0 ELSE 1 END, id DESC").
		Offset((q.Page - 1) * q.Size).
		Limit(q.Size).
		Find(&list).Error
	if err != nil {
		return nil, 0, err
	}
	return list, total, nil
}

func (s *FriendLinkApplyService) getPending(id uint) (*model.FriendLinkApply, error) {
	var apply model.FriendLinkApply
	if err := model.DB.Preload("User").First(&apply, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrFriendLinkApplyNotFound
		}
		return nil, err
	}
	if apply.Status != model.FriendLinkApplyStatusPending {
		return nil, ErrFriendLinkApplyHandled
	}
	return &apply, nil
}

// Approve 通过申请并写入友链
func (s *FriendLinkApplyService) Approve(id uint) (*model.FriendLinkApply, error) {
	apply, err := s.getPending(id)
	if err != nil {
		return nil, err
	}
	if s.urlInFriendLinks(apply.URL) {
		return nil, ErrFriendLinkApplyExists
	}

	brand := s.settings.SiteBranding()
	if len(brand.FriendLinks) >= maxFriendLinks {
		return nil, ErrFriendLinkApplyFull
	}
	nextLinks := append(brand.FriendLinks, FriendLink{
		Name: apply.Name,
		URL:  apply.URL,
		Logo: normalizeFriendLinkLogoOptional(apply.Logo),
	})
	if err := s.settings.UpdateSiteBranding(SiteBranding{
		Name:        brand.Name,
		Slogan:      brand.Slogan,
		Description: brand.Description,
		Keywords:    brand.Keywords,
		LogoMark:    brand.LogoMark,
		Logo:        brand.Logo,
		Favicon:     brand.Favicon,
		OGImage:     brand.OGImage,
		ICPBeian:    brand.ICPBeian,
		ICPBeianURL: brand.ICPBeianURL,
		FriendLinks: nextLinks,
	}); err != nil {
		return nil, err
	}

	now := time.Now()
	if err := model.DB.Model(apply).Updates(map[string]interface{}{
		"status":      model.FriendLinkApplyStatusApproved,
		"reviewed_at": now,
	}).Error; err != nil {
		return nil, err
	}
	apply.Status = model.FriendLinkApplyStatusApproved
	apply.ReviewedAt = &now

	if s.messages != nil && apply.UserID > 0 {
		subject := "友情链接申请已通过"
		content := fmt.Sprintf(
			"你申请的友情链接「%s」（%s）已通过审核，现已展示在友情链接页面。\n\n如有疑问，可回复本私信联系管理员。",
			apply.Name, apply.URL,
		)
		_, _ = s.messages.SendSystem(apply.UserID, subject, content, model.MessageKindSystem, nil, nil)
	}
	return apply, nil
}

// Reject 拒绝申请
func (s *FriendLinkApplyService) Reject(id uint, note string) (*model.FriendLinkApply, error) {
	apply, err := s.getPending(id)
	if err != nil {
		return nil, err
	}
	note = strings.TrimSpace(note)
	now := time.Now()
	if err := model.DB.Model(apply).Updates(map[string]interface{}{
		"status":      model.FriendLinkApplyStatusRejected,
		"review_note": note,
		"reviewed_at": now,
	}).Error; err != nil {
		return nil, err
	}
	apply.Status = model.FriendLinkApplyStatusRejected
	apply.ReviewNote = note
	apply.ReviewedAt = &now

	if s.messages != nil && apply.UserID > 0 {
		subject := "友情链接申请未通过"
		reason := note
		if reason == "" {
			reason = "未说明具体原因"
		}
		content := fmt.Sprintf(
			"你申请的友情链接「%s」（%s）未通过审核。\n\n原因：\n%s\n\n如有疑问，可回复本私信联系管理员。",
			apply.Name, apply.URL, reason,
		)
		_, _ = s.messages.SendSystem(apply.UserID, subject, content, model.MessageKindReject, nil, nil)
	}
	return apply, nil
}

func (s *FriendLinkApplyService) prepareApplyFields(in FriendLinkApplyInput, allowPublishedURL string) (name, href, logo, reciprocal string, err error) {
	name = strings.TrimSpace(in.Name)
	href, err = normalizeFriendLinkApplyURL(in.URL)
	if err != nil {
		return
	}
	logo, err = normalizeFriendLinkLogo(in.Logo)
	if err != nil {
		return
	}
	if name == "" {
		err = errors.New("请填写站点名称")
		return
	}
	if utf8.RuneCountInString(name) > maxFriendLinkName {
		err = fmt.Errorf("站点名称最多 %d 字", maxFriendLinkName)
		return
	}
	if s.urlInFriendLinks(href) && friendLinkURLKey(href) != friendLinkURLKey(allowPublishedURL) {
		err = ErrFriendLinkApplyExists
		return
	}

	reciprocal = strings.TrimSpace(in.ReciprocalPageURL)
	if in.LinkOnHomepage {
		reciprocal = href
	} else {
		reciprocal, err = normalizeFriendLinkApplyURL(reciprocal)
		if err != nil {
			err = errors.New("请填写添加本站链接的页面地址")
			return
		}
	}
	return
}

func (s *FriendLinkApplyService) hasPendingApplyForURL(userID, excludeID uint, href string) (bool, error) {
	db := model.DB.Model(&model.FriendLinkApply{}).
		Where("user_id = ? AND status = ? AND url = ?", userID, model.FriendLinkApplyStatusPending, href)
	if excludeID > 0 {
		db = db.Where("id <> ?", excludeID)
	}
	var pending int64
	if err := db.Count(&pending).Error; err != nil {
		return false, err
	}
	return pending > 0, nil
}

func (s *FriendLinkApplyService) removePublishedFriendLink(href string) error {
	key := friendLinkURLKey(href)
	brand := s.settings.SiteBranding()
	next := make([]FriendLink, 0, len(brand.FriendLinks))
	removed := false
	for _, l := range brand.FriendLinks {
		if friendLinkURLKey(l.URL) == key {
			removed = true
			continue
		}
		next = append(next, l)
	}
	if !removed {
		return nil
	}
	return s.settings.UpdateSiteBranding(SiteBranding{
		Name:        brand.Name,
		Slogan:      brand.Slogan,
		Description: brand.Description,
		Keywords:    brand.Keywords,
		LogoMark:    brand.LogoMark,
		Logo:        brand.Logo,
		Favicon:     brand.Favicon,
		OGImage:     brand.OGImage,
		ICPBeian:    brand.ICPBeian,
		ICPBeianURL: brand.ICPBeianURL,
		FriendLinks: next,
	})
}

// Update 修改并重新提交友链申请（待审 / 已拒绝 / 已通过）
func (s *FriendLinkApplyService) Update(userID, id uint, in FriendLinkApplyInput) (*FriendLinkApplyCreateResult, error) {
	var apply model.FriendLinkApply
	if err := model.DB.First(&apply, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrFriendLinkApplyNotFound
		}
		return nil, err
	}
	if apply.UserID != userID {
		return nil, errors.New("无权操作该申请")
	}
	if apply.Status != model.FriendLinkApplyStatusPending &&
		apply.Status != model.FriendLinkApplyStatusRejected &&
		apply.Status != model.FriendLinkApplyStatusApproved {
		return nil, errors.New("该申请不可修改")
	}

	wasApproved := apply.Status == model.FriendLinkApplyStatusApproved
	allowPublishedURL := ""
	if wasApproved {
		allowPublishedURL = apply.URL
	}

	name, href, logo, reciprocal, err := s.prepareApplyFields(in, allowPublishedURL)
	if err != nil {
		return nil, err
	}
	dup, err := s.hasPendingApplyForURL(userID, id, href)
	if err != nil {
		return nil, err
	}
	if dup {
		return nil, ErrFriendLinkApplyPending
	}

	if wasApproved {
		if err := s.removePublishedFriendLink(apply.URL); err != nil {
			return nil, err
		}
	}

	updates := map[string]interface{}{
		"name":                  name,
		"url":                   href,
		"logo":                  logo,
		"reciprocal_page_url":   reciprocal,
		"link_on_homepage":      in.LinkOnHomepage,
		"reciprocal_verified":   false,
		"reciprocal_check_note": "",
		"reciprocal_checked_at": nil,
		"status":                model.FriendLinkApplyStatusPending,
		"review_note":           "",
		"reviewed_at":           nil,
	}
	if err := model.DB.Model(&apply).Updates(updates).Error; err != nil {
		return nil, err
	}
	s.startReciprocalCheck(apply.ID, reciprocal, in.OurSiteURL)
	_ = model.DB.Preload("User").First(&apply, apply.ID).Error
	return &FriendLinkApplyCreateResult{Apply: &apply}, nil
}

// RecheckReciprocal 管理员触发重新检测回链
func (s *FriendLinkApplyService) RecheckReciprocal(id uint, ourSiteURL string) (*model.FriendLinkApply, error) {
	if !s.settings.FriendLinkReciprocalCheckEnabled() {
		return nil, errors.New("回链检测已关闭")
	}
	var apply model.FriendLinkApply
	if err := model.DB.Preload("User").First(&apply, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrFriendLinkApplyNotFound
		}
		return nil, err
	}
	if strings.TrimSpace(apply.ReciprocalPageURL) == "" {
		return nil, errors.New("该申请未填写回链页")
	}
	ResetReciprocalCheckState(apply.ID)
	EnqueueReciprocalCheck(apply.ID, apply.ReciprocalPageURL, ourSiteURL)
	apply.ReciprocalVerified = false
	apply.ReciprocalCheckNote = ""
	apply.ReciprocalCheckedAt = nil
	return &apply, nil
}

// startReciprocalCheck 按开关启动回链检测；关闭时标记为已结束，避免前台一直显示「检测中」
func (s *FriendLinkApplyService) startReciprocalCheck(applyID uint, pageURL, ourSiteURL string) {
	if s.settings.FriendLinkReciprocalCheckEnabled() {
		EnqueueReciprocalCheck(applyID, pageURL, ourSiteURL)
		return
	}
	now := time.Now()
	_ = model.DB.Model(&model.FriendLinkApply{}).Where("id = ?", applyID).Updates(map[string]interface{}{
		"reciprocal_verified":   false,
		"reciprocal_check_note": "",
		"reciprocal_checked_at": now,
	}).Error
}

// ListMine 当前用户的友链申请
func (s *FriendLinkApplyService) ListMine(userID uint) ([]model.FriendLinkApply, error) {
	var list []model.FriendLinkApply
	err := model.DB.Where("user_id = ?", userID).
		Order("id DESC").
		Limit(50).
		Find(&list).Error
	return list, err
}

// Cancel 撤销待审申请
func (s *FriendLinkApplyService) Cancel(userID, id uint) error {
	var apply model.FriendLinkApply
	if err := model.DB.First(&apply, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ErrFriendLinkApplyNotFound
		}
		return err
	}
	if apply.UserID != userID {
		return errors.New("无权操作该申请")
	}
	if apply.Status != model.FriendLinkApplyStatusPending {
		return ErrFriendLinkApplyHandled
	}
	return model.DB.Delete(&apply).Error
}

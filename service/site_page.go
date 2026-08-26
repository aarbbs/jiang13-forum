package service

import (
	"errors"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/model"
)

var (
	ErrSitePageNotFound = errors.New("单页不存在")
	ErrSitePageSlugUsed = errors.New("slug 已被占用")
)

// SitePageService 自定义单页
type SitePageService struct {
	filter *SensitiveFilter
}

func NewSitePageService(filter *SensitiveFilter) *SitePageService {
	return &SitePageService{filter: filter}
}

// SitePageSummary 公开列表摘要
type SitePageSummary struct {
	ID           uint   `json:"id"`
	Title        string `json:"title"`
	Slug         string `json:"slug"`
	ShowInFooter bool   `json:"show_in_footer"`
	ShowInNav    bool   `json:"show_in_nav"`
	SortOrder    int    `json:"sort_order"`
}

func (s *SitePageService) ListPublished() ([]SitePageSummary, error) {
	var rows []model.SitePage
	err := model.DB.Where("published = ?", true).
		Order("sort_order ASC, id ASC").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]SitePageSummary, len(rows))
	for i, p := range rows {
		out[i] = SitePageSummary{
			ID: p.ID, Title: p.Title, Slug: p.Slug,
			ShowInFooter: p.ShowInFooter, ShowInNav: p.ShowInNav, SortOrder: p.SortOrder,
		}
	}
	return out, nil
}

func (s *SitePageService) ListAll() ([]model.SitePage, error) {
	var rows []model.SitePage
	err := model.DB.Order("sort_order ASC, id ASC").Find(&rows).Error
	if err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *SitePageService) GetBySlug(slug string, allowUnpublished bool) (*model.SitePage, error) {
	slug, ok := NormalizePageSlug(slug)
	if !ok {
		return nil, ErrSitePageNotFound
	}
	var page model.SitePage
	q := model.DB.Where("slug = ?", slug)
	if !allowUnpublished {
		q = q.Where("published = ?", true)
	}
	if err := q.First(&page).Error; err != nil {
		return nil, ErrSitePageNotFound
	}
	page.Content = SanitizePostHTML(page.Content)
	return &page, nil
}

func (s *SitePageService) GetByID(id uint) (*model.SitePage, error) {
	var page model.SitePage
	if err := model.DB.First(&page, id).Error; err != nil {
		return nil, ErrSitePageNotFound
	}
	return &page, nil
}

type SitePageInput struct {
	Title        string `json:"title"`
	Slug         string `json:"slug"`
	Content      string `json:"content"`
	Published    bool   `json:"published"`
	SortOrder    int    `json:"sort_order"`
	ShowInFooter bool   `json:"show_in_footer"`
	ShowInNav    bool   `json:"show_in_nav"`
}

func (s *SitePageService) Create(in SitePageInput) (*model.SitePage, error) {
	page, err := s.normalizeInput(in)
	if err != nil {
		return nil, err
	}
	var exists int64
	model.DB.Model(&model.SitePage{}).Where("slug = ?", page.Slug).Count(&exists)
	if exists > 0 {
		return nil, ErrSitePageSlugUsed
	}
	if err := model.DB.Create(page).Error; err != nil {
		return nil, err
	}
	return page, nil
}

func (s *SitePageService) Update(id uint, in SitePageInput) error {
	page, err := s.GetByID(id)
	if err != nil {
		return err
	}
	next, err := s.normalizeInput(in)
	if err != nil {
		return err
	}
	var exists int64
	model.DB.Model(&model.SitePage{}).Where("slug = ? AND id <> ?", next.Slug, id).Count(&exists)
	if exists > 0 {
		return ErrSitePageSlugUsed
	}
	return model.DB.Model(page).Updates(map[string]interface{}{
		"title":          next.Title,
		"slug":           next.Slug,
		"content":        next.Content,
		"published":      next.Published,
		"sort_order":     next.SortOrder,
		"show_in_footer": next.ShowInFooter,
		"show_in_nav":    next.ShowInNav,
	}).Error
}

func (s *SitePageService) Delete(id uint) error {
	res := model.DB.Delete(&model.SitePage{}, id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrSitePageNotFound
	}
	return nil
}

func (s *SitePageService) ListSitemap(limit int) ([]model.SitePage, error) {
	if limit <= 0 {
		limit = 500
	}
	var rows []model.SitePage
	err := model.DB.Where("published = ?", true).
		Order("updated_at DESC").Limit(limit).Find(&rows).Error
	return rows, err
}

func (s *SitePageService) normalizeInput(in SitePageInput) (*model.SitePage, error) {
	title := s.filter.Filter(strings.TrimSpace(in.Title))
	slug, ok := NormalizePageSlug(in.Slug)
	if !ok {
		return nil, errors.New("slug 格式无效（2-64 位小写字母、数字、连字符）")
	}
	content := s.filter.Filter(SanitizePostHTML(in.Content))
	if title == "" {
		return nil, errors.New("标题不能为空")
	}
	if content == "" {
		return nil, errors.New("正文不能为空")
	}
	return &model.SitePage{
		Title: title, Slug: slug, Content: content,
		Published: in.Published, SortOrder: in.SortOrder,
		ShowInFooter: in.ShowInFooter, ShowInNav: in.ShowInNav,
	}, nil
}

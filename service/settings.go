package service

import (
	"strconv"
	"sync"

	"git.iioio.com/freefire/jiang13-forum/model"
)

// 论坛设置键名
const (
	SettingPostEditWindowHours = "post_edit_window_hours"

	SettingRateLimitPost     = "rate_limit_post"
	SettingRateLimitComment  = "rate_limit_comment"
	SettingRateLimitRegister = "rate_limit_register"
	SettingRateLimitLogin    = "rate_limit_login"
	SettingRateLimitWindow   = "rate_limit_window_sec"

	SettingPostTitleMax   = "post_title_max"
	SettingPostTagsMax    = "post_tags_max"
	SettingPostContentMax = "post_content_max"

	SettingCommentMax = "comment_max"

	SettingSearchKeywordMin = "search_keyword_min"
	SettingSearchKeywordMax = "search_keyword_max"

	SettingPageSizeDefault = "page_size_default"
	SettingPageSizeMax     = "page_size_max"

	SettingPasswordMinLen = "password_min_len"
	SettingAvatarMaxMB    = "avatar_max_mb"
)

// ForumLimits 论坛可配置限制（API 传输结构）
type ForumLimits struct {
	PostEditWindowHours int `json:"post_edit_window_hours"`

	RateLimitPost      int `json:"rate_limit_post"`
	RateLimitComment   int `json:"rate_limit_comment"`
	RateLimitRegister  int `json:"rate_limit_register"`
	RateLimitLogin     int `json:"rate_limit_login"`
	RateLimitWindowSec int `json:"rate_limit_window_sec"`

	PostTitleMax   int `json:"post_title_max"`
	PostTagsMax    int `json:"post_tags_max"`
	PostContentMax int `json:"post_content_max"`

	CommentMax int `json:"comment_max"`

	SearchKeywordMin int `json:"search_keyword_min"`
	SearchKeywordMax int `json:"search_keyword_max"`

	PageSizeDefault int `json:"page_size_default"`
	PageSizeMax     int `json:"page_size_max"`

	PasswordMinLen int `json:"password_min_len"`
	AvatarMaxMB    int `json:"avatar_max_mb"`
}

// ForumLimitsPublic 前台可见的限制（不含限流等内部配置）
type ForumLimitsPublic struct {
	PostTitleMax   int `json:"post_title_max"`
	PostTagsMax    int `json:"post_tags_max"`
	PostContentMax int `json:"post_content_max"`
	CommentMax     int `json:"comment_max"`
	SearchKeywordMin int `json:"search_keyword_min"`
	SearchKeywordMax int `json:"search_keyword_max"`
	PasswordMinLen int `json:"password_min_len"`
	AvatarMaxMB    int `json:"avatar_max_mb"`
}

type settingDef struct {
	key       string
	defaultVal string
	min       int
	max       int // 0 表示不限制上限
}

var forumSettingDefs = []settingDef{
	{SettingPostEditWindowHours, "24", 0, 0},

	{SettingRateLimitPost, "10", 1, 1000},
	{SettingRateLimitComment, "10", 1, 1000},
	{SettingRateLimitRegister, "10", 1, 1000},
	{SettingRateLimitLogin, "10", 1, 1000},
	{SettingRateLimitWindow, "60", 10, 3600},

	{SettingPostTitleMax, "128", 1, 512},
	{SettingPostTagsMax, "256", 0, 512},
	{SettingPostContentMax, "50000", 0, 0},

	{SettingCommentMax, "5000", 1, 50000},

	{SettingSearchKeywordMin, "1", 0, 100},
	{SettingSearchKeywordMax, "50", 1, 200},

	{SettingPageSizeDefault, "30", 1, 200},
	{SettingPageSizeMax, "50", 1, 200},

	{SettingPasswordMinLen, "6", 4, 128},
	{SettingAvatarMaxMB, "2", 1, 20},
}

// ForumSettingsService 论坛全局设置
type ForumSettingsService struct {
	mu sync.RWMutex
}

func NewForumSettingsService() *ForumSettingsService {
	s := &ForumSettingsService{}
	s.ensureDefaults()
	return s
}

func (s *ForumSettingsService) ensureDefaults() {
	for _, def := range forumSettingDefs {
		var count int64
		model.DB.Model(&model.ForumSetting{}).Where("`key` = ?", def.key).Count(&count)
		if count == 0 {
			model.DB.Create(&model.ForumSetting{Key: def.key, Value: def.defaultVal})
		}
	}
}

func (s *ForumSettingsService) getInt(key string, fallback int) int {
	var setting model.ForumSetting
	if err := model.DB.First(&setting, "`key` = ?", key).Error; err != nil {
		return fallback
	}
	v, err := strconv.Atoi(setting.Value)
	if err != nil {
		return fallback
	}
	return v
}

func (s *ForumSettingsService) setInt(key string, value int) error {
	for _, def := range forumSettingDefs {
		if def.key != key {
			continue
		}
		if value < def.min {
			return ErrInvalidSetting
		}
		if def.max > 0 && value > def.max {
			return ErrInvalidSetting
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		return model.DB.Save(&model.ForumSetting{Key: key, Value: strconv.Itoa(value)}).Error
	}
	return ErrInvalidSetting
}

func (s *ForumSettingsService) Limits() ForumLimits {
	return ForumLimits{
		PostEditWindowHours: s.PostEditWindowHours(),

		RateLimitPost:      s.RateLimitFor("post"),
		RateLimitComment:   s.RateLimitFor("comment"),
		RateLimitRegister:  s.RateLimitFor("register"),
		RateLimitLogin:     s.RateLimitFor("login"),
		RateLimitWindowSec: s.RateLimitWindowSec(),

		PostTitleMax:   s.PostTitleMax(),
		PostTagsMax:    s.PostTagsMax(),
		PostContentMax: s.PostContentMax(),

		CommentMax: s.CommentMax(),

		SearchKeywordMin: s.SearchKeywordMin(),
		SearchKeywordMax: s.SearchKeywordMax(),

		PageSizeDefault: s.PageSizeDefault(),
		PageSizeMax:     s.PageSizeMax(),

		PasswordMinLen: s.PasswordMinLen(),
		AvatarMaxMB:    s.AvatarMaxMB(),
	}
}

func (s *ForumSettingsService) PublicLimits() ForumLimitsPublic {
	limits := s.Limits()
	return ForumLimitsPublic{
		PostTitleMax:     limits.PostTitleMax,
		PostTagsMax:      limits.PostTagsMax,
		PostContentMax:   limits.PostContentMax,
		CommentMax:       limits.CommentMax,
		SearchKeywordMin: limits.SearchKeywordMin,
		SearchKeywordMax: limits.SearchKeywordMax,
		PasswordMinLen:   limits.PasswordMinLen,
		AvatarMaxMB:      limits.AvatarMaxMB,
	}
}

func (s *ForumSettingsService) UpdateLimits(in ForumLimits) error {
	updates := map[string]int{
		SettingPostEditWindowHours: in.PostEditWindowHours,
		SettingRateLimitPost:       in.RateLimitPost,
		SettingRateLimitComment:    in.RateLimitComment,
		SettingRateLimitRegister:   in.RateLimitRegister,
		SettingRateLimitLogin:      in.RateLimitLogin,
		SettingRateLimitWindow:     in.RateLimitWindowSec,
		SettingPostTitleMax:        in.PostTitleMax,
		SettingPostTagsMax:         in.PostTagsMax,
		SettingPostContentMax:      in.PostContentMax,
		SettingCommentMax:          in.CommentMax,
		SettingSearchKeywordMin:    in.SearchKeywordMin,
		SettingSearchKeywordMax:    in.SearchKeywordMax,
		SettingPageSizeDefault:     in.PageSizeDefault,
		SettingPageSizeMax:         in.PageSizeMax,
		SettingPasswordMinLen:      in.PasswordMinLen,
		SettingAvatarMaxMB:         in.AvatarMaxMB,
	}
	if in.SearchKeywordMax > 0 && in.SearchKeywordMin > in.SearchKeywordMax {
		return ErrInvalidSetting
	}
	if in.PageSizeDefault > in.PageSizeMax {
		return ErrInvalidSetting
	}
	for key, val := range updates {
		if err := s.setInt(key, val); err != nil {
			return err
		}
	}
	return nil
}

func (s *ForumSettingsService) PostEditWindowHours() int {
	return s.getInt(SettingPostEditWindowHours, 24)
}

func (s *ForumSettingsService) RateLimitFor(action string) int {
	switch action {
	case "post":
		return s.getInt(SettingRateLimitPost, 10)
	case "comment":
		return s.getInt(SettingRateLimitComment, 10)
	case "register":
		return s.getInt(SettingRateLimitRegister, 10)
	case "login", "admin_login":
		return s.getInt(SettingRateLimitLogin, 10)
	default:
		return 10
	}
}

func (s *ForumSettingsService) RateLimitWindowSec() int {
	return s.getInt(SettingRateLimitWindow, 60)
}

func (s *ForumSettingsService) PostTitleMax() int   { return s.getInt(SettingPostTitleMax, 128) }
func (s *ForumSettingsService) PostTagsMax() int    { return s.getInt(SettingPostTagsMax, 256) }
func (s *ForumSettingsService) PostContentMax() int { return s.getInt(SettingPostContentMax, 50000) }
func (s *ForumSettingsService) CommentMax() int     { return s.getInt(SettingCommentMax, 5000) }

func (s *ForumSettingsService) SearchKeywordMin() int { return s.getInt(SettingSearchKeywordMin, 1) }
func (s *ForumSettingsService) SearchKeywordMax() int { return s.getInt(SettingSearchKeywordMax, 50) }

func (s *ForumSettingsService) PageSizeDefault() int { return s.getInt(SettingPageSizeDefault, 30) }
func (s *ForumSettingsService) PageSizeMax() int     { return s.getInt(SettingPageSizeMax, 50) }

func (s *ForumSettingsService) PasswordMinLen() int { return s.getInt(SettingPasswordMinLen, 6) }
func (s *ForumSettingsService) AvatarMaxMB() int    { return s.getInt(SettingAvatarMaxMB, 2) }

// NormalizeSearchKeyword 校验并规范化搜索关键词，空字符串表示无搜索
func (s *ForumSettingsService) NormalizeSearchKeyword(keyword string) (string, error) {
	kw := trimRunes(keyword)
	if kw == "" {
		return "", nil
	}
	minLen := s.SearchKeywordMin()
	maxLen := s.SearchKeywordMax()
	runeLen := runeLen(kw)
	if minLen > 0 && runeLen < minLen {
		return "", ErrSearchKeywordTooShort
	}
	if maxLen > 0 && runeLen > maxLen {
		return "", ErrSearchKeywordTooLong
	}
	return kw, nil
}

// NormalizePageSize 规范化分页大小
func (s *ForumSettingsService) NormalizePageSize(size int) int {
	if size < 1 {
		return s.PageSizeDefault()
	}
	maxSize := s.PageSizeMax()
	if maxSize > 0 && size > maxSize {
		return maxSize
	}
	return size
}

// ValidateTextLength 校验文本长度，max=0 表示不限
func (s *ForumSettingsService) ValidateTextLength(text string, max int, tooLongErr error) error {
	if max <= 0 {
		return nil
	}
	if runeLen(text) > max {
		return tooLongErr
	}
	return nil
}

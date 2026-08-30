package service

import (
	"encoding/json"
	"errors"
	"net/url"
	"strconv"
	"strings"
	"sync"

	"git.iioio.com/freefire/jiang13-forum/model"
)

// 论坛设置键名
const (
	SettingPostEditWindowHours      = "post_edit_window_hours"
	SettingCommentEditWindowMinutes = "comment_edit_window_minutes"

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

	SettingPasswordMinLen = "password_min_len"
	SettingAvatarMaxMB    = "avatar_max_mb"
	SettingSignatureMax   = "signature_max"

	SettingOpenPostsInNewTab        = "open_posts_in_new_tab"
	SettingOpenContentLinksInNewTab = "open_content_links_in_new_tab"
	SettingAsideShowTagCloud        = "aside_show_tag_cloud"
	SettingAsideShowRecentComments  = "aside_show_recent_comments"
	SettingAsideShowFriendLinks     = "aside_show_friend_links"
	SettingAsideWidgets             = "aside_widgets"
	SettingNavShowFriendLinks       = "nav_show_friend_links"
	SettingFooterShowFriendLinks    = "footer_show_friend_links"
	SettingFeedListStyle            = "feed_list_style"

	// 伪静态键名见 permalink.go：SettingPermalinkEnabled / SettingPermalinkExt

	SettingSMTPEnabled    = "smtp_enabled"
	SettingSMTPHost       = "smtp_host"
	SettingSMTPPort       = "smtp_port"
	SettingSMTPUsername   = "smtp_username"
	SettingSMTPPassword   = "smtp_password"
	SettingSMTPFrom       = "smtp_from"
	SettingSMTPFromName   = "smtp_from_name"
	SettingSMTPEncryption = "smtp_encryption"

	SettingOIDCEnabled    = "oidc_enabled"
	SettingOIDCRootURL    = "oidc_root_url"
	SettingOIDCGroupClaim = "oidc_group_claim"
	SettingOIDCAdminGroup = "oidc_admin_group"
	SettingOIDCUserGroup  = "oidc_user_group"

	SettingGiteaSyncEnabled     = "gitea_sync_enabled"
	SettingGiteaBaseURL         = "gitea_base_url"
	SettingGiteaToken           = "gitea_token"
	SettingGiteaSyncIntervalMin = "gitea_sync_interval_min"

	SettingStorageType           = "storage_type"
	SettingStorageEndpoint       = "storage_endpoint"
	SettingStorageRegion         = "storage_region"
	SettingStorageBucket         = "storage_bucket"
	SettingStorageAccessKey      = "storage_access_key"
	SettingStorageSecretKey      = "storage_secret_key"
	SettingStoragePublicBaseURL  = "storage_public_base_url"
	SettingStoragePrefix         = "storage_prefix"
	SettingStorageForcePathStyle = "storage_force_path_style"
	SettingStorageImageDelivery  = "storage_image_delivery"

	SettingSiteName                  = "site_name"
	SettingSiteSlogan                = "site_slogan"
	SettingSiteDescription           = "site_description"
	SettingSiteKeywords              = "site_keywords"
	SettingSiteLogoMark              = "site_logo_mark"
	SettingSiteLogo                  = "site_logo"
	SettingSiteFavicon               = "site_favicon"
	SettingSiteOGImage               = "site_og_image"
	SettingSiteICPBeian              = "site_icp_beian"
	SettingSiteICPBeianURL           = "site_icp_beian_url"
	SettingSiteFriendLinks           = "site_friend_links"
	SettingFriendLinkReciprocalCheck = "friend_link_reciprocal_check"

	SettingCommunityReportEnabled = "community_report_enabled"
	SettingCommunityHubEnabled    = "community_hub_enabled" // 遗留键，不再作为开关来源
	SettingCommunityInstanceID    = "community_instance_id"
	SettingCommunityHubURL        = "community_hub_url"
	SettingCommunitySiteURL       = "community_site_url" // 上报用的本站公开地址（可回退 OIDC ROOT_URL）

	// DefaultCommunityHubURL 官方演示站（社区枢纽默认地址）
	DefaultCommunityHubURL = "https://bbs.iioio.com"

	// pageSizeAPIMax 单次列表请求条数硬上限（防客户端传超大 size），非后台可配项
	pageSizeAPIMax = 100
)

// ForumLimits 论坛可配置限制（API 传输结构）
type ForumLimits struct {
	PostEditWindowHours      int `json:"post_edit_window_hours"`
	CommentEditWindowMinutes int `json:"comment_edit_window_minutes"`

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

	PasswordMinLen int `json:"password_min_len"`
	AvatarMaxMB    int `json:"avatar_max_mb"`
	SignatureMax   int `json:"signature_max"`

	OpenPostsInNewTab        bool `json:"open_posts_in_new_tab"`
	OpenContentLinksInNewTab bool `json:"open_content_links_in_new_tab"`

	AsideShowTagCloud       bool          `json:"aside_show_tag_cloud"`
	AsideShowRecentComments bool          `json:"aside_show_recent_comments"`
	AsideShowFriendLinks    bool          `json:"aside_show_friend_links"`
	AsideWidgets            []AsideWidget `json:"aside_widgets"`
	NavShowFriendLinks      bool          `json:"nav_show_friend_links"`
	FooterShowFriendLinks   bool          `json:"footer_show_friend_links"`

	FeedListStyle string `json:"feed_list_style"`

	PermalinkEnabled bool   `json:"permalink_enabled"`
	PermalinkExt     string `json:"permalink_ext"`
}

// AsideWidget 右侧栏可选组件
type AsideWidget struct {
	ID      string `json:"id"`
	Enabled bool   `json:"enabled"`
}

const (
	AsideWidgetTagCloud       = "tag_cloud"
	AsideWidgetRecentComments = "recent_comments"
	AsideWidgetRecentUsers    = "recent_users"
	AsideWidgetFriendLinks    = "friend_links"
)

var asideWidgetDefaultOrder = []string{
	AsideWidgetTagCloud,
	AsideWidgetRecentComments,
	AsideWidgetRecentUsers,
	AsideWidgetFriendLinks,
}

// ForumLimitsPublic 前台可见的限制（不含限流等内部配置）
type ForumLimitsPublic struct {
	PostTitleMax     int `json:"post_title_max"`
	PostTagsMax      int `json:"post_tags_max"`
	PostContentMax   int `json:"post_content_max"`
	CommentMax       int `json:"comment_max"`
	SearchKeywordMin int `json:"search_keyword_min"`
	SearchKeywordMax int `json:"search_keyword_max"`
	PageSizeDefault  int `json:"page_size_default"`
	PasswordMinLen   int `json:"password_min_len"`
	AvatarMaxMB      int `json:"avatar_max_mb"`
	SignatureMax     int `json:"signature_max"`

	CommentEditWindowMinutes int `json:"comment_edit_window_minutes"`

	OpenPostsInNewTab        bool `json:"open_posts_in_new_tab"`
	OpenContentLinksInNewTab bool `json:"open_content_links_in_new_tab"`

	AsideShowTagCloud       bool          `json:"aside_show_tag_cloud"`
	AsideShowRecentComments bool          `json:"aside_show_recent_comments"`
	AsideShowFriendLinks    bool          `json:"aside_show_friend_links"`
	AsideWidgets            []AsideWidget `json:"aside_widgets"`
	NavShowFriendLinks      bool          `json:"nav_show_friend_links"`
	FooterShowFriendLinks   bool          `json:"footer_show_friend_links"`

	FeedListStyle string `json:"feed_list_style"`

	PermalinkEnabled bool   `json:"permalink_enabled"`
	PermalinkExt     string `json:"permalink_ext"`
}

type settingDef struct {
	key        string
	defaultVal string
	min        int
	max        int // 0 表示不限制上限
}

var forumSettingDefs = []settingDef{
	{SettingPostEditWindowHours, "24", 0, 0},
	{SettingCommentEditWindowMinutes, "3", 0, 0},

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

	{SettingPageSizeDefault, "30", 1, pageSizeAPIMax},

	{SettingPasswordMinLen, "6", 4, 128},
	{SettingAvatarMaxMB, "2", 1, 20},
	{SettingSignatureMax, "200", 0, 512},

	{SettingOpenPostsInNewTab, "1", 0, 1},
	{SettingOpenContentLinksInNewTab, "1", 0, 1},
}

var feedSettingDefaults = map[string]string{
	SettingFeedListStyle: "title",
}

var asideSettingDefaults = map[string]string{
	SettingAsideShowTagCloud:       "0",
	SettingAsideShowRecentComments: "0",
	SettingAsideShowFriendLinks:    "1",
	SettingAsideWidgets:            `[{"id":"tag_cloud","enabled":false},{"id":"recent_comments","enabled":false},{"id":"friend_links","enabled":true}]`,
}

var mailSettingDefaults = map[string]string{
	SettingSMTPEnabled:    "0",
	SettingSMTPHost:       "",
	SettingSMTPPort:       "465",
	SettingSMTPUsername:   "",
	SettingSMTPPassword:   "",
	SettingSMTPFrom:       "",
	SettingSMTPFromName:   "姜十三论坛",
	SettingSMTPEncryption: "ssl",
}

var oidcSettingDefaults = map[string]string{
	SettingOIDCEnabled:    "0",
	SettingOIDCRootURL:    "",
	SettingOIDCGroupClaim: "groups",
	SettingOIDCAdminGroup: "gitea-admin",
	SettingOIDCUserGroup:  "gitea-users",
}

var giteaSettingDefaults = map[string]string{
	SettingGiteaSyncEnabled:     "0",
	SettingGiteaBaseURL:         "",
	SettingGiteaToken:           "",
	SettingGiteaSyncIntervalMin: "60",
}

var storageSettingDefaults = map[string]string{
	SettingStorageType:           "local",
	SettingStorageEndpoint:       "",
	SettingStorageRegion:         "us-east-1",
	SettingStorageBucket:         "",
	SettingStorageAccessKey:      "",
	SettingStorageSecretKey:      "",
	SettingStoragePublicBaseURL:  "",
	SettingStoragePrefix:         "",
	SettingStorageForcePathStyle: "1",
	SettingStorageImageDelivery:  ImageDeliveryWebP,
}

var friendLinkSettingDefaults = map[string]string{
	SettingFriendLinkReciprocalCheck: "0", // 默认关闭回链检测
	SettingNavShowFriendLinks:        "1",
	SettingFooterShowFriendLinks:     "1",
}

var communitySettingDefaults = map[string]string{
	SettingCommunityReportEnabled: "0",
	SettingCommunityHubEnabled:    "0",
	SettingCommunityInstanceID:    "",
	SettingCommunityHubURL:        DefaultCommunityHubURL,
	SettingCommunitySiteURL:       "",
}

var siteBrandingDefaults = map[string]string{
	SettingSiteName:        "姜十三论坛",
	SettingSiteSlogan:      "拾三一隅，自在交流",
	SettingSiteDescription: "",
	SettingSiteKeywords:    "",
	SettingSiteLogoMark:    "姜",
	SettingSiteLogo:        "",
	SettingSiteFavicon:     "",
	SettingSiteOGImage:     "",
	SettingSiteICPBeian:    "",
	SettingSiteICPBeianURL: "https://beian.miit.gov.cn/",
	SettingSiteFriendLinks: "[]",
}

const (
	maxFriendLinks        = 20
	maxFriendLinkName     = 32
	maxFriendLinkURL      = 512
	maxICPBeianLen        = 64
	maxICPBeianURLLen     = 512
	maxSiteDescriptionLen = 500
	maxSiteKeywordsLen    = 200
	maxSiteKeywordItems   = 20
	defaultICPBeianURL    = "https://beian.miit.gov.cn/"
)

// FriendLink 友情链接
type FriendLink struct {
	Name string `json:"name"`
	URL  string `json:"url"`
	Logo string `json:"logo,omitempty"`
}

// SiteBranding 站点品牌配置（名称、Logo、Favicon、页脚等）
type SiteBranding struct {
	Name        string       `json:"name"`
	Slogan      string       `json:"slogan"`
	Description string       `json:"description"` // 站点简介（SEO / 首页可见）
	Keywords    string       `json:"keywords"`    // SEO keywords，逗号分隔
	LogoMark    string       `json:"logo_mark"`
	Logo        string       `json:"logo"`
	Favicon     string       `json:"favicon"`
	OGImage     string       `json:"og_image"` // 默认社交分享图（Open Graph）
	ICPBeian    string       `json:"icp_beian"`
	ICPBeianURL string       `json:"icp_beian_url"`
	FriendLinks []FriendLink `json:"friend_links"`
	SiteURL     string       `json:"site_url,omitempty" gorm:"-"` // 公开站点根 URL，仅 API 填充
}

// DocumentTitle 浏览器标签标题：站点名 - 副标题（标语）
func (b SiteBranding) DocumentTitle() string {
	name := strings.TrimSpace(b.Name)
	subtitle := strings.TrimSpace(b.Slogan)
	if subtitle != "" {
		return name + " - " + subtitle
	}
	return name
}

// MetaDescription 用于 meta description：优先简介，其次标语
func (b SiteBranding) MetaDescription() string {
	if d := strings.TrimSpace(b.Description); d != "" {
		return d
	}
	return strings.TrimSpace(b.Slogan)
}

// MetaKeywords 用于 meta keywords
func (b SiteBranding) MetaKeywords() string {
	return strings.TrimSpace(b.Keywords)
}

// DefaultShareImage 默认社交预览图：专用 OG 图 → Logo → Favicon
func (b SiteBranding) DefaultShareImage() string {
	for _, u := range []string{b.OGImage, b.Logo, b.Favicon} {
		if s := strings.TrimSpace(u); s != "" {
			return s
		}
	}
	return ""
}

// GiteaSyncConfig Gitea 仓库同步配置
type GiteaSyncConfig struct {
	Enabled         bool   `json:"enabled"`
	BaseURL         string `json:"base_url"`
	Token           string `json:"token,omitempty"` // 更新时传入；回显时为空
	HasToken        bool   `json:"has_token"`
	SyncIntervalMin int    `json:"sync_interval_min"`
	Ready           bool   `json:"ready"`
	RepoCount       int64  `json:"repo_count"`
}

// CommunityConfig 社区上报配置（HubEnabled 只读，来自运维配置）
type CommunityConfig struct {
	ReportEnabled bool   `json:"report_enabled"`
	HubEnabled    bool   `json:"hub_enabled"` // 只读：app.ini / 环境变量
	HubURL        string `json:"hub_url"`
	SiteURL       string `json:"site_url"` // 上报用的本站公开地址
	InstanceID    string `json:"instance_id"`
}

// OIDCConfig OIDC Provider 全局配置（应用凭证见 oauth_clients）
type OIDCConfig struct {
	Enabled      bool   `json:"enabled"`
	RootURL      string `json:"root_url"`
	Ready        bool   `json:"ready"`
	DiscoveryURL string `json:"discovery_url,omitempty"`
	AuthorizeURL string `json:"authorize_url,omitempty"`
	LogoutURL    string `json:"logout_url,omitempty"`
	GroupClaim   string `json:"group_claim"`
	AdminGroup   string `json:"admin_group"`
	UserGroup    string `json:"user_group"`
	ClientCount  int64  `json:"client_count"`
}

// ForumSettingsService 论坛全局设置
type ForumSettingsService struct {
	mu                  sync.RWMutex
	communityHubEnabled bool // 运维配置注入，非后台可改
}

func NewForumSettingsService() *ForumSettingsService {
	s := &ForumSettingsService{}
	s.ensureDefaults()
	return s
}

// SetCommunityHubEnabled 由启动配置注入是否作为社区枢纽
func (s *ForumSettingsService) SetCommunityHubEnabled(enabled bool) {
	s.mu.Lock()
	s.communityHubEnabled = enabled
	s.mu.Unlock()
}

func (s *ForumSettingsService) ensureDefaults() {
	for _, def := range forumSettingDefs {
		var count int64
		model.DB.Model(&model.ForumSetting{}).Where("`key` = ?", def.key).Count(&count)
		if count == 0 {
			model.DB.Create(&model.ForumSetting{Key: def.key, Value: def.defaultVal})
		}
	}
	for key, val := range feedSettingDefaults {
		var count int64
		model.DB.Model(&model.ForumSetting{}).Where("`key` = ?", key).Count(&count)
		if count == 0 {
			model.DB.Create(&model.ForumSetting{Key: key, Value: val})
		}
	}
	for key, val := range asideSettingDefaults {
		var count int64
		model.DB.Model(&model.ForumSetting{}).Where("`key` = ?", key).Count(&count)
		if count == 0 {
			model.DB.Create(&model.ForumSetting{Key: key, Value: val})
		}
	}
	for key, val := range mailSettingDefaults {
		var count int64
		model.DB.Model(&model.ForumSetting{}).Where("`key` = ?", key).Count(&count)
		if count == 0 {
			model.DB.Create(&model.ForumSetting{Key: key, Value: val})
		}
	}
	for key, val := range oidcSettingDefaults {
		var count int64
		model.DB.Model(&model.ForumSetting{}).Where("`key` = ?", key).Count(&count)
		if count == 0 {
			model.DB.Create(&model.ForumSetting{Key: key, Value: val})
		}
	}
	for key, val := range giteaSettingDefaults {
		var count int64
		model.DB.Model(&model.ForumSetting{}).Where("`key` = ?", key).Count(&count)
		if count == 0 {
			model.DB.Create(&model.ForumSetting{Key: key, Value: val})
		}
	}
	for key, val := range storageSettingDefaults {
		var count int64
		model.DB.Model(&model.ForumSetting{}).Where("`key` = ?", key).Count(&count)
		if count == 0 {
			model.DB.Create(&model.ForumSetting{Key: key, Value: val})
		}
	}
	for key, val := range siteBrandingDefaults {
		var count int64
		model.DB.Model(&model.ForumSetting{}).Where("`key` = ?", key).Count(&count)
		if count == 0 {
			model.DB.Create(&model.ForumSetting{Key: key, Value: val})
		}
	}
	for key, val := range friendLinkSettingDefaults {
		var count int64
		model.DB.Model(&model.ForumSetting{}).Where("`key` = ?", key).Count(&count)
		if count == 0 {
			model.DB.Create(&model.ForumSetting{Key: key, Value: val})
		}
	}
	for key, val := range communitySettingDefaults {
		var count int64
		model.DB.Model(&model.ForumSetting{}).Where("`key` = ?", key).Count(&count)
		if count == 0 {
			model.DB.Create(&model.ForumSetting{Key: key, Value: val})
		}
	}
}

func (s *ForumSettingsService) getString(key, fallback string) string {
	var setting model.ForumSetting
	if err := model.DB.First(&setting, "`key` = ?", key).Error; err != nil {
		return fallback
	}
	return setting.Value
}

func (s *ForumSettingsService) setString(key, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return model.DB.Save(&model.ForumSetting{Key: key, Value: value}).Error
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
	permalink := s.Permalink()
	widgets := s.AsideWidgets()
	bools := asideBoolsFromWidgets(widgets)
	return ForumLimits{
		PostEditWindowHours:      s.PostEditWindowHours(),
		CommentEditWindowMinutes: s.CommentEditWindowMinutes(),

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

		PasswordMinLen: s.PasswordMinLen(),
		AvatarMaxMB:    s.AvatarMaxMB(),
		SignatureMax:   s.SignatureMax(),

		OpenPostsInNewTab:        s.OpenPostsInNewTab(),
		OpenContentLinksInNewTab: s.OpenContentLinksInNewTab(),

		AsideShowTagCloud:       bools.tagCloud,
		AsideShowRecentComments: bools.recentComments,
		AsideShowFriendLinks:    bools.friendLinks,
		AsideWidgets:            widgets,
		NavShowFriendLinks:      s.NavShowFriendLinks(),
		FooterShowFriendLinks:   s.FooterShowFriendLinks(),

		FeedListStyle: s.FeedListStyle(),

		PermalinkEnabled: permalink.Enabled,
		PermalinkExt:     permalink.Ext,
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
		PageSizeDefault:  limits.PageSizeDefault,
		PasswordMinLen:   limits.PasswordMinLen,
		AvatarMaxMB:      limits.AvatarMaxMB,
		SignatureMax:     limits.SignatureMax,

		CommentEditWindowMinutes: limits.CommentEditWindowMinutes,

		OpenPostsInNewTab:        limits.OpenPostsInNewTab,
		OpenContentLinksInNewTab: limits.OpenContentLinksInNewTab,

		AsideShowTagCloud:       limits.AsideShowTagCloud,
		AsideShowRecentComments: limits.AsideShowRecentComments,
		AsideShowFriendLinks:    limits.AsideShowFriendLinks,
		AsideWidgets:            limits.AsideWidgets,
		NavShowFriendLinks:      limits.NavShowFriendLinks,
		FooterShowFriendLinks:   limits.FooterShowFriendLinks,

		FeedListStyle: limits.FeedListStyle,

		PermalinkEnabled: limits.PermalinkEnabled,
		PermalinkExt:     limits.PermalinkExt,
	}
}

func (s *ForumSettingsService) UpdateLimits(in ForumLimits) error {
	updates := map[string]int{
		SettingPostEditWindowHours:      in.PostEditWindowHours,
		SettingCommentEditWindowMinutes: in.CommentEditWindowMinutes,
		SettingRateLimitPost:            in.RateLimitPost,
		SettingRateLimitComment:         in.RateLimitComment,
		SettingRateLimitRegister:        in.RateLimitRegister,
		SettingRateLimitLogin:           in.RateLimitLogin,
		SettingRateLimitWindow:          in.RateLimitWindowSec,
		SettingPostTitleMax:             in.PostTitleMax,
		SettingPostTagsMax:              in.PostTagsMax,
		SettingPostContentMax:           in.PostContentMax,
		SettingCommentMax:               in.CommentMax,
		SettingSearchKeywordMin:         in.SearchKeywordMin,
		SettingSearchKeywordMax:         in.SearchKeywordMax,
		SettingPageSizeDefault:          in.PageSizeDefault,
		SettingPasswordMinLen:           in.PasswordMinLen,
		SettingAvatarMaxMB:              in.AvatarMaxMB,
		SettingSignatureMax:             in.SignatureMax,
	}
	if in.SearchKeywordMax > 0 && in.SearchKeywordMin > in.SearchKeywordMax {
		return ErrInvalidSetting
	}
	for key, val := range updates {
		if err := s.setInt(key, val); err != nil {
			return err
		}
	}
	widgets := NormalizeAsideWidgets(in.AsideWidgets)
	if len(widgets) == 0 {
		widgets = asideWidgetsFromBools(in.AsideShowTagCloud, in.AsideShowRecentComments, in.AsideShowFriendLinks)
	}
	bools := asideBoolsFromWidgets(widgets)
	boolUpdates := map[string]bool{
		SettingOpenPostsInNewTab:        in.OpenPostsInNewTab,
		SettingOpenContentLinksInNewTab: in.OpenContentLinksInNewTab,
		SettingAsideShowTagCloud:        bools.tagCloud,
		SettingAsideShowRecentComments:  bools.recentComments,
		SettingAsideShowFriendLinks:     bools.friendLinks,
		SettingNavShowFriendLinks:       in.NavShowFriendLinks,
		SettingFooterShowFriendLinks:    in.FooterShowFriendLinks,
		SettingPermalinkEnabled:         in.PermalinkEnabled,
	}
	for key, on := range boolUpdates {
		v := "0"
		if on {
			v = "1"
		}
		if err := s.setString(key, v); err != nil {
			return err
		}
	}
	widgetsJSON, err := json.Marshal(widgets)
	if err != nil {
		return err
	}
	if err := s.setString(SettingAsideWidgets, string(widgetsJSON)); err != nil {
		return err
	}
	ext, ok := NormalizePermalinkExt(in.PermalinkExt)
	if !ok {
		return ErrInvalidSetting
	}
	if err := s.setString(SettingPermalinkExt, ext); err != nil {
		return err
	}
	style, ok := NormalizeFeedListStyle(in.FeedListStyle)
	if !ok {
		return ErrInvalidSetting
	}
	if err := s.setString(SettingFeedListStyle, style); err != nil {
		return err
	}
	return nil
}

func (s *ForumSettingsService) PostEditWindowHours() int {
	return s.getInt(SettingPostEditWindowHours, 24)
}

func (s *ForumSettingsService) CommentEditWindowMinutes() int {
	return s.getInt(SettingCommentEditWindowMinutes, 3)
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

func (s *ForumSettingsService) PasswordMinLen() int { return s.getInt(SettingPasswordMinLen, 6) }
func (s *ForumSettingsService) AvatarMaxMB() int    { return s.getInt(SettingAvatarMaxMB, 2) }
func (s *ForumSettingsService) SignatureMax() int   { return s.getInt(SettingSignatureMax, 200) }

func (s *ForumSettingsService) OpenPostsInNewTab() bool {
	return s.getString(SettingOpenPostsInNewTab, "1") == "1"
}

func (s *ForumSettingsService) OpenContentLinksInNewTab() bool {
	return s.getString(SettingOpenContentLinksInNewTab, "1") == "1"
}

// FriendLinkReciprocalCheckEnabled 是否启用友链回链检测；缺省为关闭
func (s *ForumSettingsService) FriendLinkReciprocalCheckEnabled() bool {
	return s.getString(SettingFriendLinkReciprocalCheck, "0") == "1"
}

// NavShowFriendLinks 左侧栏「站点」是否展示友链入口；缺省开启
func (s *ForumSettingsService) NavShowFriendLinks() bool {
	return s.getString(SettingNavShowFriendLinks, "1") == "1"
}

// FooterShowFriendLinks 页脚是否展示友链入口；缺省开启
func (s *ForumSettingsService) FooterShowFriendLinks() bool {
	return s.getString(SettingFooterShowFriendLinks, "1") == "1"
}

func (s *ForumSettingsService) SetFriendLinkReciprocalCheckEnabled(enabled bool) error {
	v := "0"
	if enabled {
		v = "1"
	}
	return s.setString(SettingFriendLinkReciprocalCheck, v)
}

func (s *ForumSettingsService) SetNavShowFriendLinks(enabled bool) error {
	v := "0"
	if enabled {
		v = "1"
	}
	return s.setString(SettingNavShowFriendLinks, v)
}

func (s *ForumSettingsService) SetFooterShowFriendLinks(enabled bool) error {
	v := "0"
	if enabled {
		v = "1"
	}
	return s.setString(SettingFooterShowFriendLinks, v)
}

// SetAsideFriendLinksEnabled 更新右侧栏友链组件开关（与 aside_widgets 同步）
func (s *ForumSettingsService) SetAsideFriendLinksEnabled(enabled bool) error {
	widgets := s.AsideWidgets()
	found := false
	for i := range widgets {
		if widgets[i].ID == AsideWidgetFriendLinks {
			widgets[i].Enabled = enabled
			found = true
			break
		}
	}
	if !found {
		widgets = append(widgets, AsideWidget{ID: AsideWidgetFriendLinks, Enabled: enabled})
	}
	widgets = NormalizeAsideWidgets(widgets)
	bools := asideBoolsFromWidgets(widgets)
	payload, err := json.Marshal(widgets)
	if err != nil {
		return err
	}
	if err := s.setString(SettingAsideWidgets, string(payload)); err != nil {
		return err
	}
	v := "0"
	if bools.friendLinks {
		v = "1"
	}
	return s.setString(SettingAsideShowFriendLinks, v)
}

type asideWidgetBools struct {
	tagCloud       bool
	recentComments bool
	friendLinks    bool
}

func asideWidgetsFromBools(tagCloud, recentComments, friendLinks bool) []AsideWidget {
	return []AsideWidget{
		{ID: AsideWidgetTagCloud, Enabled: tagCloud},
		{ID: AsideWidgetRecentComments, Enabled: recentComments},
		{ID: AsideWidgetFriendLinks, Enabled: friendLinks},
	}
}

func asideBoolsFromWidgets(widgets []AsideWidget) asideWidgetBools {
	out := asideWidgetBools{}
	for _, w := range widgets {
		switch w.ID {
		case AsideWidgetTagCloud:
			out.tagCloud = w.Enabled
		case AsideWidgetRecentComments:
			out.recentComments = w.Enabled
		case AsideWidgetFriendLinks:
			out.friendLinks = w.Enabled
		}
	}
	return out
}

func isValidAsideWidgetID(id string) bool {
	switch id {
	case AsideWidgetTagCloud, AsideWidgetRecentComments, AsideWidgetRecentUsers, AsideWidgetFriendLinks:
		return true
	default:
		return false
	}
}

// NormalizeAsideWidgets 校验并补全右侧栏组件列表（顺序保留，缺失项按默认顺序追加）
func NormalizeAsideWidgets(in []AsideWidget) []AsideWidget {
	seen := make(map[string]bool, len(asideWidgetDefaultOrder))
	out := make([]AsideWidget, 0, len(asideWidgetDefaultOrder))
	for _, w := range in {
		id := strings.TrimSpace(w.ID)
		if !isValidAsideWidgetID(id) || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, AsideWidget{ID: id, Enabled: w.Enabled})
	}
	for _, id := range asideWidgetDefaultOrder {
		if seen[id] {
			continue
		}
		out = append(out, AsideWidget{ID: id, Enabled: false})
	}
	return out
}

func (s *ForumSettingsService) AsideWidgets() []AsideWidget {
	raw := strings.TrimSpace(s.getString(SettingAsideWidgets, ""))
	if raw != "" {
		var widgets []AsideWidget
		if err := json.Unmarshal([]byte(raw), &widgets); err == nil {
			normalized := NormalizeAsideWidgets(widgets)
			if len(normalized) > 0 {
				return normalized
			}
		}
	}
	return asideWidgetsFromBools(s.AsideShowTagCloud(), s.AsideShowRecentComments(), s.AsideShowFriendLinks())
}

func (s *ForumSettingsService) AsideShowTagCloud() bool {
	return s.getString(SettingAsideShowTagCloud, "0") == "1"
}

func (s *ForumSettingsService) AsideShowRecentComments() bool {
	return s.getString(SettingAsideShowRecentComments, "0") == "1"
}

func (s *ForumSettingsService) AsideShowFriendLinks() bool {
	return s.getString(SettingAsideShowFriendLinks, "1") == "1"
}

// NormalizeFeedListStyle 校验首页列表样式
func NormalizeFeedListStyle(v string) (string, bool) {
	switch strings.TrimSpace(strings.ToLower(v)) {
	case "title", "":
		return "title", true
	case "excerpt":
		return "excerpt", true
	case "thumbnail":
		return "thumbnail", true
	default:
		return "", false
	}
}

func (s *ForumSettingsService) FeedListStyle() string {
	v, ok := NormalizeFeedListStyle(s.getString(SettingFeedListStyle, feedSettingDefaults[SettingFeedListStyle]))
	if !ok {
		return "title"
	}
	return v
}

// MailConfig 读取 SMTP 配置（密码不回显明文）
func (s *ForumSettingsService) MailConfig() MailConfig {
	port, _ := strconv.Atoi(s.getString(SettingSMTPPort, "465"))
	if port <= 0 {
		port = 465
	}
	password := s.getString(SettingSMTPPassword, "")
	return MailConfig{
		Enabled:     s.getString(SettingSMTPEnabled, "0") == "1",
		Host:        s.getString(SettingSMTPHost, ""),
		Port:        port,
		Username:    s.getString(SettingSMTPUsername, ""),
		Password:    password,
		From:        s.getString(SettingSMTPFrom, ""),
		FromName:    s.getString(SettingSMTPFromName, "姜十三论坛"),
		Encryption:  normalizeEncryption(s.getString(SettingSMTPEncryption, "ssl")),
		HasPassword: password != "",
	}
}

// MailConfigPublic 管理端回显（不含密码明文）
func (s *ForumSettingsService) MailConfigPublic() MailConfig {
	cfg := s.MailConfig()
	cfg.Password = ""
	return cfg
}

// MailReady 邮件服务是否可用于发信
func (s *ForumSettingsService) MailReady() bool {
	cfg := s.MailConfig()
	return cfg.Enabled &&
		strings.TrimSpace(cfg.Host) != "" &&
		cfg.Port > 0 &&
		strings.TrimSpace(cfg.From) != "" &&
		strings.TrimSpace(cfg.Username) != "" &&
		cfg.HasPassword
}

// UpdateMailConfig 更新 SMTP 配置；密码为空表示保持原值
func (s *ForumSettingsService) UpdateMailConfig(in MailConfig) error {
	enc := normalizeEncryption(in.Encryption)
	if enc != "none" && enc != "starttls" && enc != "ssl" {
		return ErrInvalidSetting
	}
	port := in.Port
	if port <= 0 {
		port = 465
	}
	enabled := "0"
	if in.Enabled {
		enabled = "1"
	}
	updates := map[string]string{
		SettingSMTPEnabled:    enabled,
		SettingSMTPHost:       strings.TrimSpace(in.Host),
		SettingSMTPPort:       strconv.Itoa(port),
		SettingSMTPUsername:   strings.TrimSpace(in.Username),
		SettingSMTPFrom:       strings.TrimSpace(in.From),
		SettingSMTPFromName:   strings.TrimSpace(in.FromName),
		SettingSMTPEncryption: enc,
	}
	if strings.TrimSpace(in.Password) != "" {
		updates[SettingSMTPPassword] = in.Password
	}
	for key, val := range updates {
		if err := s.setString(key, val); err != nil {
			return err
		}
	}
	return nil
}

// OIDCConfig 读取 OIDC 全局配置
func (s *ForumSettingsService) OIDCConfig() OIDCConfig {
	root := normalizeRootURL(s.getString(SettingOIDCRootURL, ""))
	clientCount := CountEnabledOAuthClients()
	cfg := OIDCConfig{
		Enabled:     s.getString(SettingOIDCEnabled, "0") == "1",
		RootURL:     root,
		GroupClaim:  strings.TrimSpace(s.getString(SettingOIDCGroupClaim, "groups")),
		AdminGroup:  strings.TrimSpace(s.getString(SettingOIDCAdminGroup, "gitea-admin")),
		UserGroup:   strings.TrimSpace(s.getString(SettingOIDCUserGroup, "gitea-users")),
		ClientCount: clientCount,
	}
	if cfg.GroupClaim == "" {
		cfg.GroupClaim = "groups"
	}
	cfg.Ready = cfg.Enabled && cfg.RootURL != "" && clientCount > 0
	if root != "" {
		cfg.DiscoveryURL = root + "/.well-known/openid-configuration"
		cfg.AuthorizeURL = root + "/oauth/authorize"
		cfg.LogoutURL = root + "/oauth/logout"
	}
	return cfg
}

// OIDCConfigPublic 管理端回显
func (s *ForumSettingsService) OIDCConfigPublic() OIDCConfig {
	return s.OIDCConfig()
}

// UpdateOIDCConfig 更新 OIDC 全局配置（不含 OAuth 应用凭证）
func (s *ForumSettingsService) UpdateOIDCConfig(in OIDCConfig) error {
	root := normalizeRootURL(in.RootURL)
	if root != "" && !strings.HasPrefix(root, "http://") && !strings.HasPrefix(root, "https://") {
		return ErrInvalidSetting
	}
	enabled := "0"
	if in.Enabled {
		enabled = "1"
	}
	groupClaim := strings.TrimSpace(in.GroupClaim)
	if groupClaim == "" {
		groupClaim = "groups"
	}
	adminGroup := strings.TrimSpace(in.AdminGroup)
	userGroup := strings.TrimSpace(in.UserGroup)
	updates := map[string]string{
		SettingOIDCEnabled:    enabled,
		SettingOIDCRootURL:    root,
		SettingOIDCGroupClaim: groupClaim,
		SettingOIDCAdminGroup: adminGroup,
		SettingOIDCUserGroup:  userGroup,
	}
	for key, val := range updates {
		if err := s.setString(key, val); err != nil {
			return err
		}
	}
	return nil
}

// GiteaSyncConfig 读取 Gitea 同步配置（含 Token 明文，供服务内部使用）
func (s *ForumSettingsService) GiteaSyncConfig() GiteaSyncConfig {
	interval, _ := strconv.Atoi(s.getString(SettingGiteaSyncIntervalMin, "60"))
	if interval < 5 {
		interval = 5
	}
	if interval > 24*60 {
		interval = 24 * 60
	}
	token := s.getString(SettingGiteaToken, "")
	base := normalizeRootURL(s.getString(SettingGiteaBaseURL, ""))
	cfg := GiteaSyncConfig{
		Enabled:         s.getString(SettingGiteaSyncEnabled, "0") == "1",
		BaseURL:         base,
		Token:           token,
		HasToken:        token != "",
		SyncIntervalMin: interval,
	}
	cfg.Ready = cfg.Enabled && base != "" && cfg.HasToken
	var n int64
	model.DB.Model(&model.GiteaRepo{}).Where("private = ?", false).Count(&n)
	cfg.RepoCount = n
	return cfg
}

// GiteaSyncConfigPublic 管理端回显（不含 Token 明文）
func (s *ForumSettingsService) GiteaSyncConfigPublic() GiteaSyncConfig {
	cfg := s.GiteaSyncConfig()
	cfg.Token = ""
	return cfg
}

// UpdateGiteaSyncConfig 更新同步配置；Token 为空表示保持原值
func (s *ForumSettingsService) UpdateGiteaSyncConfig(in GiteaSyncConfig) error {
	base := normalizeRootURL(in.BaseURL)
	if base != "" && !strings.HasPrefix(base, "http://") && !strings.HasPrefix(base, "https://") {
		return ErrInvalidSetting
	}
	interval := in.SyncIntervalMin
	if interval <= 0 {
		interval = 60
	}
	if interval < 5 {
		interval = 5
	}
	if interval > 24*60 {
		interval = 24 * 60
	}
	enabled := "0"
	if in.Enabled {
		enabled = "1"
	}
	updates := map[string]string{
		SettingGiteaSyncEnabled:     enabled,
		SettingGiteaBaseURL:         base,
		SettingGiteaSyncIntervalMin: strconv.Itoa(interval),
	}
	if strings.TrimSpace(in.Token) != "" {
		updates[SettingGiteaToken] = strings.TrimSpace(in.Token)
	}
	for key, val := range updates {
		if err := s.setString(key, val); err != nil {
			return err
		}
	}
	return nil
}

// CommunityConfig 读取社区上报配置
func (s *ForumSettingsService) CommunityConfig() CommunityConfig {
	s.mu.RLock()
	hubEnabled := s.communityHubEnabled
	s.mu.RUnlock()
	return CommunityConfig{
		ReportEnabled: s.getString(SettingCommunityReportEnabled, "0") == "1",
		HubEnabled:    hubEnabled,
		HubURL:        DefaultCommunityHubURL,
		SiteURL:       s.CommunitySiteURL(""),
		InstanceID:    strings.TrimSpace(s.getString(SettingCommunityInstanceID, "")),
	}
}

// CommunitySiteURL 上报用的本站公开地址：已持久化 > OIDC ROOT_URL > 请求 Origin
func (s *ForumSettingsService) CommunitySiteURL(requestOrigin string) string {
	if u := normalizeRootURL(s.getString(SettingCommunitySiteURL, "")); u != "" {
		return strings.TrimRight(u, "/")
	}
	return s.SitePublicBaseURL(requestOrigin)
}

// EnsureCommunitySiteURL 在开启上报时确保有可用的本站公开地址；origin 可来自当前管理请求
func (s *ForumSettingsService) EnsureCommunitySiteURL(requestOrigin string) (string, error) {
	if u := s.CommunitySiteURL(requestOrigin); u != "" {
		// 若仅靠 Origin 推断，持久化以便后台 ticker 使用
		if normalizeRootURL(s.getString(SettingCommunitySiteURL, "")) == "" &&
			normalizeRootURL(s.getString(SettingOIDCRootURL, "")) == "" {
			if err := s.setString(SettingCommunitySiteURL, u); err != nil {
				return "", err
			}
		}
		return u, nil
	}
	return "", errors.New("无法确定本站公开地址：请先在 OIDC 设置中填写 ROOT_URL，或通过浏览器管理端开启上报")
}

// EnsureCommunityInstanceID 确保本机有稳定的匿名实例 ID
func (s *ForumSettingsService) EnsureCommunityInstanceID() (string, error) {
	id := strings.TrimSpace(s.getString(SettingCommunityInstanceID, ""))
	if id != "" {
		return id, nil
	}
	id = newCommunityInstanceID()
	if err := s.setString(SettingCommunityInstanceID, id); err != nil {
		return "", err
	}
	return id, nil
}

// UpdateCommunityConfig 仅更新上报开关；忽略客户端传入的 hub_url / site_url
func (s *ForumSettingsService) UpdateCommunityConfig(in CommunityConfig) (wasReportEnabled bool, err error) {
	wasReportEnabled = s.getString(SettingCommunityReportEnabled, "0") == "1"
	report := "0"
	if in.ReportEnabled {
		report = "1"
	}
	if err := s.setString(SettingCommunityReportEnabled, report); err != nil {
		return wasReportEnabled, err
	}
	if in.ReportEnabled {
		if _, err := s.EnsureCommunityInstanceID(); err != nil {
			return wasReportEnabled, err
		}
	}
	return wasReportEnabled, nil
}

// StorageConfig 读取上传存储配置（含密钥明文，供内部使用）
func (s *ForumSettingsService) StorageConfig() StorageConfig {
	secret := s.getString(SettingStorageSecretKey, "")
	region := strings.TrimSpace(s.getString(SettingStorageRegion, "us-east-1"))
	if region == "" {
		region = "us-east-1"
	}
	cfg := StorageConfig{
		Type:           normalizeStorageType(s.getString(SettingStorageType, "local")),
		Endpoint:       strings.TrimSpace(s.getString(SettingStorageEndpoint, "")),
		Region:         region,
		Bucket:         strings.TrimSpace(s.getString(SettingStorageBucket, "")),
		AccessKey:      strings.TrimSpace(s.getString(SettingStorageAccessKey, "")),
		SecretKey:      secret,
		PublicBaseURL:  normalizeRootURL(s.getString(SettingStoragePublicBaseURL, "")),
		Prefix:         normalizeObjectPrefix(s.getString(SettingStoragePrefix, "")),
		ForcePathStyle: s.getString(SettingStorageForcePathStyle, "1") == "1",
		HasSecretKey:   secret != "",
		ImageDelivery:  normalizeImageDelivery(s.getString(SettingStorageImageDelivery, ImageDeliveryWebP)),
	}
	cfg.Ready = cfg.Type == "local" || (cfg.Endpoint != "" && cfg.Bucket != "" &&
		cfg.AccessKey != "" && cfg.HasSecretKey && cfg.PublicBaseURL != "")
	return cfg
}

// ImageDelivery 图片展示方案：webp | original
func (s *ForumSettingsService) ImageDelivery() string {
	return normalizeImageDelivery(s.getString(SettingStorageImageDelivery, ImageDeliveryWebP))
}

// StorageConfigPublic 管理端回显（不含 Secret Key 明文）
func (s *ForumSettingsService) StorageConfigPublic() StorageConfig {
	cfg := s.StorageConfig()
	cfg.SecretKey = ""
	return cfg
}

// UpdateStorageConfig 更新存储配置；Secret Key 为空表示保持原值
func (s *ForumSettingsService) UpdateStorageConfig(in StorageConfig) error {
	typ := normalizeStorageType(in.Type)
	if typ != "local" && typ != "s3" {
		return ErrInvalidSetting
	}
	endpoint := strings.TrimSpace(in.Endpoint)
	region := strings.TrimSpace(in.Region)
	if region == "" {
		region = "us-east-1"
	}
	bucket := strings.TrimSpace(in.Bucket)
	accessKey := strings.TrimSpace(in.AccessKey)
	publicBase := normalizeRootURL(in.PublicBaseURL)
	prefix := normalizeObjectPrefix(in.Prefix)
	forcePath := "0"
	if in.ForcePathStyle {
		forcePath = "1"
	}

	if typ == "s3" {
		if endpoint == "" || bucket == "" || publicBase == "" {
			return errors.New("启用 S3 时须填写 Endpoint、Bucket 与公开访问地址")
		}
		if _, _, err := parseS3Endpoint(endpoint); err != nil {
			return err
		}
		if !strings.HasPrefix(publicBase, "http://") && !strings.HasPrefix(publicBase, "https://") {
			return errors.New("公开访问地址须以 http:// 或 https:// 开头")
		}
		existingSecret := s.getString(SettingStorageSecretKey, "")
		secret := strings.TrimSpace(in.SecretKey)
		if accessKey == "" {
			accessKey = strings.TrimSpace(s.getString(SettingStorageAccessKey, ""))
		}
		if secret == "" {
			secret = existingSecret
		}
		if accessKey == "" || secret == "" {
			return errors.New("启用 S3 时须填写 Access Key 与 Secret Key")
		}
	}

	delivery := normalizeImageDelivery(in.ImageDelivery)
	updates := map[string]string{
		SettingStorageType:           typ,
		SettingStorageEndpoint:       endpoint,
		SettingStorageRegion:         region,
		SettingStorageBucket:         bucket,
		SettingStorageAccessKey:      accessKey,
		SettingStoragePublicBaseURL:  publicBase,
		SettingStoragePrefix:         prefix,
		SettingStorageForcePathStyle: forcePath,
		SettingStorageImageDelivery:  delivery,
	}
	if strings.TrimSpace(in.SecretKey) != "" {
		updates[SettingStorageSecretKey] = strings.TrimSpace(in.SecretKey)
	}
	for key, val := range updates {
		if err := s.setString(key, val); err != nil {
			return err
		}
	}
	return nil
}

// SiteBranding 读取站点品牌配置
func (s *ForumSettingsService) SiteBranding() SiteBranding {
	name := strings.TrimSpace(s.getString(SettingSiteName, siteBrandingDefaults[SettingSiteName]))
	if name == "" {
		name = siteBrandingDefaults[SettingSiteName]
	}
	mark := strings.TrimSpace(s.getString(SettingSiteLogoMark, siteBrandingDefaults[SettingSiteLogoMark]))
	if mark == "" {
		mark = siteBrandingDefaults[SettingSiteLogoMark]
	}
	// 字标取首个字符（支持中文）
	runes := []rune(mark)
	if len(runes) > 1 {
		mark = string(runes[0])
	}
	links := parseFriendLinksJSON(s.getString(SettingSiteFriendLinks, "[]"))
	links = EnrichFriendLinksLogos(links)
	if err := s.maybePersistEnrichedFriendLinks(links); err != nil {
		// 回填失败不阻断读取
		_ = err
	}
	return SiteBranding{
		Name:        name,
		Slogan:      strings.TrimSpace(s.getString(SettingSiteSlogan, siteBrandingDefaults[SettingSiteSlogan])),
		Description: strings.TrimSpace(s.getString(SettingSiteDescription, "")),
		Keywords:    strings.TrimSpace(s.getString(SettingSiteKeywords, "")),
		LogoMark:    mark,
		Logo:        strings.TrimSpace(s.getString(SettingSiteLogo, "")),
		Favicon:     strings.TrimSpace(s.getString(SettingSiteFavicon, "")),
		OGImage:     strings.TrimSpace(s.getString(SettingSiteOGImage, "")),
		ICPBeian:    strings.TrimSpace(s.getString(SettingSiteICPBeian, "")),
		ICPBeianURL: strings.TrimSpace(s.getString(SettingSiteICPBeianURL, defaultICPBeianURL)),
		FriendLinks: links,
	}
}

// UpdateSiteBranding 更新品牌文案与页脚信息；Logo/Favicon URL 由上传接口单独写入
func (s *ForumSettingsService) UpdateSiteBranding(in SiteBranding) error {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return ErrInvalidSetting
	}
	if len([]rune(name)) > 64 {
		return ErrInvalidSetting
	}
	mark := strings.TrimSpace(in.LogoMark)
	if mark == "" {
		mark = siteBrandingDefaults[SettingSiteLogoMark]
	}
	runes := []rune(mark)
	if len(runes) > 1 {
		mark = string(runes[0])
	}
	slogan := strings.TrimSpace(in.Slogan)
	if len([]rune(slogan)) > 200 {
		return ErrInvalidSetting
	}
	description := strings.TrimSpace(in.Description)
	if len([]rune(description)) > maxSiteDescriptionLen {
		return ErrInvalidSetting
	}
	keywords, err := normalizeSiteKeywords(in.Keywords)
	if err != nil {
		return err
	}
	icp := strings.TrimSpace(in.ICPBeian)
	if len([]rune(icp)) > maxICPBeianLen {
		return ErrInvalidSetting
	}
	icpURL, err := normalizeOptionalHTTPURL(in.ICPBeianURL, defaultICPBeianURL, maxICPBeianURLLen)
	if err != nil {
		return err
	}
	links, err := normalizeFriendLinks(in.FriendLinks)
	if err != nil {
		return err
	}
	linksJSON, err := json.Marshal(links)
	if err != nil {
		return err
	}
	updates := map[string]string{
		SettingSiteName:        name,
		SettingSiteSlogan:      slogan,
		SettingSiteDescription: description,
		SettingSiteKeywords:    keywords,
		SettingSiteLogoMark:    mark,
		SettingSiteICPBeian:    icp,
		SettingSiteICPBeianURL: icpURL,
		SettingSiteFriendLinks: string(linksJSON),
	}
	for key, val := range updates {
		if err := s.setString(key, val); err != nil {
			return err
		}
	}
	return nil
}

// SetSiteLogo 写入 Logo URL（空串表示清除）
func (s *ForumSettingsService) SetSiteLogo(url string) error {
	return s.setString(SettingSiteLogo, strings.TrimSpace(url))
}

// SetSiteFavicon 写入 Favicon URL（空串表示清除）
func (s *ForumSettingsService) SetSiteFavicon(url string) error {
	return s.setString(SettingSiteFavicon, strings.TrimSpace(url))
}

// SetSiteOGImage 写入默认社交分享图 URL（空串表示清除）
func (s *ForumSettingsService) SetSiteOGImage(url string) error {
	return s.setString(SettingSiteOGImage, strings.TrimSpace(url))
}

// normalizeSiteKeywords 统一中英文分隔符，去重并限制数量/长度
func normalizeSiteKeywords(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	if len([]rune(raw)) > maxSiteKeywordsLen {
		return "", ErrInvalidSetting
	}
	raw = strings.NewReplacer("，", ",", "、", ",", ";", ",", "；", ",").Replace(raw)
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		out = append(out, p)
	}
	if len(out) > maxSiteKeywordItems {
		return "", ErrInvalidSetting
	}
	return strings.Join(out, ","), nil
}

// JoinSEOKeywords 合并页面级与站点级关键词（逗号分隔）
func JoinSEOKeywords(parts ...string) string {
	out := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		for _, p := range strings.Split(strings.NewReplacer("，", ",", "、", ",").Replace(part), ",") {
			p = strings.TrimSpace(p)
			if p == "" {
				continue
			}
			if _, ok := seen[p]; ok {
				continue
			}
			seen[p] = struct{}{}
			out = append(out, p)
		}
	}
	return strings.Join(out, ",")
}

// normalizeOptionalHTTPURL 空值回落到 defaultURL；非空须为 http(s)
func normalizeOptionalHTTPURL(raw, defaultURL string, maxLen int) (string, error) {
	href := strings.TrimSpace(raw)
	if href == "" {
		return defaultURL, nil
	}
	if len(href) > maxLen {
		return "", ErrInvalidSetting
	}
	u, err := url.Parse(href)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", ErrInvalidSetting
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return "", ErrInvalidSetting
	}
	return href, nil
}

func parseFriendLinksJSON(raw string) []FriendLink {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []FriendLink{}
	}
	var links []FriendLink
	if err := json.Unmarshal([]byte(raw), &links); err != nil {
		return []FriendLink{}
	}
	out, err := normalizeFriendLinks(links)
	if err != nil {
		return []FriendLink{}
	}
	return out
}

func normalizeFriendLinks(in []FriendLink) ([]FriendLink, error) {
	if len(in) > maxFriendLinks {
		return nil, ErrInvalidSetting
	}
	out := make([]FriendLink, 0, len(in))
	for _, item := range in {
		name := strings.TrimSpace(item.Name)
		href := strings.TrimSpace(item.URL)
		if name == "" && href == "" {
			continue
		}
		if name == "" || href == "" {
			return nil, ErrInvalidSetting
		}
		if len([]rune(name)) > maxFriendLinkName || len(href) > maxFriendLinkURL {
			return nil, ErrInvalidSetting
		}
		u, err := url.Parse(href)
		if err != nil || u.Scheme == "" || u.Host == "" {
			return nil, ErrInvalidSetting
		}
		scheme := strings.ToLower(u.Scheme)
		if scheme != "http" && scheme != "https" {
			return nil, ErrInvalidSetting
		}
		out = append(out, FriendLink{Name: name, URL: href, Logo: normalizeFriendLinkLogoOptional(item.Logo)})
	}
	if out == nil {
		out = []FriendLink{}
	}
	return out, nil
}

func normalizeRootURL(raw string) string {
	return strings.TrimRight(strings.TrimSpace(raw), "/")
}

func normalizeRedirectURIs(raw string) string {
	parts := splitRedirectURIs(raw)
	return strings.Join(parts, ",")
}

func splitRedirectURIs(raw string) []string {
	raw = strings.ReplaceAll(raw, "\r\n", "\n")
	raw = strings.ReplaceAll(raw, "\n", ",")
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	seen := map[string]struct{}{}
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		out = append(out, p)
	}
	return out
}

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
	if size > pageSizeAPIMax {
		return pageSizeAPIMax
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

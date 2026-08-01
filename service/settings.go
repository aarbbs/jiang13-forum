package service

import (
	"strconv"
	"strings"
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

	SettingPasswordMinLen = "password_min_len"
	SettingAvatarMaxMB    = "avatar_max_mb"
	SettingSignatureMax   = "signature_max"

	SettingOpenPostsInNewTab        = "open_posts_in_new_tab"
	SettingOpenContentLinksInNewTab = "open_content_links_in_new_tab"

	SettingSMTPEnabled    = "smtp_enabled"
	SettingSMTPHost       = "smtp_host"
	SettingSMTPPort       = "smtp_port"
	SettingSMTPUsername   = "smtp_username"
	SettingSMTPPassword   = "smtp_password"
	SettingSMTPFrom       = "smtp_from"
	SettingSMTPFromName   = "smtp_from_name"
	SettingSMTPEncryption = "smtp_encryption"

	SettingOIDCEnabled       = "oidc_enabled"
	SettingOIDCRootURL       = "oidc_root_url"
	SettingOIDCGroupClaim    = "oidc_group_claim"
	SettingOIDCAdminGroup    = "oidc_admin_group"
	SettingOIDCUserGroup     = "oidc_user_group"
	// 遗留单客户端字段（仅用于迁移到 oauth_clients）
	SettingOAuthClientID     = "oauth_client_id"
	SettingOAuthClientSecret = "oauth_client_secret"
	SettingOAuthRedirectURIs = "oauth_redirect_uris"

	SettingGiteaSyncEnabled     = "gitea_sync_enabled"
	SettingGiteaBaseURL         = "gitea_base_url"
	SettingGiteaToken           = "gitea_token"
	SettingGiteaSyncIntervalMin = "gitea_sync_interval_min"

	SettingSiteName     = "site_name"
	SettingSiteNameEN   = "site_name_en"
	SettingSiteSlogan   = "site_slogan"
	SettingSiteLogoMark = "site_logo_mark"
	SettingSiteLogo     = "site_logo"
	SettingSiteFavicon  = "site_favicon"

	// pageSizeAPIMax 单次列表请求条数硬上限（防客户端传超大 size），非后台可配项
	pageSizeAPIMax = 100
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

	PasswordMinLen int `json:"password_min_len"`
	AvatarMaxMB    int `json:"avatar_max_mb"`
	SignatureMax   int `json:"signature_max"`

	OpenPostsInNewTab        bool `json:"open_posts_in_new_tab"`
	OpenContentLinksInNewTab bool `json:"open_content_links_in_new_tab"`
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

	OpenPostsInNewTab        bool `json:"open_posts_in_new_tab"`
	OpenContentLinksInNewTab bool `json:"open_content_links_in_new_tab"`
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

	{SettingPageSizeDefault, "30", 1, pageSizeAPIMax},

	{SettingPasswordMinLen, "6", 4, 128},
	{SettingAvatarMaxMB, "2", 1, 20},
	{SettingSignatureMax, "200", 0, 512},

	{SettingOpenPostsInNewTab, "1", 0, 1},
	{SettingOpenContentLinksInNewTab, "1", 0, 1},
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
	SettingOIDCEnabled:       "0",
	SettingOIDCRootURL:       "",
	SettingOIDCGroupClaim:    "groups",
	SettingOIDCAdminGroup:    "gitea-admin",
	SettingOIDCUserGroup:     "gitea-users",
	SettingOAuthClientID:     "",
	SettingOAuthClientSecret: "",
	SettingOAuthRedirectURIs: "",
}

var giteaSettingDefaults = map[string]string{
	SettingGiteaSyncEnabled:     "0",
	SettingGiteaBaseURL:         "",
	SettingGiteaToken:           "",
	SettingGiteaSyncIntervalMin: "60",
}

var siteBrandingDefaults = map[string]string{
	SettingSiteName:     "姜十三论坛",
	SettingSiteNameEN:   "Jiang13 Forum",
	SettingSiteSlogan:   "拾三一隅，自在交流",
	SettingSiteLogoMark: "姜",
	SettingSiteLogo:     "",
	SettingSiteFavicon:  "",
}

// SiteBranding 站点品牌配置（名称、Logo、Favicon 等）
type SiteBranding struct {
	Name     string `json:"name"`
	NameEN   string `json:"name_en"`
	Slogan   string `json:"slogan"`
	LogoMark string `json:"logo_mark"`
	Logo     string `json:"logo"`
	Favicon  string `json:"favicon"`
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
	for key, val := range siteBrandingDefaults {
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

		PasswordMinLen: s.PasswordMinLen(),
		AvatarMaxMB:    s.AvatarMaxMB(),
		SignatureMax:   s.SignatureMax(),

		OpenPostsInNewTab:        s.OpenPostsInNewTab(),
		OpenContentLinksInNewTab: s.OpenContentLinksInNewTab(),
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

		OpenPostsInNewTab:        limits.OpenPostsInNewTab,
		OpenContentLinksInNewTab: limits.OpenContentLinksInNewTab,
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
		SettingPasswordMinLen:      in.PasswordMinLen,
		SettingAvatarMaxMB:         in.AvatarMaxMB,
		SettingSignatureMax:        in.SignatureMax,
	}
	if in.SearchKeywordMax > 0 && in.SearchKeywordMin > in.SearchKeywordMax {
		return ErrInvalidSetting
	}
	for key, val := range updates {
		if err := s.setInt(key, val); err != nil {
			return err
		}
	}
	boolUpdates := map[string]bool{
		SettingOpenPostsInNewTab:        in.OpenPostsInNewTab,
		SettingOpenContentLinksInNewTab: in.OpenContentLinksInNewTab,
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

func (s *ForumSettingsService) PasswordMinLen() int { return s.getInt(SettingPasswordMinLen, 6) }
func (s *ForumSettingsService) AvatarMaxMB() int    { return s.getInt(SettingAvatarMaxMB, 2) }
func (s *ForumSettingsService) SignatureMax() int   { return s.getInt(SettingSignatureMax, 200) }

func (s *ForumSettingsService) OpenPostsInNewTab() bool {
	return s.getString(SettingOpenPostsInNewTab, "1") == "1"
}

func (s *ForumSettingsService) OpenContentLinksInNewTab() bool {
	return s.getString(SettingOpenContentLinksInNewTab, "1") == "1"
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

// SeedOIDCFromINI 若库中尚未配置，则用 app.ini 种子一次（便于迁移）
func (s *ForumSettingsService) SeedOIDCFromINI(rootURL, clientID, clientSecret, redirectURIsCSV string) {
	rootURL = normalizeRootURL(rootURL)
	clientID = strings.TrimSpace(clientID)
	clientSecret = strings.TrimSpace(clientSecret)
	uris := normalizeRedirectURIs(redirectURIsCSV)
	if rootURL == "" && clientID == "" && clientSecret == "" && uris == "" {
		return
	}
	if s.getString(SettingOIDCRootURL, "") == "" && rootURL != "" {
		_ = s.setString(SettingOIDCRootURL, rootURL)
	}
	if s.getString(SettingOAuthClientID, "") == "" && clientID != "" {
		_ = s.setString(SettingOAuthClientID, clientID)
	}
	if s.getString(SettingOAuthClientSecret, "") == "" && clientSecret != "" {
		_ = s.setString(SettingOAuthClientSecret, clientSecret)
	}
	if s.getString(SettingOAuthRedirectURIs, "") == "" && uris != "" {
		_ = s.setString(SettingOAuthRedirectURIs, uris)
	}
	s.MigrateLegacyOIDCClient()
	if s.getString(SettingOIDCEnabled, "0") == "0" &&
		s.getString(SettingOIDCRootURL, "") != "" &&
		CountEnabledOAuthClients() > 0 {
		_ = s.setString(SettingOIDCEnabled, "1")
	}
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

// SeedGiteaFromINI 若库中尚未配置，则用 app.ini 种子一次
func (s *ForumSettingsService) SeedGiteaFromINI(baseURL, token string, enabled bool) {
	baseURL = normalizeRootURL(baseURL)
	token = strings.TrimSpace(token)
	if baseURL == "" && token == "" && !enabled {
		return
	}
	if s.getString(SettingGiteaBaseURL, "") == "" && baseURL != "" {
		_ = s.setString(SettingGiteaBaseURL, baseURL)
	}
	if s.getString(SettingGiteaToken, "") == "" && token != "" {
		_ = s.setString(SettingGiteaToken, token)
	}
	if enabled && s.getString(SettingGiteaSyncEnabled, "0") == "0" &&
		s.getString(SettingGiteaBaseURL, "") != "" &&
		s.getString(SettingGiteaToken, "") != "" {
		_ = s.setString(SettingGiteaSyncEnabled, "1")
	}
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
	return SiteBranding{
		Name:     name,
		NameEN:   strings.TrimSpace(s.getString(SettingSiteNameEN, siteBrandingDefaults[SettingSiteNameEN])),
		Slogan:   strings.TrimSpace(s.getString(SettingSiteSlogan, siteBrandingDefaults[SettingSiteSlogan])),
		LogoMark: mark,
		Logo:     strings.TrimSpace(s.getString(SettingSiteLogo, "")),
		Favicon:  strings.TrimSpace(s.getString(SettingSiteFavicon, "")),
	}
}

// UpdateSiteBranding 更新品牌文案；Logo/Favicon URL 由上传接口单独写入
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
	nameEN := strings.TrimSpace(in.NameEN)
	if len([]rune(nameEN)) > 64 {
		return ErrInvalidSetting
	}
	slogan := strings.TrimSpace(in.Slogan)
	if len([]rune(slogan)) > 200 {
		return ErrInvalidSetting
	}
	updates := map[string]string{
		SettingSiteName:     name,
		SettingSiteNameEN:   nameEN,
		SettingSiteSlogan:   slogan,
		SettingSiteLogoMark: mark,
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

package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"git.iioio.com/freefire/jiang13-forum/model"
)

var (
	ErrOAuthClientNotFound = errors.New("OAuth 应用不存在")
	ErrOAuthClientExists   = errors.New("client_id 已存在")
	ErrOAuthClientInvalid  = errors.New("OAuth 应用参数无效")
)

// OAuthClientView 管理端展示（不含密钥哈希）
type OAuthClientView struct {
	ID           uint      `json:"id"`
	ClientID     string    `json:"client_id"`
	Name         string    `json:"name"`
	RedirectURIs string    `json:"redirect_uris"`
	Enabled      bool      `json:"enabled"`
	HasSecret    bool      `json:"has_secret"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
	// ClientSecret 仅在创建或轮换时返回一次明文
	ClientSecret string `json:"client_secret,omitempty"`
}

// OAuthClientInput 创建/更新请求
type OAuthClientInput struct {
	ClientID     string `json:"client_id"`
	Name         string `json:"name"`
	RedirectURIs string `json:"redirect_uris"`
	Enabled      *bool  `json:"enabled"`
	// ClientSecret 留空：创建时自动生成；更新时表示不改
	ClientSecret string `json:"client_secret"`
	// RotateSecret 更新时为 true 则重新生成密钥
	RotateSecret bool `json:"rotate_secret"`
}

// ListOAuthClients 列出全部 OAuth 应用
func (s *ForumSettingsService) ListOAuthClients() ([]OAuthClientView, error) {
	var rows []model.OAuthClient
	if err := model.DB.Order("id asc").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]OAuthClientView, 0, len(rows))
	for _, r := range rows {
		out = append(out, toOAuthClientView(r, ""))
	}
	return out, nil
}

// CreateOAuthClient 创建应用；返回含明文密钥的视图
func (s *ForumSettingsService) CreateOAuthClient(in OAuthClientInput) (*OAuthClientView, error) {
	clientID := strings.TrimSpace(in.ClientID)
	name := strings.TrimSpace(in.Name)
	uris := normalizeRedirectURIs(in.RedirectURIs)
	if clientID == "" || name == "" || uris == "" {
		return nil, ErrOAuthClientInvalid
	}
	var n int64
	model.DB.Model(&model.OAuthClient{}).Where("client_id = ?", clientID).Count(&n)
	if n > 0 {
		return nil, ErrOAuthClientExists
	}

	plain := strings.TrimSpace(in.ClientSecret)
	if plain == "" {
		var err error
		plain, err = generateClientSecret()
		if err != nil {
			return nil, err
		}
	}
	hash, err := HashPassword(plain)
	if err != nil {
		return nil, err
	}
	enabled := true
	if in.Enabled != nil {
		enabled = *in.Enabled
	}
	row := model.OAuthClient{
		ClientID:         clientID,
		ClientSecretHash: hash,
		Name:             name,
		RedirectURIs:     uris,
		Enabled:          enabled,
	}
	if err := model.DB.Create(&row).Error; err != nil {
		return nil, err
	}
	v := toOAuthClientView(row, plain)
	return &v, nil
}

// UpdateOAuthClient 更新应用
func (s *ForumSettingsService) UpdateOAuthClient(id uint, in OAuthClientInput) (*OAuthClientView, error) {
	var row model.OAuthClient
	if err := model.DB.First(&row, id).Error; err != nil {
		return nil, ErrOAuthClientNotFound
	}
	name := strings.TrimSpace(in.Name)
	uris := normalizeRedirectURIs(in.RedirectURIs)
	if name == "" || uris == "" {
		return nil, ErrOAuthClientInvalid
	}
	row.Name = name
	row.RedirectURIs = uris
	if in.Enabled != nil {
		row.Enabled = *in.Enabled
	}

	plain := ""
	if in.RotateSecret {
		var err error
		plain, err = generateClientSecret()
		if err != nil {
			return nil, err
		}
		hash, err := HashPassword(plain)
		if err != nil {
			return nil, err
		}
		row.ClientSecretHash = hash
	} else if strings.TrimSpace(in.ClientSecret) != "" {
		plain = strings.TrimSpace(in.ClientSecret)
		hash, err := HashPassword(plain)
		if err != nil {
			return nil, err
		}
		row.ClientSecretHash = hash
	}

	if err := model.DB.Save(&row).Error; err != nil {
		return nil, err
	}
	v := toOAuthClientView(row, plain)
	return &v, nil
}

// DeleteOAuthClient 删除应用
func (s *ForumSettingsService) DeleteOAuthClient(id uint) error {
	res := model.DB.Delete(&model.OAuthClient{}, id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrOAuthClientNotFound
	}
	return nil
}

// FindEnabledOAuthClient 按 client_id 查找已启用应用
func FindEnabledOAuthClient(clientID string) (*model.OAuthClient, error) {
	var row model.OAuthClient
	if err := model.DB.Where("client_id = ? AND enabled = ?", clientID, true).First(&row).Error; err != nil {
		return nil, ErrOIDCInvalidClient
	}
	return &row, nil
}

// VerifyOAuthClientSecret 校验客户端密钥（支持 bcrypt；兼容尚未哈希的历史明文）
func VerifyOAuthClientSecret(row *model.OAuthClient, secret string) bool {
	if row == nil || secret == "" || row.ClientSecretHash == "" {
		return false
	}
	hash := row.ClientSecretHash
	if strings.HasPrefix(hash, "$2a$") || strings.HasPrefix(hash, "$2b$") || strings.HasPrefix(hash, "$2y$") {
		return CheckPassword(hash, secret)
	}
	// 遗留明文：校验通过后就地升级为哈希
	if hash == secret {
		if newHash, err := HashPassword(secret); err == nil {
			_ = model.DB.Model(row).Update("client_secret_hash", newHash).Error
			row.ClientSecretHash = newHash
		}
		return true
	}
	return false
}

func toOAuthClientView(row model.OAuthClient, plainSecret string) OAuthClientView {
	return OAuthClientView{
		ID:           row.ID,
		ClientID:     row.ClientID,
		Name:         row.Name,
		RedirectURIs: row.RedirectURIs,
		Enabled:      row.Enabled,
		HasSecret:    row.ClientSecretHash != "",
		CreatedAt:    row.CreatedAt,
		UpdatedAt:    row.UpdatedAt,
		ClientSecret: plainSecret,
	}
}

func generateClientSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// CountEnabledOAuthClients 已启用客户端数量
func CountEnabledOAuthClients() int64 {
	var n int64
	model.DB.Model(&model.OAuthClient{}).Where("enabled = ?", true).Count(&n)
	return n
}

// MigrateLegacyOIDCClient 将旧版 ForumSetting 单客户端迁入 oauth_clients（仅一次）
func (s *ForumSettingsService) MigrateLegacyOIDCClient() {
	if CountEnabledOAuthClients() > 0 {
		// 仍清理遗留明文密钥字段
		s.clearLegacyOAuthSecrets()
		return
	}
	clientID := strings.TrimSpace(s.getString(SettingOAuthClientID, ""))
	secret := s.getString(SettingOAuthClientSecret, "")
	uris := normalizeRedirectURIs(s.getString(SettingOAuthRedirectURIs, ""))
	if clientID == "" || secret == "" || uris == "" {
		return
	}
	hash := secret
	if !(strings.HasPrefix(secret, "$2a$") || strings.HasPrefix(secret, "$2b$") || strings.HasPrefix(secret, "$2y$")) {
		h, err := HashPassword(secret)
		if err != nil {
			return
		}
		hash = h
	}
	_ = model.DB.Create(&model.OAuthClient{
		ClientID:         clientID,
		ClientSecretHash: hash,
		Name:             "Gitea",
		RedirectURIs:     uris,
		Enabled:          true,
	}).Error
	s.clearLegacyOAuthSecrets()
}

func (s *ForumSettingsService) clearLegacyOAuthSecrets() {
	// 清空遗留明文，避免双源配置
	if s.getString(SettingOAuthClientSecret, "") != "" {
		_ = s.setString(SettingOAuthClientSecret, "")
	}
}

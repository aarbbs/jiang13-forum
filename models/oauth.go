package models

import "time"

// OAuthClient OIDC/OAuth2 客户端应用（密钥仅存 bcrypt 哈希）
type OAuthClient struct {
	ID               uint      `gorm:"primaryKey" json:"id"`
	ClientID         string    `gorm:"uniqueIndex;size:128;not null" json:"client_id"`
	ClientSecretHash string    `gorm:"size:128;not null" json:"-"`
	Name             string    `gorm:"size:128;not null" json:"name"`
	RedirectURIs     string    `gorm:"size:2048;not null" json:"redirect_uris"`
	Enabled          bool      `gorm:"default:true" json:"enabled"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// OAuthAuthCode 一次性授权码（OIDC Authorization Code Flow）
type OAuthAuthCode struct {
	ID                  uint      `gorm:"primaryKey"`
	Code                string    `gorm:"uniqueIndex;size:64;not null"`
	ClientID            string    `gorm:"size:128;not null;index"`
	UserID              uint      `gorm:"not null;index"`
	RedirectURI         string    `gorm:"size:512;not null"`
	Scope               string    `gorm:"size:256;default:''"`
	Nonce               string    `gorm:"size:128;default:''"`
	CodeChallenge       string    `gorm:"size:128;default:''"`
	CodeChallengeMethod string    `gorm:"size:16;default:''"`
	ExpiresAt           time.Time `gorm:"not null;index"`
	Used                bool      `gorm:"default:false"`
	CreatedAt           time.Time
}

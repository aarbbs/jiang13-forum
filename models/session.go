package models

import "time"

// Session 浏览器 opaque 会话（Cookie 只存 Id）
type Session struct {
	ID         string    `gorm:"primaryKey;size:64" json:"id"`
	UserID     uint      `gorm:"index;not null" json:"user_id"`
	ExpiresAt  time.Time `gorm:"index;not null" json:"expires_at"`
	CreatedAt  time.Time `json:"created_at"`
	LastSeenAt time.Time `json:"last_seen_at"`
	IP         string    `gorm:"size:45" json:"ip,omitempty"`
	UserAgent  string    `gorm:"size:256" json:"user_agent,omitempty"`
}

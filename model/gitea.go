package model

import "time"

// GiteaRepo 从 Gitea 同步的公开仓库缓存（侧栏 /projects 读取）
type GiteaRepo struct {
	ID               uint       `gorm:"primaryKey" json:"id"`
	GiteaID          int64      `gorm:"uniqueIndex;not null" json:"gitea_id"`
	OwnerLogin       string     `gorm:"size:128;not null;index" json:"owner_login"`
	Name             string     `gorm:"size:255;not null" json:"name"`
	FullName         string     `gorm:"size:512;not null" json:"full_name"`
	Description      string     `gorm:"size:2048;default:''" json:"description"`
	HTMLURL          string     `gorm:"size:1024;not null" json:"html_url"`
	Private          bool       `gorm:"default:false" json:"private"`
	UpdatedAtRemote  *time.Time `json:"updated_at_remote"`
	ForumUserID      *uint      `gorm:"index" json:"forum_user_id"`
	SyncedAt         time.Time  `json:"synced_at"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

func (GiteaRepo) TableName() string {
	return "gitea_repos"
}

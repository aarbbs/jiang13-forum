package model

import (
	"time"

	"gorm.io/gorm"
)

// Role 用户角色
type Role string

const (
	RoleUser  Role = "user"
	RoleAdmin Role = "admin"
)

// User 用户表
type User struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	Username  string         `gorm:"uniqueIndex;size:64;not null" json:"username"`
	Password  string         `gorm:"size:128;not null" json:"-"`
	Nickname  string         `gorm:"size:64" json:"nickname"`
	Avatar    string         `gorm:"size:256" json:"avatar"`
	Role      Role           `gorm:"size:16;default:user" json:"role"`
	Banned    bool           `gorm:"default:false" json:"banned"`
	BannedAt  *time.Time     `json:"banned_at,omitempty"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// Board 论坛板块
type Board struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Name        string         `gorm:"size:64;not null" json:"name"`
	Description string         `gorm:"size:512" json:"description"`
	SortOrder   int            `gorm:"default:0" json:"sort_order"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

// Post 帖子
type Post struct {
	ID         uint           `gorm:"primaryKey" json:"id"`
	BoardID    uint           `gorm:"index;not null" json:"board_id"`
	UserID     uint           `gorm:"index;not null" json:"user_id"`
	Title      string         `gorm:"size:256;not null" json:"title"`
	Content    string         `gorm:"type:text;not null" json:"content"`
	Tags       string         `gorm:"size:256" json:"tags"`
	Pinned     bool           `gorm:"default:false" json:"pinned"`
	EditLocked bool           `gorm:"default:false" json:"edit_locked"`
	LikeCount  int            `gorm:"default:0" json:"like_count"`
	ViewCount  int            `gorm:"default:0" json:"view_count"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`

	Board    Board     `gorm:"foreignKey:BoardID" json:"board,omitempty"`
	User     User      `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Comments []Comment `gorm:"foreignKey:PostID" json:"comments,omitempty"`
}

// PostRevision 帖子编辑历史（每次修改前保存旧版本）
type PostRevision struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	PostID    uint      `gorm:"index;not null" json:"post_id"`
	EditorID  uint      `gorm:"index;not null" json:"editor_id"`
	Title     string    `gorm:"size:256;not null" json:"title"`
	Content   string    `gorm:"type:text;not null" json:"content"`
	Tags      string    `gorm:"size:256" json:"tags"`
	CreatedAt time.Time `json:"created_at"`

	Editor User `gorm:"foreignKey:EditorID" json:"editor,omitempty"`
}

// ForumSetting 论坛全局设置（键值对）
type ForumSetting struct {
	Key   string `gorm:"primaryKey;size:64" json:"key"`
	Value string `gorm:"size:256" json:"value"`
}

// Comment 楼层评论
type Comment struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	PostID    uint           `gorm:"index;not null" json:"post_id"`
	UserID    uint           `gorm:"index" json:"user_id"` // 0 表示游客
	Floor     int            `gorm:"not null" json:"floor"`
	Content   string         `gorm:"type:text;not null" json:"content"`
	ReplyTo   *uint          `gorm:"index" json:"reply_to,omitempty"`
	GuestNick   string       `gorm:"size:64" json:"guest_nick,omitempty"`
	GuestEmail  string       `gorm:"size:128" json:"guest_email,omitempty"`
	GuestURL    string       `gorm:"size:256" json:"guest_url,omitempty"`
	IsPrivate   bool         `gorm:"default:false" json:"is_private"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	User        User     `gorm:"foreignKey:UserID" json:"user,omitempty"`
	Post        Post     `gorm:"foreignKey:PostID" json:"post,omitempty"`
	ReplyTarget *Comment `gorm:"-" json:"reply_target,omitempty"`
	ContentHidden bool   `gorm:"-" json:"content_hidden"`
}

// PostLike 帖子点赞
type PostLike struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	PostID    uint      `gorm:"uniqueIndex:idx_post_user;not null" json:"post_id"`
	UserID    uint      `gorm:"uniqueIndex:idx_post_user;not null" json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
}

// PostFavorite 帖子收藏
type PostFavorite struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	PostID    uint      `gorm:"uniqueIndex:idx_fav_post_user;not null" json:"post_id"`
	UserID    uint      `gorm:"uniqueIndex:idx_fav_post_user;not null" json:"user_id"`
	CreatedAt time.Time `json:"created_at"`

	Post Post `gorm:"foreignKey:PostID" json:"post,omitempty"`
}

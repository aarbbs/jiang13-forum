package model

import "time"

// UserBadgeView 对外展示的徽章摘要
type UserBadgeView struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
	Kind        string `json:"kind"`
}

// UserPublic 公开用户主页视图（无邮箱与登录信息）
type UserPublic struct {
	ID                 uint            `json:"id"`
	Username           string          `json:"username"`
	Nickname           string          `json:"nickname"`
	Signature          string          `json:"signature"`
	Avatar             string          `json:"avatar"`
	Role               Role            `json:"role"`
	Verified           bool            `json:"verified"`
	Exp                int             `json:"exp"`
	Level              int             `json:"level"`
	CreatorIncomeTotal int             `json:"creator_income_total"`
	Badges             []UserBadgeView `json:"badges,omitempty"`
	Banned             bool            `json:"banned"`
	BannedAt           *time.Time      `json:"banned_at,omitempty"`
	CreatedAt          time.Time       `json:"created_at"`
}

// UserSelf 当前登录用户视图（含邮箱，不含登录 IP）
type UserSelf struct {
	ID                 uint            `json:"id"`
	Username           string          `json:"username"`
	Email              string          `json:"email"`
	Nickname           string          `json:"nickname"`
	Signature          string          `json:"signature"`
	Avatar             string          `json:"avatar"`
	Role               Role            `json:"role"`
	Verified           bool            `json:"verified"`
	Exp                int             `json:"exp"`
	Level              int             `json:"level"`
	Points             int             `json:"points"`
	CreatorIncomeTotal int             `json:"creator_income_total"`
	Badges             []UserBadgeView `json:"badges,omitempty"`
	Banned             bool            `json:"banned"`
	BannedAt           *time.Time      `json:"banned_at,omitempty"`
	CreatedAt          time.Time       `json:"created_at"`
	UpdatedAt          time.Time       `json:"updated_at"`
}

// UserAdmin 后台用户管理视图（含邮箱、上次登录与最近访问）
type UserAdmin struct {
	ID                 uint       `json:"id"`
	Username           string     `json:"username"`
	Email              string     `json:"email"`
	Nickname           string     `json:"nickname"`
	Signature          string     `json:"signature"`
	Avatar             string     `json:"avatar"`
	Role               Role       `json:"role"`
	Verified           bool       `json:"verified"`
	Exp                int        `json:"exp"`
	Level              int        `json:"level"`
	Points             int        `json:"points"`
	CreatorIncomeTotal int        `json:"creator_income_total"`
	Banned             bool       `json:"banned"`
	BannedAt           *time.Time `json:"banned_at,omitempty"`
	LastLoginAt        *time.Time `json:"last_login_at,omitempty"`
	LastLoginIP        string     `json:"last_login_ip,omitempty"`
	LastAccessAt       *time.Time `json:"last_access_at,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

// ToPublic 转为公开主页视图
func (u *User) ToPublic() UserPublic {
	return UserPublic{
		ID:                 u.ID,
		Username:           u.Username,
		Nickname:           u.Nickname,
		Signature:          u.Signature,
		Avatar:             u.Avatar,
		Role:               u.Role,
		Verified:           u.Verified,
		Exp:                u.Exp,
		Level:              LevelFromExp(u.Exp),
		CreatorIncomeTotal: u.CreatorIncomeTotal,
		Banned:             u.Banned,
		BannedAt:           u.BannedAt,
		CreatedAt:          u.CreatedAt,
	}
}

// ToSelf 转为个人中心 /api/me 视图
func (u *User) ToSelf() UserSelf {
	return UserSelf{
		ID:                 u.ID,
		Username:           u.Username,
		Email:              u.Email,
		Nickname:           u.Nickname,
		Signature:          u.Signature,
		Avatar:             u.Avatar,
		Role:               u.Role,
		Verified:           u.Verified,
		Exp:                u.Exp,
		Level:              LevelFromExp(u.Exp),
		Points:             u.Points,
		CreatorIncomeTotal: u.CreatorIncomeTotal,
		Banned:             u.Banned,
		BannedAt:           u.BannedAt,
		CreatedAt:          u.CreatedAt,
		UpdatedAt:          u.UpdatedAt,
	}
}

// ToAdmin 转为后台用户列表视图
func (u *User) ToAdmin() UserAdmin {
	return UserAdmin{
		ID:                 u.ID,
		Username:           u.Username,
		Email:              u.Email,
		Nickname:           u.Nickname,
		Signature:          u.Signature,
		Avatar:             u.Avatar,
		Role:               u.Role,
		Verified:           u.Verified,
		Exp:                u.Exp,
		Level:              LevelFromExp(u.Exp),
		Points:             u.Points,
		CreatorIncomeTotal: u.CreatorIncomeTotal,
		Banned:             u.Banned,
		BannedAt:           u.BannedAt,
		LastLoginAt:        u.LastLoginAt,
		LastLoginIP:        u.LastLoginIP,
		LastAccessAt:       u.LastAccessAt,
		CreatedAt:          u.CreatedAt,
		UpdatedAt:          u.UpdatedAt,
	}
}

// UsersToAdmin 批量转换后台用户列表
func UsersToAdmin(users []User) []UserAdmin {
	out := make([]UserAdmin, 0, len(users))
	for i := range users {
		out = append(out, users[i].ToAdmin())
	}
	return out
}

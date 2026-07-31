package model

import "time"

// UserSelf 当前登录用户视图（含邮箱，不含登录 IP）
type UserSelf struct {
	ID        uint      `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	Nickname  string    `json:"nickname"`
	Avatar    string    `json:"avatar"`
	Role      Role      `json:"role"`
	Banned    bool       `json:"banned"`
	BannedAt  *time.Time `json:"banned_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// UserAdmin 后台用户管理视图（含邮箱与上次登录信息）
type UserAdmin struct {
	ID          uint       `json:"id"`
	Username    string     `json:"username"`
	Email       string     `json:"email"`
	Nickname    string     `json:"nickname"`
	Avatar      string     `json:"avatar"`
	Role        Role       `json:"role"`
	Banned      bool       `json:"banned"`
	BannedAt    *time.Time `json:"banned_at,omitempty"`
	LastLoginAt *time.Time `json:"last_login_at,omitempty"`
	LastLoginIP string     `json:"last_login_ip,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// ToSelf 转为个人中心 /api/me 视图
func (u *User) ToSelf() UserSelf {
	return UserSelf{
		ID:        u.ID,
		Username:  u.Username,
		Email:     u.Email,
		Nickname:  u.Nickname,
		Avatar:    u.Avatar,
		Role:      u.Role,
		Banned:    u.Banned,
		BannedAt:  u.BannedAt,
		CreatedAt: u.CreatedAt,
		UpdatedAt: u.UpdatedAt,
	}
}

// ToAdmin 转为后台用户列表视图
func (u *User) ToAdmin() UserAdmin {
	return UserAdmin{
		ID:          u.ID,
		Username:    u.Username,
		Email:       u.Email,
		Nickname:    u.Nickname,
		Avatar:      u.Avatar,
		Role:        u.Role,
		Banned:      u.Banned,
		BannedAt:    u.BannedAt,
		LastLoginAt: u.LastLoginAt,
		LastLoginIP: u.LastLoginIP,
		CreatedAt:   u.CreatedAt,
		UpdatedAt:   u.UpdatedAt,
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

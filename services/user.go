package services

import (
	"errors"
	"fmt"
	"mime/multipart"
	"strconv"
	"strings"
	"time"

	"git.iioio.com/freefire/jiang13-forum/models"
)

type UserService struct {
	filter   *SensitiveFilter
	settings *ForumSettingsService
}

func NewUserService(filter *SensitiveFilter, settings *ForumSettingsService) *UserService {
	return &UserService{filter: filter, settings: settings}
}

// GetByID 获取用户信息
func (s *UserService) GetByID(id uint) (*models.User, error) {
	var user models.User
	if err := models.DB.First(&user, id).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// UserActivityStats 个人主页活动统计
type UserActivityStats struct {
	PostCount     int64 `json:"post_count"`
	CommentCount  int64 `json:"comment_count"`
	FavoriteCount int64 `json:"favorite_count"`
	LikeReceived  int64 `json:"like_received"`
}

// ActivityStats 统计用户发帖、评论、收藏与帖子获赞
func (s *UserService) ActivityStats(userID uint) (UserActivityStats, error) {
	var st UserActivityStats
	if userID == 0 {
		return st, errors.New("无效用户")
	}
	if err := models.DB.Model(&models.Post{}).Where("user_id = ?", userID).Count(&st.PostCount).Error; err != nil {
		return st, err
	}
	if err := models.DB.Model(&models.Comment{}).Where("user_id = ?", userID).Count(&st.CommentCount).Error; err != nil {
		return st, err
	}
	if err := models.DB.Model(&models.PostFavorite{}).Where("user_id = ?", userID).Count(&st.FavoriteCount).Error; err != nil {
		return st, err
	}
	var likeSum int64
	if err := models.DB.Model(&models.Post{}).
		Select("COALESCE(SUM(like_count), 0)").
		Where("user_id = ?", userID).
		Scan(&likeSum).Error; err != nil {
		return st, err
	}
	st.LikeReceived = likeSum
	return st, nil
}

// GetByUsername 按用户名查询
func (s *UserService) GetByUsername(username string) (*models.User, error) {
	var user models.User
	if err := models.DB.Where("username = ?", username).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// GetByEmail 按邮箱查询
func (s *UserService) GetByEmail(email string) (*models.User, error) {
	email = NormalizeEmail(email)
	var user models.User
	if err := models.DB.Where("email = ?", email).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// ResetPasswordByEmail 通过邮箱重置密码（已通过验证码校验）
func (s *UserService) ResetPasswordByEmail(email, newPass string) error {
	if err := ValidatePassword(newPass, s.settings.PasswordMinLen()); err != nil {
		return err
	}
	user, err := s.GetByEmail(email)
	if err != nil {
		return errors.New("用户不存在")
	}
	hash, err := HashPassword(newPass)
	if err != nil {
		return err
	}
	return models.DB.Model(&models.User{}).Where("id = ?", user.ID).Update("password", hash).Error
}

// SearchUsersBrief 公开用户搜索（@补全）：匹配用户名/昵称，不含邮箱
func (s *UserService) SearchUsersBrief(keyword string, limit int) ([]models.User, error) {
	keyword = strings.TrimSpace(keyword)
	if keyword == "" {
		return []models.User{}, nil
	}
	if limit <= 0 || limit > 20 {
		limit = 8
	}
	like := "%" + keyword + "%"
	var users []models.User
	err := models.DB.Select("id", "username", "nickname", "avatar", "role", "verified").
		Where("username LIKE ? OR nickname LIKE ?", like, like).
		Order("username ASC").
		Limit(limit).
		Find(&users).Error
	if err != nil {
		return nil, err
	}
	if users == nil {
		users = []models.User{}
	}
	return users, nil
}

// RecentUserItem 右栏「最新注册」条目
type RecentUserItem struct {
	ID        uint   `json:"id"`
	Nickname  string `json:"nickname"`
	Avatar    string `json:"avatar"`
	CreatedAt string `json:"created_at"`
}

// ListRecentRegistered 前台最新注册用户（排除封禁）
func (s *UserService) ListRecentRegistered(limit int) ([]RecentUserItem, error) {
	if limit < 1 {
		limit = 8
	}
	var users []models.User
	err := models.DB.Select("id", "username", "nickname", "avatar", "created_at").
		Where("banned = ?", false).
		Order("created_at DESC, id DESC").
		Limit(limit).
		Find(&users).Error
	if err != nil {
		return nil, err
	}
	out := make([]RecentUserItem, 0, len(users))
	for _, u := range users {
		nick := strings.TrimSpace(u.Nickname)
		if nick == "" {
			nick = u.Username
		}
		out = append(out, RecentUserItem{
			ID:        u.ID,
			Nickname:  nick,
			Avatar:    u.Avatar,
			CreatedAt: u.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return out, nil
}

// UpdateNickname 修改昵称
func (s *UserService) UpdateNickname(userID uint, nickname string) error {
	nickname = strings.TrimSpace(nickname)
	if nickname == "" {
		return errors.New("昵称不能为空")
	}
	nickname = s.filter.Filter(nickname)
	return models.DB.Model(&models.User{}).Where("id = ?", userID).Update("nickname", nickname).Error
}

// UpdateSignature 修改个人签名
func (s *UserService) UpdateSignature(userID uint, signature string) error {
	signature = strings.TrimSpace(signature)
	maxLen := s.settings.SignatureMax()
	if maxLen > 0 {
		runes := []rune(signature)
		if len(runes) > maxLen {
			return fmt.Errorf("签名不能超过 %d 字", maxLen)
		}
	}
	if signature != "" {
		signature = s.filter.Filter(signature)
	}
	return models.DB.Model(&models.User{}).Where("id = ?", userID).Update("signature", signature).Error
}

// UpdatePassword 修改密码
func (s *UserService) UpdatePassword(userID uint, oldPass, newPass string) error {
	if err := ValidatePassword(newPass, s.settings.PasswordMinLen()); err != nil {
		return err
	}
	var user models.User
	if err := models.DB.First(&user, userID).Error; err != nil {
		return err
	}
	if !CheckPassword(user.Password, oldPass) {
		return errors.New("原密码错误")
	}
	hash, err := HashPassword(newPass)
	if err != nil {
		return err
	}
	return models.DB.Model(&user).Update("password", hash).Error
}

// UploadAvatar 上传头像；成功后删除用户旧头像文件，避免磁盘/对象存储堆积
func (s *UserService) UploadAvatar(userID uint, file *multipart.FileHeader, store *UploadStore) (string, error) {
	var user models.User
	if err := models.DB.Select("id", "avatar").First(&user, userID).Error; err != nil {
		return "", err
	}
	url, err := SaveUploadedImage(store, file, UploadCategoryAvatars, fmt.Sprintf("%d", userID))
	if err != nil {
		return "", err
	}
	if err := models.DB.Model(&models.User{}).Where("id = ?", userID).Update("avatar", url).Error; err != nil {
		return "", err
	}
	if old := strings.TrimSpace(user.Avatar); old != "" && old != url {
		store.DeleteByURL(old)
	}
	return url, nil
}

// ListUsers 管理员列出用户
// UserListQuery 后台用户列表筛选
type UserListQuery struct {
	Page    int
	Size    int
	Keyword string // 匹配用户名/昵称/邮箱
	Filter  string // all | verified | banned | admin
}

func (s *UserService) ListUsers(q UserListQuery) ([]models.User, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Size < 1 {
		q.Size = 20
	}
	if q.Size > 100 {
		q.Size = 100
	}

	db := models.DB.Model(&models.User{})
	kw := strings.TrimSpace(q.Keyword)
	if kw != "" {
		like := "%" + kw + "%"
		if id, err := strconv.ParseUint(kw, 10, 64); err == nil {
			db = db.Where("id = ? OR username LIKE ? OR nickname LIKE ? OR email LIKE ?", id, like, like, like)
		} else {
			db = db.Where("username LIKE ? OR nickname LIKE ? OR email LIKE ?", like, like, like)
		}
	}
	switch strings.TrimSpace(q.Filter) {
	case "verified":
		db = db.Where("verified = ? AND role <> ?", true, models.RoleAdmin)
	case "banned":
		db = db.Where("banned = ?", true)
	case "admin":
		db = db.Where("role = ?", models.RoleAdmin)
	}

	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var users []models.User
	offset := (q.Page - 1) * q.Size
	err := db.Order("id desc").Offset(offset).Limit(q.Size).Find(&users).Error
	return users, total, err
}

// BanUser 禁言用户
func (s *UserService) BanUser(userID uint, banned bool) error {
	var user models.User
	if err := models.DB.First(&user, userID).Error; err != nil {
		return errors.New("用户不存在")
	}
	if user.Role == models.RoleAdmin {
		return errors.New("不能禁言管理员账号")
	}
	now := time.Now()
	updates := map[string]interface{}{"banned": banned}
	if banned {
		updates["banned_at"] = &now
	}
	return models.DB.Model(&models.User{}).Where("id = ?", userID).Updates(updates).Error
}

// SitemapUser 站点地图用的轻量用户字段
type SitemapUser struct {
	ID        uint
	UpdatedAt time.Time
}

// ListSitemap 列出未禁言用户（供 sitemap）
func (s *UserService) ListSitemap(limit int) ([]SitemapUser, error) {
	if limit <= 0 {
		limit = 5000
	}
	var rows []SitemapUser
	err := models.DB.Model(&models.User{}).
		Select("id, updated_at").
		Where("banned = ?", false).
		Order("updated_at desc, id desc").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

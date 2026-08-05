package service

import (
	"errors"
	"fmt"
	"mime/multipart"
	"strconv"
	"strings"
	"time"

	"git.iioio.com/freefire/jiang13-forum/model"
)

type UserService struct {
	filter   *SensitiveFilter
	settings *ForumSettingsService
}

func NewUserService(filter *SensitiveFilter, settings *ForumSettingsService) *UserService {
	return &UserService{filter: filter, settings: settings}
}

// GetByID 获取用户信息
func (s *UserService) GetByID(id uint) (*model.User, error) {
	var user model.User
	if err := model.DB.First(&user, id).Error; err != nil {
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
	if err := model.DB.Model(&model.Post{}).Where("user_id = ?", userID).Count(&st.PostCount).Error; err != nil {
		return st, err
	}
	if err := model.DB.Model(&model.Comment{}).Where("user_id = ?", userID).Count(&st.CommentCount).Error; err != nil {
		return st, err
	}
	if err := model.DB.Model(&model.PostFavorite{}).Where("user_id = ?", userID).Count(&st.FavoriteCount).Error; err != nil {
		return st, err
	}
	var likeSum int64
	if err := model.DB.Model(&model.Post{}).
		Select("COALESCE(SUM(like_count), 0)").
		Where("user_id = ?", userID).
		Scan(&likeSum).Error; err != nil {
		return st, err
	}
	st.LikeReceived = likeSum
	return st, nil
}

// GetByUsername 按用户名查询
func (s *UserService) GetByUsername(username string) (*model.User, error) {
	var user model.User
	if err := model.DB.Where("username = ?", username).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

// UpdateNickname 修改昵称
func (s *UserService) UpdateNickname(userID uint, nickname string) error {
	nickname = strings.TrimSpace(nickname)
	if nickname == "" {
		return errors.New("昵称不能为空")
	}
	nickname = s.filter.Filter(nickname)
	return model.DB.Model(&model.User{}).Where("id = ?", userID).Update("nickname", nickname).Error
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
	return model.DB.Model(&model.User{}).Where("id = ?", userID).Update("signature", signature).Error
}

// UpdatePassword 修改密码
func (s *UserService) UpdatePassword(userID uint, oldPass, newPass string) error {
	if err := ValidatePassword(newPass, s.settings.PasswordMinLen()); err != nil {
		return err
	}
	var user model.User
	if err := model.DB.First(&user, userID).Error; err != nil {
		return err
	}
	if !CheckPassword(user.Password, oldPass) {
		return errors.New("原密码错误")
	}
	hash, err := HashPassword(newPass)
	if err != nil {
		return err
	}
	return model.DB.Model(&user).Update("password", hash).Error
}

// UploadAvatar 上传头像；成功后删除用户旧头像文件，避免磁盘/对象存储堆积
func (s *UserService) UploadAvatar(userID uint, file *multipart.FileHeader, store *UploadStore) (string, error) {
	var user model.User
	if err := model.DB.Select("id", "avatar").First(&user, userID).Error; err != nil {
		return "", err
	}
	url, err := SaveUploadedImage(store, file, UploadCategoryAvatars, fmt.Sprintf("%d", userID))
	if err != nil {
		return "", err
	}
	if err := model.DB.Model(&model.User{}).Where("id = ?", userID).Update("avatar", url).Error; err != nil {
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

func (s *UserService) ListUsers(q UserListQuery) ([]model.User, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Size < 1 {
		q.Size = 20
	}
	if q.Size > 100 {
		q.Size = 100
	}

	db := model.DB.Model(&model.User{})
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
		db = db.Where("verified = ? AND role <> ?", true, model.RoleAdmin)
	case "banned":
		db = db.Where("banned = ?", true)
	case "admin":
		db = db.Where("role = ?", model.RoleAdmin)
	}

	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var users []model.User
	offset := (q.Page - 1) * q.Size
	err := db.Order("id desc").Offset(offset).Limit(q.Size).Find(&users).Error
	return users, total, err
}

// BanUser 禁言用户
func (s *UserService) BanUser(userID uint, banned bool) error {
	var user model.User
	if err := model.DB.First(&user, userID).Error; err != nil {
		return errors.New("用户不存在")
	}
	if user.Role == model.RoleAdmin {
		return errors.New("不能禁言管理员账号")
	}
	now := time.Now()
	updates := map[string]interface{}{"banned": banned}
	if banned {
		updates["banned_at"] = &now
	}
	return model.DB.Model(&model.User{}).Where("id = ?", userID).Updates(updates).Error
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
	err := model.DB.Model(&model.User{}).
		Select("id, updated_at").
		Where("banned = ?", false).
		Order("updated_at desc, id desc").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

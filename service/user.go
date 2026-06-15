package service

import (
	"errors"
	"fmt"
	"mime/multipart"
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

// UploadAvatar 上传头像到本地目录
func (s *UserService) UploadAvatar(userID uint, file *multipart.FileHeader, uploadDir string) (string, error) {
	url, err := SaveUploadedImage(file, uploadDir, "/uploads/avatars", fmt.Sprintf("%d", userID))
	if err != nil {
		return "", err
	}
	return url, model.DB.Model(&model.User{}).Where("id = ?", userID).Update("avatar", url).Error
}

// ListUsers 管理员列出用户
func (s *UserService) ListUsers(page, size int) ([]model.User, int64, error) {
	var users []model.User
	var total int64
	model.DB.Model(&model.User{}).Count(&total)
	offset := (page - 1) * size
	err := model.DB.Order("id desc").Offset(offset).Limit(size).Find(&users).Error
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

package service

import (
	"strconv"
	"sync"

	"git.iioio.com/freefire/jiang13-forum/model"
)

const (
	SettingPostEditWindowHours = "post_edit_window_hours"
	defaultEditWindowHours     = 24
)

// ForumSettingsService 论坛全局设置
type ForumSettingsService struct {
	mu sync.RWMutex
}

func NewForumSettingsService() *ForumSettingsService {
	s := &ForumSettingsService{}
	s.ensureDefaults()
	return s
}

func (s *ForumSettingsService) ensureDefaults() {
	var count int64
	model.DB.Model(&model.ForumSetting{}).Where("`key` = ?", SettingPostEditWindowHours).Count(&count)
	if count == 0 {
		model.DB.Create(&model.ForumSetting{
			Key:   SettingPostEditWindowHours,
			Value: strconv.Itoa(defaultEditWindowHours),
		})
	}
}

// PostEditWindowHours 返回用户可编辑帖子的时限（小时），0 表示不限
func (s *ForumSettingsService) PostEditWindowHours() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var setting model.ForumSetting
	if err := model.DB.First(&setting, "`key` = ?", SettingPostEditWindowHours).Error; err != nil {
		return defaultEditWindowHours
	}
	h, err := strconv.Atoi(setting.Value)
	if err != nil || h < 0 {
		return defaultEditWindowHours
	}
	return h
}

// SetPostEditWindowHours 设置编辑时限（小时），0 表示不限
func (s *ForumSettingsService) SetPostEditWindowHours(hours int) error {
	if hours < 0 {
		return ErrInvalidSetting
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return model.DB.Save(&model.ForumSetting{
		Key:   SettingPostEditWindowHours,
		Value: strconv.Itoa(hours),
	}).Error
}

// ForumSettings 返回所有可配置的论坛设置
func (s *ForumSettingsService) ForumSettings() map[string]int {
	return map[string]int{
		"post_edit_window_hours": s.PostEditWindowHours(),
	}
}

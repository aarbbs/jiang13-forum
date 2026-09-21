package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/model"
	"gorm.io/gorm"
)

// PostAttachmentInput 前端提交的帖子附件（文件已通过上传接口写入存储）
type PostAttachmentInput struct {
	Name        string `json:"name"`
	URL         string `json:"url"`
	Size        int64  `json:"size"`
	ContentType string `json:"content_type"`
}

// NormalizeFileExtForUpload 从文件名提取并规范化扩展名（小写、不含点）
func NormalizeFileExtForUpload(filename string) string {
	return normalizeFileExt(filepath.Ext(filename))
}

// ParsePostAttachmentsJSON 解析表单中的附件 JSON 数组（空串返回空列表）
func ParsePostAttachmentsJSON(raw string) ([]PostAttachmentInput, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	var inputs []PostAttachmentInput
	if err := json.Unmarshal([]byte(raw), &inputs); err != nil {
		return nil, errors.New("附件参数格式错误")
	}
	out := make([]PostAttachmentInput, 0, len(inputs))
	seen := map[string]bool{}
	for _, in := range inputs {
		in.Name = strings.TrimSpace(in.Name)
		in.URL = strings.TrimSpace(in.URL)
		in.ContentType = strings.TrimSpace(in.ContentType)
		if in.URL == "" {
			continue
		}
		if seen[in.URL] {
			continue
		}
		seen[in.URL] = true
		out = append(out, in)
	}
	return out, nil
}

// ValidatePostAttachments 校验附件的类型、大小与个数限制，并确认地址属于本站附件分类。
func ValidatePostAttachments(settings *ForumSettingsService, store *UploadStore, inputs []PostAttachmentInput) error {
	if len(inputs) == 0 {
		return nil
	}
	if settings == nil {
		return errors.New("设置服务未初始化")
	}
	allowed := settings.PostFileAllowedExts()
	if len(allowed) == 0 {
		return errors.New("文件上传未启用")
	}
	allowedSet := make(map[string]bool, len(allowed))
	for _, e := range allowed {
		allowedSet[e] = true
	}
	maxCount := settings.PostFileMaxCount()
	if maxCount > 0 && len(inputs) > maxCount {
		return fmt.Errorf("每个帖子最多上传 %d 个文件", maxCount)
	}
	maxMB := settings.PostFileMaxMB()
	for _, in := range inputs {
		ext := normalizeFileExt(filepath.Ext(in.Name))
		if ext == "" || !allowedSet[ext] {
			return fmt.Errorf("不支持的文件类型 %q", strings.TrimPrefix(filepath.Ext(in.Name), "."))
		}
		if maxMB > 0 && in.Size > int64(maxMB)*1024*1024 {
			return fmt.Errorf("文件 %s 超过大小限制 %dMB", in.Name, maxMB)
		}
		if store == nil || !store.IsManagedFileURL(in.URL) {
			return errors.New("附件地址无效")
		}
	}
	return nil
}

// SyncPostAttachments 以传入列表为准重建帖子附件：新增落库、移除的删除文件与记录。
func SyncPostAttachments(postID, userID uint, store *UploadStore, inputs []PostAttachmentInput) error {
	return model.DB.Transaction(func(tx *gorm.DB) error {
		var existing []model.PostAttachment
		if err := tx.Where("post_id = ?", postID).Find(&existing).Error; err != nil {
			return err
		}
		nextURLs := make(map[string]PostAttachmentInput, len(inputs))
		for _, in := range inputs {
			nextURLs[in.URL] = in
		}

		// 移除不再保留的附件（含物理文件）
		for _, old := range existing {
			if _, keep := nextURLs[old.URL]; keep {
				continue
			}
			if store != nil {
				store.DeleteByURL(old.URL)
			}
			if err := tx.Delete(&model.PostAttachment{}, old.ID).Error; err != nil {
				return err
			}
		}

		// 新增
		existingURLs := make(map[string]bool, len(existing))
		for _, old := range existing {
			existingURLs[old.URL] = true
		}
		for _, in := range inputs {
			if existingURLs[in.URL] {
				continue
			}
			if err := tx.Create(&model.PostAttachment{
				PostID:      postID,
				UserID:      userID,
				Name:        in.Name,
				URL:         in.URL,
				Size:        in.Size,
				ContentType: in.ContentType,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// ListPostAttachments 列出帖子的全部附件（按创建顺序）
func ListPostAttachments(postID uint) ([]model.PostAttachment, error) {
	var list []model.PostAttachment
	if err := model.DB.Where("post_id = ?", postID).
		Order("id asc").Find(&list).Error; err != nil {
		return nil, err
	}
	if list == nil {
		list = []model.PostAttachment{}
	}
	return list, nil
}

package service

import (
	"regexp"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/model"
)

const maxMentionsPerContent = 10

// 与前端 highlightMentions 字符集对齐（字母数字下划线中文，兼容历史 -）
// Go RE2 不支持 JS 的 \uXXXX，需用 \x{HHHH}
var mentionPattern = regexp.MustCompile(`@([0-9A-Za-z_\x{4e00}-\x{9fa5}-]+)`)

// ExtractMentionNames 从纯文本提取 @提及名（去重、保序）
func ExtractMentionNames(text string) []string {
	matches := mentionPattern.FindAllStringSubmatch(text, -1)
	if len(matches) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(matches))
	out := make([]string, 0, len(matches))
	for _, m := range matches {
		name := strings.TrimSpace(m[1])
		if name == "" {
			continue
		}
		key := strings.ToLower(name)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, name)
		if len(out) >= maxMentionsPerContent {
			break
		}
	}
	return out
}

// ResolveMentionUserIDs 将提及名解析为用户 ID（优先 username，其次 nickname；排除 excludeUserID）
func ResolveMentionUserIDs(names []string, excludeUserID uint) []uint {
	if len(names) == 0 {
		return nil
	}
	ids := make([]uint, 0, len(names))
	seen := make(map[uint]struct{}, len(names))
	for _, name := range names {
		var u model.User
		err := model.DB.Select("id").Where("username = ?", name).First(&u).Error
		if err != nil {
			err = model.DB.Select("id").Where("nickname = ?", name).First(&u).Error
		}
		if err != nil || u.ID == 0 || u.ID == excludeUserID {
			continue
		}
		if _, ok := seen[u.ID]; ok {
			continue
		}
		seen[u.ID] = struct{}{}
		ids = append(ids, u.ID)
	}
	return ids
}

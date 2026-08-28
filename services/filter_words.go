package services

import (
	"os"
	"strings"
)

const defaultFilterWordsContent = `# 姜十三论坛敏感词配置，每行一个词，# 开头为注释
违禁词示例
广告刷单
`

// EnsureFilterWordsInSettings 将敏感词迁入 forum_settings（优先已有键；否则从文件导入；否则默认）
func EnsureFilterWordsInSettings(settings *ForumSettingsService, legacyFilePath string, filter *SensitiveFilter) {
	if settings == nil {
		return
	}
	cur := strings.TrimSpace(settings.getString(SettingFilterWords, ""))
	if cur == "" {
		if data, err := os.ReadFile(legacyFilePath); err == nil && len(strings.TrimSpace(string(data))) > 0 {
			cur = string(data)
		} else {
			cur = defaultFilterWordsContent
		}
		_ = settings.setString(SettingFilterWords, cur)
	}
	filter.LoadFromContent(cur)
}

// FilterWordsContent 读取敏感词全文
func (s *ForumSettingsService) FilterWordsContent() string {
	v := s.getString(SettingFilterWords, "")
	if strings.TrimSpace(v) == "" {
		return defaultFilterWordsContent
	}
	return v
}

// UpdateFilterWords 更新敏感词并热加载过滤器
func (s *ForumSettingsService) UpdateFilterWords(content string, filter *SensitiveFilter) error {
	if err := s.setString(SettingFilterWords, content); err != nil {
		return err
	}
	if filter != nil {
		filter.LoadFromContent(content)
	}
	return nil
}

// ReadFilterWordsFile 兼容旧 API：读文件（Admin 未迁时）
func ReadFilterWordsFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// WriteFilterWordsFile 兼容旧写入：写文件并加载；新路径请用 UpdateFilterWords
func WriteFilterWordsFile(path string, content string, filter *SensitiveFilter) error {
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return err
	}
	filter.LoadFromContent(content)
	return nil
}

// WriteDefaultFilterWords 若文件不存在则写默认（遗留兼容，新站以 DB 为准）
func WriteDefaultFilterWords(path string) error {
	if _, err := os.Stat(path); err == nil {
		return nil
	}
	return os.WriteFile(path, []byte(defaultFilterWordsContent), 0644)
}

// CountFilterWords 统计有效敏感词数量（不含空行与注释）
func CountFilterWords(content string) int {
	count := 0
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "#") {
			count++
		}
	}
	return count
}

// FilterWordsPreview 返回前几行敏感词预览
func FilterWordsPreview(content string, maxLines int) []string {
	if maxLines <= 0 {
		maxLines = 5
	}
	var preview []string
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		preview = append(preview, line)
		if len(preview) >= maxLines {
			break
		}
	}
	return preview
}

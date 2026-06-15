package service

import (
	"os"
	"strings"
)

// ReadFilterWordsFile 读取敏感词配置文件内容
func ReadFilterWordsFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// WriteFilterWordsFile 写入敏感词配置并热加载到过滤器
func WriteFilterWordsFile(path string, content string, filter *SensitiveFilter) error {
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		return err
	}
	filter.LoadFromFile(path)
	return nil
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

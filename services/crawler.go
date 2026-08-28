package services

import "strings"

// 常见搜索引擎 / 社交预览 / SEO 工具的 User-Agent 片段（小写匹配）
var seoCrawlerTokens = []string{
	"googlebot",
	"google-inspectiontool",
	"bingbot",
	"baiduspider",
	"yandexbot",
	"duckduckbot",
	"slurp", // Yahoo
	"sogou",
	"bytespider",
	"petalbot",
	"applebot",
	"facebookexternalhit",
	"facebot",
	"twitterbot",
	"linkedinbot",
	"discordbot",
	"telegrambot",
	"slackbot",
	"whatsapp",
	"preview", // 部分通用预览 UA
	"embedly",
	"quora link preview",
	"pinterest",
	"vkshare",
	"w3c_validator",
	"ahrefsbot",
	"semrushbot",
	"dotbot",
	"mj12bot",
	"gptbot",
	"claudebot",
	"anthropic-ai",
	"chatgpt-user",
	"oai-searchbot",
}

// IsSEOCrawler 是否为需要服务端 HTML 的爬虫 / 预览 bot（动态渲染）
func IsSEOCrawler(userAgent string) bool {
	ua := strings.ToLower(strings.TrimSpace(userAgent))
	if ua == "" {
		return false
	}
	for _, token := range seoCrawlerTokens {
		if strings.Contains(ua, token) {
			return true
		}
	}
	return false
}

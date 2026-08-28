package services

import "strings"

// AllowedBoardIcons 与前端 BOARD_ICON_OPTIONS 的 key 保持一致
var AllowedBoardIcons = map[string]struct{}{
	"code-2": {}, "coffee": {}, "help-circle": {}, "message-square": {},
	"lightbulb": {}, "book-open": {}, "gamepad-2": {}, "palette": {},
	"music": {}, "camera": {}, "heart": {}, "zap": {},
	"globe": {}, "users": {}, "briefcase": {}, "graduation-cap": {},
	"shopping-bag": {}, "map-pin": {}, "megaphone": {}, "flame": {},
	"star": {}, "folder": {}, "wrench": {}, "cpu": {},
}

// NormalizeBoardIcon 校验并规范化板块图标 key，非法或空则返回空串
func NormalizeBoardIcon(icon string) string {
	icon = strings.TrimSpace(strings.ToLower(icon))
	if icon == "" {
		return ""
	}
	if _, ok := AllowedBoardIcons[icon]; !ok {
		return ""
	}
	return icon
}

// NormalizeBoardColorIndex -1 表示自动；0–7 为有效色槽
func NormalizeBoardColorIndex(colorIndex int) int {
	if colorIndex < 0 {
		return -1
	}
	if colorIndex > 7 {
		return colorIndex % 8
	}
	return colorIndex
}

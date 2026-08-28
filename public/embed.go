package public

import "embed"

// Assets 为 web_src 构建产物（site.css / site.js）
//
//go:embed assets/*
var Assets embed.FS

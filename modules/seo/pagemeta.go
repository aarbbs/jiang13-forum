package seo

// PageMeta 页面级 SEO / 社交预览元数据（SSR 与爬虫 HTML 共用）
type PageMeta struct {
	Title       string // 完整 <title>
	Description string
	Keywords    string // meta keywords
	Canonical   string
	OGType      string // 默认 website
	OGImage     string
	SiteName    string // og:site_name
	Locale      string // og:locale，默认 zh_CN
	Robots      string // 如 noindex,nofollow
	JSONLD      string // 已序列化的 JSON-LD 对象（不含 script 标签）
	Status      int    // HTTP 状态码，0 视为 200
}

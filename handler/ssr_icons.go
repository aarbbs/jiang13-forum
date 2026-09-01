package handler

import (
	"strconv"
	"strings"
	"time"
)

// 内联 SVG：path 对齐 lucide-react@1.18（由 scripts/extract-lucide-paths.mjs 抽取）

func ssrSVG(size int, paths ...string) string {
	return ssrSVGWithClass(size, "", paths...)
}

func ssrSVGWithClass(size int, className string, paths ...string) string {
	var b strings.Builder
	b.WriteString(`<svg xmlns="http://www.w3.org/2000/svg" width="`)
	b.WriteString(strconv.Itoa(size))
	b.WriteString(`" height="`)
	b.WriteString(strconv.Itoa(size))
	b.WriteString(`" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`)
	if className != "" {
		b.WriteString(` class="`)
		b.WriteString(className)
		b.WriteString(`"`)
	}
	b.WriteString(` aria-hidden="true">`)
	for _, p := range paths {
		b.WriteString(p)
	}
	b.WriteString(`</svg>`)
	return b.String()
}

func ssrIconSearch() string {
	return ssrSVGWithClass(16, "header-search-icon",
		`<path d="m21 21-4.34-4.34"/>`,
		`<circle cx="11" cy="11" r="8"/>`,
	)
}

func ssrIconSliders() string {
	return ssrSVG(15,
		`<path d="M10 5H3"/>`,
		`<path d="M12 19H3"/>`,
		`<path d="M14 3v4"/>`,
		`<path d="M16 17v4"/>`,
		`<path d="M21 12h-9"/>`,
		`<path d="M21 19h-5"/>`,
		`<path d="M21 5h-7"/>`,
		`<path d="M8 10v4"/>`,
		`<path d="M8 12H3"/>`,
	)
}

func ssrIconPlus() string {
	return ssrSVG(16,
		`<path d="M5 12h14"/>`,
		`<path d="M12 5v14"/>`,
	)
}

func ssrIconMenu() string {
	return ssrSVG(18,
		`<path d="M4 5h16"/>`,
		`<path d="M4 12h16"/>`,
		`<path d="M4 19h16"/>`,
	)
}

func ssrIconMoon() string {
	return ssrSVG(18,
		`<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>`,
	)
}

func ssrIconSun() string {
	return ssrSVG(18,
		`<circle cx="12" cy="12" r="4"/>`,
		`<path d="M12 2v2"/>`,
		`<path d="M12 20v2"/>`,
		`<path d="m4.93 4.93 1.41 1.41"/>`,
		`<path d="m17.66 17.66 1.41 1.41"/>`,
		`<path d="M2 12h2"/>`,
		`<path d="M20 12h2"/>`,
		`<path d="m6.34 17.66-1.41 1.41"/>`,
		`<path d="m19.07 4.93-1.41 1.41"/>`,
	)
}

func ssrIconMail() string {
	return ssrSVG(18,
		`<path d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7"/>`,
		`<rect x="2" y="4" width="20" height="16" rx="2"/>`,
	)
}

func ssrIconHome() string {
	return ssrSVG(18,
		`<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>`,
		`<path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>`,
	)
}

func ssrIconStar() string {
	return ssrSVG(18,
		`<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>`,
	)
}

func ssrIconFolderGit() string {
	return ssrSVG(18,
		`<path d="M18 19a5 5 0 0 1-5-5v8"/>`,
		`<path d="M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5"/>`,
		`<circle cx="13" cy="12" r="2"/>`,
		`<circle cx="20" cy="19" r="2"/>`,
	)
}

func ssrIconLink2() string {
	return ssrSVG(18,
		`<path d="M9 17H7A5 5 0 0 1 7 7h2"/>`,
		`<path d="M15 7h2a5 5 0 1 1 0 10h-2"/>`,
		`<line x1="8" x2="16" y1="12" y2="12"/>`,
	)
}

func ssrWidgetIconLink2() string {
	return ssrSVGWithClass(15, "widget-card-icon widget-card-icon--links",
		`<path d="M9 17H7A5 5 0 0 1 7 7h2"/>`,
		`<path d="M15 7h2a5 5 0 1 1 0 10h-2"/>`,
		`<line x1="8" x2="16" y1="12" y2="12"/>`,
	)
}

func ssrIconEarth() string {
	return ssrSVG(18,
		`<path d="M21.54 15H17a2 2 0 0 0-2 2v4.54"/>`,
		`<path d="M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17"/>`,
		`<path d="M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05"/>`,
		`<circle cx="12" cy="12" r="10"/>`,
	)
}

func ssrWidgetIconEarth() string {
	return ssrSVGWithClass(15, "widget-card-icon widget-card-icon--showcase",
		`<path d="M21.54 15H17a2 2 0 0 0-2 2v4.54"/>`,
		`<path d="M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17"/>`,
		`<path d="M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05"/>`,
		`<circle cx="12" cy="12" r="10"/>`,
	)
}

func ssrIconFileText() string {
	return ssrSVG(18,
		`<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>`,
		`<path d="M14 2v5a1 1 0 0 0 1 1h5"/>`,
		`<path d="M10 9H8"/>`,
		`<path d="M16 13H8"/>`,
		`<path d="M16 17H8"/>`,
	)
}

func ssrIconLayoutDashboard() string {
	return ssrSVG(18,
		`<rect width="7" height="9" x="3" y="3" rx="1"/>`,
		`<rect width="7" height="5" x="14" y="3" rx="1"/>`,
		`<rect width="7" height="9" x="14" y="12" rx="1"/>`,
		`<rect width="7" height="5" x="3" y="16" rx="1"/>`,
	)
}

func ssrIconMessageCircle() string {
	return ssrSVG(16,
		`<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>`,
	)
}

func ssrWidgetIconMessageCircle() string {
	return ssrSVGWithClass(15, "widget-card-icon widget-card-icon--notice",
		`<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>`,
	)
}

func ssrIconClock() string {
	return ssrSVG(16,
		`<circle cx="12" cy="12" r="10"/>`,
		`<path d="M12 6v6l4 2"/>`,
	)
}

func ssrIconBadgeCheck() string {
	return ssrSVG(16,
		`<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/>`,
		`<path d="m9 12 2 2 4-4"/>`,
	)
}

func ssrIconTags() string {
	return ssrSVG(16,
		`<path d="M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1z"/>`,
		`<path d="M2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193"/>`,
		`<circle cx="10.5" cy="6.5" r=".5" fill="currentColor"/>`,
	)
}

func ssrWidgetIconTags() string {
	return ssrSVGWithClass(15, "widget-card-icon widget-card-icon--tags",
		`<path d="M13.172 2a2 2 0 0 1 1.414.586l6.71 6.71a2.4 2.4 0 0 1 0 3.408l-4.592 4.592a2.4 2.4 0 0 1-3.408 0l-6.71-6.71A2 2 0 0 1 6 9.172V3a1 1 0 0 1 1-1z"/>`,
		`<path d="M2 7v6.172a2 2 0 0 0 .586 1.414l6.71 6.71a2.4 2.4 0 0 0 3.191.193"/>`,
		`<circle cx="10.5" cy="6.5" r=".5" fill="currentColor"/>`,
	)
}

func ssrIconUserPlus() string {
	return ssrSVG(16,
		`<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>`,
		`<circle cx="9" cy="7" r="4"/>`,
		`<line x1="19" x2="19" y1="8" y2="14"/>`,
		`<line x1="22" x2="16" y1="11" y2="11"/>`,
	)
}

func ssrWidgetIconUserPlus() string {
	return ssrSVGWithClass(15, "widget-card-icon widget-card-icon--users",
		`<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>`,
		`<circle cx="9" cy="7" r="4"/>`,
		`<line x1="19" x2="19" y1="8" y2="14"/>`,
		`<line x1="22" x2="16" y1="11" y2="11"/>`,
	)
}

func ssrIconCalendarCheck() string {
	return ssrSVG(18,
		`<path d="M8 2v4"/>`,
		`<path d="M16 2v4"/>`,
		`<rect width="18" height="18" x="3" y="4" rx="2"/>`,
		`<path d="M3 10h18"/>`,
		`<path d="m9 16 2 2 4-4"/>`,
	)
}

func ssrIconCheck() string {
	return ssrSVG(18,
		`<path d="M20 6 9 17l-5-5"/>`,
	)
}

func ssrIconGift() string {
	return ssrSVG(15,
		`<path d="M12 7v14"/>`,
		`<path d="M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8"/>`,
		`<path d="M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5"/>`,
		`<rect x="3" y="7" width="18" height="4" rx="1"/>`,
	)
}

func ssrIconPanelRight() string {
	return ssrSVG(18,
		`<rect width="18" height="18" x="3" y="3" rx="2"/>`,
		`<path d="M15 3v18"/>`,
	)
}

// 板块图标 path（key 对齐 BOARD_ICON_OPTIONS / AllowedBoardIcons）
var ssrBoardIconInner = map[string]string{
	"code-2":         `<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>`,
	"coffee":         `<path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"/><path d="M6 2v2"/>`,
	"help-circle":    `<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>`,
	"message-square": `<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>`,
	"lightbulb":      `<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>`,
	"book-open":      `<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>`,
	"gamepad-2":      `<line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>`,
	"palette":        `<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>`,
	"music":          `<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>`,
	"camera":         `<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>`,
	"heart":          `<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>`,
	"zap":            `<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>`,
	"globe":          `<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>`,
	"users":          `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>`,
	"briefcase":      `<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>`,
	"graduation-cap": `<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>`,
	"shopping-bag":   `<path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/><path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/>`,
	"map-pin":        `<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>`,
	"megaphone":      `<path d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14"/><path d="M8 6v8"/>`,
	"flame":          `<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>`,
	"star":           `<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>`,
	"folder":         `<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>`,
	"wrench":         `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z"/>`,
	"cpu":            `<path d="M12 20v2"/><path d="M12 2v2"/><path d="M17 20v2"/><path d="M17 2v2"/><path d="M2 12h2"/><path d="M2 17h2"/><path d="M2 7h2"/><path d="M20 12h2"/><path d="M20 17h2"/><path d="M20 7h2"/><path d="M7 20v2"/><path d="M7 2v2"/><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/>`,
}

// 与前端 DEFAULT_ICONS 顺序一致（按 themeIndex 回退）
var ssrBoardDefaultIcons = []string{
	"code-2",
	"coffee",
	"help-circle",
	"message-square",
	"lightbulb",
	"book-open",
	"gamepad-2",
	"palette",
}

// ssrBoardIconSVG 输出板块 Lucide 图标；class 打在 svg 上（与 React BoardIconDisplay 一致）
func ssrBoardIconSVG(icon string, themeIndex int, className string) string {
	key := strings.TrimSpace(strings.ToLower(icon))
	inner, ok := ssrBoardIconInner[key]
	if !ok || inner == "" {
		if themeIndex < 0 {
			themeIndex = 0
		}
		key = ssrBoardDefaultIcons[themeIndex%len(ssrBoardDefaultIcons)]
		inner = ssrBoardIconInner[key]
	}
	return ssrSVGWithClass(18, className, inner)
}

// formatSSRRelativeTime 与前端 formatTime 同规则
func formatSSRRelativeTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	now := time.Now()
	diffSec := now.Sub(t).Seconds()
	if diffSec < 0 {
		diffSec = 0
	}
	if diffSec < 60 {
		return "刚刚"
	}
	if diffSec < 3600 {
		return strconv.Itoa(int(diffSec/60)) + "分钟前"
	}
	if diffSec < 86400 {
		return strconv.Itoa(int(diffSec/3600)) + "小时前"
	}
	diffDay := int(diffSec / 86400)
	if diffDay < 30 {
		return strconv.Itoa(diffDay) + "天前"
	}
	if t.Year() == now.Year() {
		return strconv.Itoa(int(t.Month())) + "月" + strconv.Itoa(t.Day()) + "日"
	}
	return strconv.Itoa(t.Year()) + "年" + strconv.Itoa(int(t.Month())) + "月" + strconv.Itoa(t.Day()) + "日"
}

// formatSSRShortDateTime 与前端 formatShortDateTime 同规则（MM-DD HH:mm）
func formatSSRShortDateTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	local := t.Local()
	pad := func(n int) string {
		if n < 10 {
			return "0" + strconv.Itoa(n)
		}
		return strconv.Itoa(n)
	}
	return pad(int(local.Month())) + "-" + pad(local.Day()) + " " + pad(local.Hour()) + ":" + pad(local.Minute())
}

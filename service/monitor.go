package service

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"git.iioio.com/freefire/jiang13-forum/model"
	"gorm.io/gorm"
)

const (
	monitorFlushSize     = 64
	monitorFlushInterval = 2 * time.Second
	monitorCleanupEvery  = 1 * time.Hour
	monitorQueueMax      = 8192
)

// AccessLogLite 中间件入队用的轻量访问日志（不含 Geo）
type AccessLogLite struct {
	CreatedAt  time.Time
	Method     string
	Path       string
	Status     int
	Bytes      int64
	DurationMs int
	IP         string
	UA         string
	Referer    string
	CDNCountry string // 仅 CDN 头，非 BIN 查询
	IsBot      bool
}

// accessLogJSON 写入 JSONL 的单行结构
type accessLogJSON struct {
	T          string `json:"t"`
	Method     string `json:"method"`
	Path       string `json:"path"`
	Status     int    `json:"status"`
	Bytes      int64  `json:"bytes"`
	DurationMs int    `json:"duration_ms"`
	IP         string `json:"ip"`
	UA         string `json:"ua"`
	Referer    string `json:"referer"`
	Country    string `json:"country"`
	Region     string `json:"region"`
	RegionISO  string `json:"region_iso"`
	City       string `json:"city"`
	ASN        uint   `json:"asn"`
	ASOrg      string `json:"as_org"`
	IsBot      bool   `json:"is_bot"`
}

type monitorDayStats struct {
	dayKey       string
	requests     int64
	traffic      int64
	bots         int64
	status4xx    int64
	status5xx    int64
	uniqueIPs    map[string]struct{}
	statusCounts map[int]int64
}

type monitorMinuteBucket struct {
	count int64
	bytes int64
}

// MonitorService 网站监控：JSONL 请求日志 + 独立 monitor.db pageview
type MonitorService struct {
	settings     *ForumSettingsService
	dataDir      string
	accessLogDir string

	mu     sync.Mutex
	queue  []AccessLogLite
	stopCh chan struct{}
	wg     sync.WaitGroup

	geo *geoIPSuite

	dayMu sync.RWMutex
	day   monitorDayStats

	rtMu     sync.RWMutex
	rtMinute map[string]monitorMinuteBucket // key: 2006-01-02 15:04
}

// NewMonitorService 创建监控服务
func NewMonitorService(settings *ForumSettingsService, dataDir, _ string) *MonitorService {
	accessDir := filepath.Join(dataDir, "logs", "access")
	_ = os.MkdirAll(accessDir, 0o755)
	now := time.Now()
	dayKey := now.Format("2006-01-02")
	return &MonitorService{
		settings:     settings,
		dataDir:      dataDir,
		accessLogDir: accessDir,
		queue:        make([]AccessLogLite, 0, monitorFlushSize),
		stopCh:       make(chan struct{}),
		geo:          newGeoIPSuite(dataDir),
		day: monitorDayStats{
			dayKey:       dayKey,
			uniqueIPs:    map[string]struct{}{},
			statusCounts: map[int]int64{},
		},
		rtMinute: map[string]monitorMinuteBucket{},
	}
}

// StartBackground 启动刷盘与清理协程
func (m *MonitorService) StartBackground() {
	m.wg.Add(2)
	go m.flushLoop()
	go m.cleanupLoop()
}

// Enabled 采集是否开启
func (m *MonitorService) Enabled() bool {
	return m != nil && m.settings != nil && m.settings.MonitorEnabled()
}

// Stop 停止后台任务并刷盘
func (m *MonitorService) Stop() {
	close(m.stopCh)
	m.wg.Wait()
	m.flush()
	if m.geo != nil {
		m.geo.Close()
	}
}

func (m *MonitorService) flushLoop() {
	defer m.wg.Done()
	t := time.NewTicker(monitorFlushInterval)
	defer t.Stop()
	for {
		select {
		case <-m.stopCh:
			return
		case <-t.C:
			m.flush()
		}
	}
}

func (m *MonitorService) cleanupLoop() {
	defer m.wg.Done()
	t := time.NewTicker(monitorCleanupEvery)
	defer t.Stop()
	m.PurgeExpired()
	for {
		select {
		case <-m.stopCh:
			return
		case <-t.C:
			m.PurgeExpired()
			if m.geo != nil {
				m.geo.ReloadIfNeeded()
			}
		}
	}
}

// Enqueue 缓冲一条访问日志（中间件调用；队列满则丢弃新日志）
func (m *MonitorService) Enqueue(row AccessLogLite) {
	if m == nil || !m.settings.MonitorEnabled() {
		return
	}
	m.mu.Lock()
	if len(m.queue) >= monitorQueueMax {
		m.mu.Unlock()
		return
	}
	m.queue = append(m.queue, row)
	needFlush := len(m.queue) >= monitorFlushSize
	m.mu.Unlock()
	if needFlush {
		m.flush()
	}
}

func (m *MonitorService) flush() {
	m.mu.Lock()
	if len(m.queue) == 0 {
		m.mu.Unlock()
		return
	}
	batch := m.queue
	m.queue = make([]AccessLogLite, 0, monitorFlushSize)
	m.mu.Unlock()

	if len(batch) == 0 {
		return
	}

	byDay := map[string][]accessLogJSON{}
	for _, lite := range batch {
		geo := m.resolveGeoLite(lite.IP, lite.CDNCountry)
		row := accessLogJSON{
			T:          lite.CreatedAt.Format(time.RFC3339),
			Method:     lite.Method,
			Path:       lite.Path,
			Status:     lite.Status,
			Bytes:      lite.Bytes,
			DurationMs: lite.DurationMs,
			IP:         lite.IP,
			UA:         lite.UA,
			Referer:    lite.Referer,
			Country:    geo.Country,
			Region:     geo.Region,
			RegionISO:  geo.RegionISO,
			City:       geo.City,
			ASN:        geo.ASN,
			ASOrg:      geo.ASOrg,
			IsBot:      lite.IsBot,
		}
		day := lite.CreatedAt.Local().Format("2006-01-02")
		byDay[day] = append(byDay[day], row)
		m.updateCounters(lite, geo)
	}

	for day, rows := range byDay {
		m.appendJSONL(day, rows)
	}
}

func (m *MonitorService) appendJSONL(day string, rows []accessLogJSON) {
	if len(rows) == 0 {
		return
	}
	path := filepath.Join(m.accessLogDir, day+".jsonl")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	for _, row := range rows {
		_ = enc.Encode(row)
	}
}

func (m *MonitorService) ensureDay(now time.Time) {
	key := now.Local().Format("2006-01-02")
	m.dayMu.Lock()
	defer m.dayMu.Unlock()
	if m.day.dayKey == key {
		return
	}
	m.day = monitorDayStats{
		dayKey:       key,
		uniqueIPs:    map[string]struct{}{},
		statusCounts: map[int]int64{},
	}
}

func (m *MonitorService) updateCounters(lite AccessLogLite, _ GeoInfo) {
	m.ensureDay(lite.CreatedAt)
	minKey := lite.CreatedAt.Local().Truncate(time.Minute).Format("2006-01-02 15:04")

	m.dayMu.Lock()
	if lite.CreatedAt.Local().Format("2006-01-02") == m.day.dayKey {
		m.day.requests++
		m.day.traffic += lite.Bytes
		if lite.IsBot {
			m.day.bots++
		}
		if lite.Status >= 400 && lite.Status < 500 {
			m.day.status4xx++
		}
		if lite.Status >= 500 {
			m.day.status5xx++
		}
		if ip := strings.TrimSpace(lite.IP); ip != "" {
			m.day.uniqueIPs[ip] = struct{}{}
		}
		m.day.statusCounts[lite.Status]++
	}
	m.dayMu.Unlock()

	m.rtMu.Lock()
	b := m.rtMinute[minKey]
	b.count++
	b.bytes += lite.Bytes
	m.rtMinute[minKey] = b
	// 清理 2 小时前的分钟桶
	cutoff := time.Now().Add(-2 * time.Hour).Truncate(time.Minute)
	for k := range m.rtMinute {
		t, err := time.ParseInLocation("2006-01-02 15:04", k, time.Local)
		if err != nil || t.Before(cutoff) {
			delete(m.rtMinute, k)
		}
	}
	m.rtMu.Unlock()
}

// pageViewDB 浏览量独立库；未初始化时返回 nil
func pageViewDB() *gorm.DB {
	return model.MonitorDB
}

// PurgeExpired 按保留天数删除过期 pageview 与 jsonl 请求日志
func (m *MonitorService) PurgeExpired() {
	if m == nil || m.settings == nil {
		return
	}
	cfg := m.settings.MonitorConfig()
	pvCutoff := time.Now().AddDate(0, 0, -cfg.RetentionDays)
	if db := pageViewDB(); db != nil {
		_ = db.Where("created_at < ?", pvCutoff).Delete(&model.PageView{}).Error
	}
	m.purgeOldJSONL(cfg.AccessLogRetentionDays)
}

func (m *MonitorService) purgeOldJSONL(retentionDays int) {
	if retentionDays < 1 {
		retentionDays = 1
	}
	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	entries, err := os.ReadDir(m.accessLogDir)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".jsonl") {
			continue
		}
		base := strings.TrimSuffix(e.Name(), ".jsonl")
		day, err := time.ParseInLocation("2006-01-02", base, time.Local)
		if err != nil {
			continue
		}
		if day.Before(cutoff) {
			_ = os.Remove(filepath.Join(m.accessLogDir, e.Name()))
		}
	}
}

// ShouldSkip 是否按排除规则跳过
func (m *MonitorService) ShouldSkip(path string) bool {
	path = strings.TrimSpace(path)
	if path == "" {
		return true
	}
	lower := strings.ToLower(path)
	if lower == "/api/monitor/pageview" || strings.HasPrefix(lower, "/api/monitor/pageview?") {
		return true
	}
	for _, rule := range m.settings.MonitorConfig().ExcludeRules {
		rule = strings.TrimSpace(rule)
		if rule == "" {
			continue
		}
		r := strings.ToLower(rule)
		if strings.HasPrefix(r, ".") {
			if strings.HasSuffix(lower, r) {
				return true
			}
			continue
		}
		if strings.HasPrefix(lower, r) || lower == strings.TrimSuffix(r, "/") {
			return true
		}
	}
	return false
}

// ResolveClientIP 解析客户端 IP（可选信任代理头）
func (m *MonitorService) ResolveClientIP(r *http.Request, remoteAddr string) string {
	if m.settings.MonitorConfig().TrustProxy {
		for _, h := range []string{"CF-Connecting-IP", "True-Client-IP", "X-Real-IP"} {
			if v := strings.TrimSpace(r.Header.Get(h)); v != "" {
				if ip := firstIP(v); ip != "" {
					return ip
				}
			}
		}
		if v := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); v != "" {
			if ip := firstIP(v); ip != "" {
				return ip
			}
		}
	}
	host, _, err := net.SplitHostPort(remoteAddr)
	if err == nil {
		return host
	}
	return strings.TrimSpace(remoteAddr)
}

func firstIP(v string) string {
	parts := strings.Split(v, ",")
	if len(parts) == 0 {
		return ""
	}
	ip := strings.TrimSpace(parts[0])
	if net.ParseIP(ip) == nil {
		return ""
	}
	return ip
}

func cdnCountryFromRequest(r *http.Request) string {
	if r == nil {
		return ""
	}
	for _, h := range []string{"CF-IPCountry", "CloudFront-Viewer-Country", "X-Country-Code", "X-AppEngine-Country"} {
		if v := normalizeCountryCode(r.Header.Get(h)); v != "" {
			return v
		}
	}
	return ""
}

// ResolveGeo 解析地理与 ASN：CDN 头可补全国家
func (m *MonitorService) ResolveGeo(r *http.Request, ip string) GeoInfo {
	cdn := cdnCountryFromRequest(r)
	return m.resolveGeoLite(ip, cdn)
}

func (m *MonitorService) resolveGeoLite(ip, cdnCountry string) GeoInfo {
	var out GeoInfo
	if m != nil && m.geo != nil {
		out = m.geo.Lookup(ip)
	}
	if out.Country == "" && cdnCountry != "" {
		out.Country = normalizeCountryCode(cdnCountry)
		ApplyGeoZh(&out)
	}
	return out
}

func normalizeCountryCode(v string) string {
	v = strings.ToUpper(strings.TrimSpace(v))
	if len(v) != 2 || v == "XX" || v == "T1" {
		return ""
	}
	for _, c := range v {
		if c < 'A' || c > 'Z' {
			return ""
		}
	}
	return v
}

// EnrichGeoMeta 填充设置中的 Geo 库与访问日志目录状态
func (m *MonitorService) EnrichGeoMeta(cfg *MonitorConfig) {
	if cfg == nil || m == nil {
		return
	}
	cfg.AccessLogDir = m.accessLogDir
	cfg.DefaultExcludeRules = DefaultMonitorExcludeRules()
	if m.settings != nil {
		cfg.AccessLogRetentionDays = m.settings.MonitorConfig().AccessLogRetentionDays
	}
	v4, v6, asn, country := "", "", "", ""
	if m.geo != nil {
		v4, v6, asn, country = m.geo.Paths()
		cfg.IP2LocationV4Available = m.geo.BINV4Available()
		cfg.IP2LocationV6Available = m.geo.BINV6Available()
		cfg.GeoIPASNAvailable = m.geo.ASNAvailable()
		cfg.GeoIPCountryAvailable = m.geo.CountryAvailable()
		cfg.GeoIPAvailable = m.geo.AnyAvailable()
	}
	cfg.IP2LocationV4Path = v4
	cfg.IP2LocationV6Path = v6
	cfg.GeoIPASNPath = asn
	cfg.GeoIPCountryPath = country
}

// MonitorOverview 今日概览
type MonitorOverview struct {
	Enabled   bool  `json:"enabled"`
	Pageviews int64 `json:"pageviews"`
	Visitors  int64 `json:"visitors"`
	UniqueIPs int64 `json:"unique_ips"`
	Traffic   int64 `json:"traffic"`
	Bots      int64 `json:"bots"`
	Requests  int64 `json:"requests"`
	Status4xx int64 `json:"status_4xx"`
	Status5xx int64 `json:"status_5xx"`
}

// MonitorGeoItem 国家排行
type MonitorGeoItem struct {
	Country string `json:"country"`
	Count   int64  `json:"count"`
}

// MonitorRegionItem 省/州排行
type MonitorRegionItem struct {
	Country   string `json:"country"`
	Region    string `json:"region"`
	RegionISO string `json:"region_iso"`
	Count     int64  `json:"count"`
}

// MonitorCityItem 城市排行
type MonitorCityItem struct {
	Country string `json:"country"`
	Region  string `json:"region"`
	City    string `json:"city"`
	Count   int64  `json:"count"`
}

// MonitorASNItem 运营商（ASN）排行
type MonitorASNItem struct {
	ASN   uint   `json:"asn"`
	ASOrg string `json:"as_org"`
	Count int64  `json:"count"`
}

// MonitorGeoResult 地理分布
type MonitorGeoResult struct {
	Range     string              `json:"range"`
	Countries []MonitorGeoItem    `json:"countries"`
	Regions   []MonitorRegionItem `json:"regions"`
	Cities    []MonitorCityItem   `json:"cities"`
	ASNs      []MonitorASNItem    `json:"asns"`
	HasData   bool                `json:"has_data"`
}

// MonitorStatItem 维度排行项
type MonitorStatItem struct {
	Key   string `json:"key"`
	Count int64  `json:"count"`
}

// MonitorRealtime 实时指标
type MonitorRealtime struct {
	Enabled      bool                   `json:"enabled"`
	Requests1m   int64                  `json:"requests_1m"`
	Traffic1m    int64                  `json:"traffic_1m"`
	HourlySeries []MonitorRealtimePoint `json:"hourly_series"`
}

// MonitorRealtimePoint 近 1 小时分钟点
type MonitorRealtimePoint struct {
	Minute string `json:"minute"`
	Count  int64  `json:"count"`
	Bytes  int64  `json:"bytes"`
}

// MonitorLogItem 请求日志行
type MonitorLogItem struct {
	ID         uint      `json:"id"`
	CreatedAt  time.Time `json:"created_at"`
	Method     string    `json:"method"`
	Path       string    `json:"path"`
	Status     int       `json:"status"`
	Bytes      int64     `json:"bytes"`
	DurationMs int       `json:"duration_ms"`
	IP         string    `json:"ip"`
	UA         string    `json:"ua"`
	Referer    string    `json:"referer"`
	Country    string    `json:"country"`
	Region     string    `json:"region"`
	City       string    `json:"city"`
	ASN        uint      `json:"asn"`
	ASOrg      string    `json:"as_org"`
	IsBot      bool      `json:"is_bot"`
}

func startOfLocalDay(t time.Time) time.Time {
	y, m, d := t.Local().Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location())
}

// DashboardTraffic 仪表盘流量摘要（page_views，非 bot）
type DashboardTraffic struct {
	Enabled     bool  `json:"enabled"`
	TodayPV     int64 `json:"today_pv"`
	TodayUV     int64 `json:"today_uv"`
	YesterdayPV int64 `json:"yesterday_pv"`
	TotalPV     int64 `json:"total_pv"`
}

// DashboardTraffic 聚合今日/昨日/累计浏览量
func (m *MonitorService) DashboardTraffic() DashboardTraffic {
	out := DashboardTraffic{Enabled: m != nil && m.settings != nil && m.settings.MonitorEnabled()}
	if m == nil {
		return out
	}
	db := pageViewDB()
	if db == nil {
		return out
	}
	now := time.Now()
	today := startOfLocalDay(now)
	yesterday := today.AddDate(0, 0, -1)
	_ = db.Model(&model.PageView{}).Where("created_at >= ? AND is_bot = ?", today, false).Count(&out.TodayPV).Error
	_ = db.Model(&model.PageView{}).Where("created_at >= ? AND is_bot = ? AND ip <> ''", today, false).
		Distinct("ip").Count(&out.TodayUV).Error
	_ = db.Model(&model.PageView{}).
		Where("created_at >= ? AND created_at < ? AND is_bot = ?", yesterday, today, false).
		Count(&out.YesterdayPV).Error
	_ = db.Model(&model.PageView{}).Where("is_bot = ?", false).Count(&out.TotalPV).Error
	return out
}

// PageViewInput 前台信标入参
type PageViewInput struct {
	Path     string `json:"path"`
	Referrer string `json:"referrer"`
}

// NormalizePageViewPath 校验并规范化前端路径
func NormalizePageViewPath(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" || !strings.HasPrefix(raw, "/") {
		return "", false
	}
	if strings.Contains(raw, "://") || strings.Contains(raw, "\\") {
		return "", false
	}
	if i := strings.IndexByte(raw, '#'); i >= 0 {
		raw = raw[:i]
	}
	if len(raw) > 512 {
		raw = raw[:512]
	}
	pathOnly := raw
	if i := strings.IndexByte(raw, '?'); i >= 0 {
		pathOnly = raw[:i]
	}
	if shouldIgnorePageViewPath(pathOnly) {
		return "", false
	}
	return raw, true
}

func shouldIgnorePageViewPath(path string) bool {
	lower := strings.ToLower(path)
	prefixes := []string{
		"/admin", "/login", "/register", "/forgot-password",
		"/oauth", "/api", "/health", "/uploads", "/media",
	}
	for _, p := range prefixes {
		if lower == p || strings.HasPrefix(lower, p+"/") {
			return true
		}
	}
	return false
}

// RecordPageView 写入一条 SPA 浏览记录
func (m *MonitorService) RecordPageView(r *http.Request, remoteAddr string, in PageViewInput) error {
	if m == nil || !m.settings.MonitorEnabled() {
		return nil
	}
	db := pageViewDB()
	if db == nil {
		return nil
	}
	path, ok := NormalizePageViewPath(in.Path)
	if !ok {
		return nil
	}
	ref := strings.TrimSpace(in.Referrer)
	if strings.Contains(ref, "://") {
		if len(ref) > 512 {
			ref = ref[:512]
		}
	} else if ref != "" && !strings.HasPrefix(ref, "/") {
		ref = ""
	}
	if len(ref) > 512 {
		ref = ref[:512]
	}
	ip := m.ResolveClientIP(r, remoteAddr)
	ua := r.UserAgent()
	if len(ua) > 512 {
		ua = ua[:512]
	}
	geo := m.ResolveGeo(r, ip)
	row := model.PageView{
		CreatedAt: time.Now(),
		Path:      path,
		Referrer:  ref,
		IP:        ip,
		UA:        ua,
		Country:   geo.Country,
		Region:    geo.Region,
		RegionISO: geo.RegionISO,
		City:      geo.City,
		ASN:       geo.ASN,
		ASOrg:     geo.ASOrg,
		IsBot:     IsSEOCrawler(ua) || isGenericBot(ua),
	}
	return db.Create(&row).Error
}

func parseMonitorRange(rangeKey string) (time.Time, string) {
	now := time.Now()
	switch strings.ToLower(strings.TrimSpace(rangeKey)) {
	case "7d":
		return now.AddDate(0, 0, -7), "7d"
	case "90d":
		return now.AddDate(0, 0, -90), "90d"
	case "1d", "today":
		return startOfLocalDay(now), "1d"
	default:
		return now.AddDate(0, 0, -30), "30d"
	}
}

// OverviewToday 今日指标（请求类来自内存 + JSONL 口径；浏览量来自 page_views）
func (m *MonitorService) OverviewToday() MonitorOverview {
	out := MonitorOverview{Enabled: m.settings.MonitorEnabled()}
	m.ensureDay(time.Now())

	m.dayMu.RLock()
	if m.day.dayKey == time.Now().Local().Format("2006-01-02") {
		out.Requests = m.day.requests
		out.Traffic = m.day.traffic
		out.Bots = m.day.bots
		out.Status4xx = m.day.status4xx
		out.Status5xx = m.day.status5xx
		out.UniqueIPs = int64(len(m.day.uniqueIPs))
	}
	m.dayMu.RUnlock()

	db := pageViewDB()
	if db == nil {
		return out
	}
	start := startOfLocalDay(time.Now())
	_ = db.Model(&model.PageView{}).Where("created_at >= ? AND is_bot = ?", start, false).Count(&out.Pageviews).Error
	_ = db.Model(&model.PageView{}).Where("created_at >= ? AND is_bot = ? AND ip <> ''", start, false).
		Distinct("ip").Count(&out.Visitors).Error
	return out
}

// GeoStats 地理分布（基于 pageview）
func (m *MonitorService) GeoStats(rangeKey string) MonitorGeoResult {
	since, rk := parseMonitorRange(rangeKey)
	out := MonitorGeoResult{
		Range:     rk,
		Countries: []MonitorGeoItem{},
		Regions:   []MonitorRegionItem{},
		Cities:    []MonitorCityItem{},
		ASNs:      []MonitorASNItem{},
	}
	db := pageViewDB()
	if db == nil {
		return out
	}

	type countryRow struct {
		Country string
		Count   int64
	}
	var countries []countryRow
	_ = db.Model(&model.PageView{}).
		Select("country, COUNT(*) as count").
		Where("created_at >= ? AND country <> '' AND is_bot = ?", since, false).
		Group("country").
		Order("count DESC").
		Limit(50).
		Scan(&countries).Error
	for _, r := range countries {
		out.Countries = append(out.Countries, MonitorGeoItem{Country: r.Country, Count: r.Count})
	}

	type regionRow struct {
		Country   string
		Region    string
		RegionISO string
		Count     int64
	}
	var regions []regionRow
	_ = db.Model(&model.PageView{}).
		Select("country, region, region_iso, COUNT(*) as count").
		Where("created_at >= ? AND country <> '' AND (region <> '' OR region_iso <> '') AND is_bot = ?", since, false).
		Group("country, region, region_iso").
		Order("count DESC").
		Limit(80).
		Scan(&regions).Error
	for _, r := range regions {
		out.Regions = append(out.Regions, MonitorRegionItem{
			Country: r.Country, Region: r.Region, RegionISO: r.RegionISO, Count: r.Count,
		})
	}

	type cityRow struct {
		Country string
		Region  string
		City    string
		Count   int64
	}
	var cities []cityRow
	_ = db.Model(&model.PageView{}).
		Select("country, region, city, COUNT(*) as count").
		Where("created_at >= ? AND city <> '' AND is_bot = ?", since, false).
		Group("country, region, city").
		Order("count DESC").
		Limit(50).
		Scan(&cities).Error
	for _, r := range cities {
		out.Cities = append(out.Cities, MonitorCityItem{
			Country: r.Country, Region: r.Region, City: r.City, Count: r.Count,
		})
	}

	type asnRow struct {
		ASN   uint
		ASOrg string
		Count int64
	}
	var asns []asnRow
	_ = db.Model(&model.PageView{}).
		Select("asn, as_org, COUNT(*) as count").
		Where("created_at >= ? AND asn > 0 AND is_bot = ?", since, false).
		Group("asn, as_org").
		Order("count DESC").
		Limit(50).
		Scan(&asns).Error
	for _, r := range asns {
		out.ASNs = append(out.ASNs, MonitorASNItem{ASN: r.ASN, ASOrg: r.ASOrg, Count: r.Count})
	}

	out.HasData = len(out.Countries) > 0 || len(out.Regions) > 0 || len(out.Cities) > 0 || len(out.ASNs) > 0
	return out
}

// DimStats 维度排行
func (m *MonitorService) DimStats(dim, rangeKey string) []MonitorStatItem {
	since, rk := parseMonitorRange(rangeKey)
	dim = strings.ToLower(strings.TrimSpace(dim))
	out := []MonitorStatItem{}
	db := pageViewDB()

	switch dim {
	case "url", "path":
		if db == nil {
			return out
		}
		type row struct {
			Path  string
			Count int64
		}
		var rows []row
		_ = db.Model(&model.PageView{}).
			Select("path, COUNT(*) as count").
			Where("created_at >= ?", since).
			Group("path").Order("count DESC").Limit(50).Scan(&rows).Error
		for _, r := range rows {
			out = append(out, MonitorStatItem{Key: r.Path, Count: r.Count})
		}
	case "referer", "referrer":
		if db == nil {
			return out
		}
		type row struct {
			Referrer string
			Count    int64
		}
		var rows []row
		_ = db.Model(&model.PageView{}).
			Select("CASE WHEN referrer = '' THEN '(直接访问)' ELSE referrer END as referrer, COUNT(*) as count").
			Where("created_at >= ?", since).
			Group("referrer").Order("count DESC").Limit(50).Scan(&rows).Error
		for _, r := range rows {
			out = append(out, MonitorStatItem{Key: r.Referrer, Count: r.Count})
		}
	case "status":
		if rk == "1d" {
			m.ensureDay(time.Now())
			m.dayMu.RLock()
			if m.day.dayKey == time.Now().Local().Format("2006-01-02") {
				type kv struct {
					status int
					count  int64
				}
				list := make([]kv, 0, len(m.day.statusCounts))
				for st, c := range m.day.statusCounts {
					list = append(list, kv{st, c})
				}
				sort.Slice(list, func(i, j int) bool { return list[i].count > list[j].count })
				n := len(list)
				if n > 50 {
					n = 50
				}
				for i := 0; i < n; i++ {
					out = append(out, MonitorStatItem{Key: fmt.Sprintf("%d", list[i].status), Count: list[i].count})
				}
			}
			m.dayMu.RUnlock()
		}
		if len(out) == 0 {
			counts := m.scanJSONLStatusCounts(since)
			type kv struct {
				k string
				c int64
			}
			list := make([]kv, 0, len(counts))
			for st, c := range counts {
				list = append(list, kv{fmt.Sprintf("%d", st), c})
			}
			sort.Slice(list, func(i, j int) bool { return list[i].c > list[j].c })
			n := len(list)
			if n > 50 {
				n = 50
			}
			for i := 0; i < n; i++ {
				out = append(out, MonitorStatItem{Key: list[i].k, Count: list[i].c})
			}
		}
	case "browser", "os", "device":
		if db == nil {
			return out
		}
		var uas []string
		_ = db.Model(&model.PageView{}).
			Where("created_at >= ?", since).
			Limit(20000).
			Pluck("ua", &uas).Error
		counts := map[string]int64{}
		for _, ua := range uas {
			key := classifyUA(ua, dim)
			counts[key]++
		}
		type kv struct {
			k string
			c int64
		}
		list := make([]kv, 0, len(counts))
		for k, c := range counts {
			list = append(list, kv{k, c})
		}
		sort.Slice(list, func(i, j int) bool { return list[i].c > list[j].c })
		n := len(list)
		if n > 50 {
			n = 50
		}
		for i := 0; i < n; i++ {
			out = append(out, MonitorStatItem{Key: list[i].k, Count: list[i].c})
		}
	default:
		return m.DimStats("url", rangeKey)
	}
	return out
}

func (m *MonitorService) scanJSONLStatusCounts(since time.Time) map[int]int64 {
	counts := map[int]int64{}
	for _, path := range m.listJSONLFilesSince(since) {
		rows, _ := m.readJSONLFile(path)
		for _, row := range rows {
			t, err := time.Parse(time.RFC3339, row.T)
			if err != nil || t.Before(since) {
				continue
			}
			counts[row.Status]++
		}
	}
	return counts
}

func classifyUA(ua, dim string) string {
	l := strings.ToLower(ua)
	if l == "" {
		return "未知"
	}
	switch dim {
	case "browser":
		switch {
		case strings.Contains(l, "edg/"):
			return "Edge"
		case strings.Contains(l, "chrome") && !strings.Contains(l, "edg"):
			return "Chrome"
		case strings.Contains(l, "firefox"):
			return "Firefox"
		case strings.Contains(l, "safari") && !strings.Contains(l, "chrome"):
			return "Safari"
		case strings.Contains(l, "msie") || strings.Contains(l, "trident"):
			return "IE"
		default:
			return "其他"
		}
	case "os":
		switch {
		case strings.Contains(l, "windows"):
			return "Windows"
		case strings.Contains(l, "android"):
			return "Android"
		case strings.Contains(l, "iphone") || strings.Contains(l, "ipad") || strings.Contains(l, "ios"):
			return "iOS"
		case strings.Contains(l, "mac os") || strings.Contains(l, "macintosh"):
			return "macOS"
		case strings.Contains(l, "linux"):
			return "Linux"
		default:
			return "其他"
		}
	default:
		switch {
		case strings.Contains(l, "mobile") || strings.Contains(l, "android") || strings.Contains(l, "iphone"):
			return "Mobile"
		case strings.Contains(l, "ipad") || strings.Contains(l, "tablet"):
			return "Tablet"
		default:
			return "Desktop"
		}
	}
}

// Realtime 近 1 分钟 + 近 1 小时序列（内存环）
func (m *MonitorService) Realtime() MonitorRealtime {
	out := MonitorRealtime{
		Enabled:      m.settings.MonitorEnabled(),
		HourlySeries: make([]MonitorRealtimePoint, 0, 60),
	}
	now := time.Now()
	since1m := now.Add(-1 * time.Minute).Truncate(time.Minute)

	m.rtMu.RLock()
	for k, b := range m.rtMinute {
		t, err := time.ParseInLocation("2006-01-02 15:04", k, time.Local)
		if err != nil {
			continue
		}
		if !t.Before(since1m) {
			out.Requests1m += b.count
			out.Traffic1m += b.bytes
		}
	}
	byMin := map[string]monitorMinuteBucket{}
	for k, b := range m.rtMinute {
		byMin[k] = b
	}
	m.rtMu.RUnlock()

	for i := 59; i >= 0; i-- {
		t := now.Add(-time.Duration(i) * time.Minute).Truncate(time.Minute)
		key := t.Format("2006-01-02 15:04")
		pt := MonitorRealtimePoint{Minute: t.Format("15:04")}
		if r, ok := byMin[key]; ok {
			pt.Count = r.count
			pt.Bytes = r.bytes
		}
		out.HourlySeries = append(out.HourlySeries, pt)
	}
	return out
}

// ListLogs 从 JSONL 分页筛选请求日志
func (m *MonitorService) ListLogs(page, size int, method, path, status, ip string) (items []MonitorLogItem, total int64) {
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 20
	}
	if size > 100 {
		size = 100
	}
	retention := m.settings.MonitorConfig().AccessLogRetentionDays
	since := time.Now().AddDate(0, 0, -retention)

	var all []accessLogJSON
	for _, fp := range m.listJSONLFilesSince(since) {
		rows, err := m.readJSONLFile(fp)
		if err != nil {
			continue
		}
		all = append(all, rows...)
	}
	// 新到旧
	sort.Slice(all, func(i, j int) bool {
		return all[i].T > all[j].T
	})

	method = strings.TrimSpace(strings.ToUpper(method))
	path = strings.TrimSpace(path)
	status = strings.TrimSpace(status)
	ip = strings.TrimSpace(ip)

	filtered := make([]accessLogJSON, 0, len(all))
	for _, row := range all {
		if method != "" && strings.ToUpper(row.Method) != method {
			continue
		}
		if path != "" && !strings.Contains(row.Path, path) {
			continue
		}
		if status != "" && !strings.HasPrefix(fmt.Sprintf("%d", row.Status), status) {
			continue
		}
		if ip != "" && !strings.Contains(row.IP, ip) {
			continue
		}
		filtered = append(filtered, row)
	}

	total = int64(len(filtered))
	start := (page - 1) * size
	if start >= len(filtered) {
		return []MonitorLogItem{}, total
	}
	end := start + size
	if end > len(filtered) {
		end = len(filtered)
	}
	items = make([]MonitorLogItem, 0, end-start)
	for i, row := range filtered[start:end] {
		created, _ := time.Parse(time.RFC3339, row.T)
		items = append(items, MonitorLogItem{
			ID:         uint(start + i + 1),
			CreatedAt:  created,
			Method:     row.Method,
			Path:       row.Path,
			Status:     row.Status,
			Bytes:      row.Bytes,
			DurationMs: row.DurationMs,
			IP:         row.IP,
			UA:         row.UA,
			Referer:    row.Referer,
			Country:    row.Country,
			Region:     row.Region,
			City:       row.City,
			ASN:        row.ASN,
			ASOrg:      row.ASOrg,
			IsBot:      row.IsBot,
		})
	}
	return items, total
}

func (m *MonitorService) listJSONLFilesSince(since time.Time) []string {
	entries, err := os.ReadDir(m.accessLogDir)
	if err != nil {
		return nil
	}
	var files []string
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".jsonl") {
			continue
		}
		base := strings.TrimSuffix(e.Name(), ".jsonl")
		day, err := time.ParseInLocation("2006-01-02", base, time.Local)
		if err != nil {
			continue
		}
		if day.Before(startOfLocalDay(since)) {
			continue
		}
		files = append(files, filepath.Join(m.accessLogDir, e.Name()))
	}
	sort.Strings(files)
	return files
}

func (m *MonitorService) readJSONLFile(path string) ([]accessLogJSON, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var rows []accessLogJSON
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var row accessLogJSON
		if err := json.Unmarshal([]byte(line), &row); err != nil {
			continue
		}
		rows = append(rows, row)
	}
	return rows, sc.Err()
}

// BuildAccessLog 从请求构造轻量日志（热路径不查 Geo）
func (m *MonitorService) BuildAccessLog(r *http.Request, remoteAddr string, status int, bytes int64, durationMs int) AccessLogLite {
	ip := m.ResolveClientIP(r, remoteAddr)
	ua := r.UserAgent()
	if len(ua) > 512 {
		ua = ua[:512]
	}
	ref := r.Referer()
	if len(ref) > 512 {
		ref = ref[:512]
	}
	path := r.URL.Path
	if len(path) > 512 {
		path = path[:512]
	}
	return AccessLogLite{
		CreatedAt:  time.Now(),
		Method:     r.Method,
		Path:       path,
		Status:     status,
		Bytes:      bytes,
		DurationMs: durationMs,
		IP:         ip,
		UA:         ua,
		Referer:    ref,
		CDNCountry: cdnCountryFromRequest(r),
		IsBot:      IsSEOCrawler(ua) || isGenericBot(ua),
	}
}

func isGenericBot(ua string) bool {
	l := strings.ToLower(ua)
	for _, t := range []string{"bot", "spider", "crawl", "slurp", "curl/", "wget/", "python-requests", "go-http-client"} {
		if strings.Contains(l, t) {
			return true
		}
	}
	return false
}

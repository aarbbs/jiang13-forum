package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"git.iioio.com/freefire/jiang13-forum/model"
)

// AppVersion 由 cmd 通过 SetAppVersion 注入（ldflags）
var AppVersion = "dev"

// SetAppVersion 设置运行时版本号
func SetAppVersion(v string) {
	v = strings.TrimSpace(v)
	if v != "" {
		AppVersion = v
	}
}

func newCommunityInstanceID() string {
	return uuid.NewString()
}

const (
	communityHeartbeatInterval  = 24 * time.Hour
	communityHeartbeatTimeout   = 8 * time.Second
	communityOnlineWithin       = 72 * time.Hour
	maxCommunitySiteURLLen      = 512
	maxCommunitySiteNameLen     = 128
	maxCommunityVersionLen      = 32
	maxCommunityInstanceIDLen   = 64
	maxCommunityFeaturedNoteLen = 64
)

var (
	ErrCommunityHubDisabled = errors.New("本站未开启社区枢纽")
	ErrCommunityBadPayload  = errors.New("心跳参数无效")

	// communityHubBaseURL 出站枢纽根地址（写死官方站；测试可临时覆盖）
	communityHubBaseURL = DefaultCommunityHubURL
)

// CommunityHeartbeatPayload 出站 / 入站心跳体
type CommunityHeartbeatPayload struct {
	InstanceID string `json:"instance_id"`
	SiteURL    string `json:"site_url"`
	SiteName   string `json:"site_name"`
	Version    string `json:"version"`
	Users      int64  `json:"users"`
	Posts      int64  `json:"posts"`
}

// CommunityInstanceView 管理端列表项
type CommunityInstanceView struct {
	InstanceID   string    `json:"instance_id"`
	SiteURL      string    `json:"site_url"`
	SiteName     string    `json:"site_name"`
	Version      string    `json:"version"`
	Users        int64     `json:"users"`
	Posts        int64     `json:"posts"`
	FirstSeenAt  time.Time `json:"first_seen_at"`
	LastSeenAt   time.Time `json:"last_seen_at"`
	Online       bool      `json:"online"`
	Featured     bool      `json:"featured"`
	FeaturedNote string    `json:"featured_note"`
}

// CommunityShowcaseItem 公开展柜条目（不含敏感字段）
type CommunityShowcaseItem struct {
	SiteURL      string `json:"site_url"`
	SiteName     string `json:"site_name"`
	Version      string `json:"version"`
	FeaturedNote string `json:"featured_note,omitempty"`
}

// CommunityFeatureInput 管理端精选请求
type CommunityFeatureInput struct {
	Featured     bool   `json:"featured"`
	FeaturedNote string `json:"featured_note"`
}

// CommunityService 可选社区上报 + 枢纽接收
type CommunityService struct {
	settings *ForumSettingsService
	client   *http.Client
	stopCh   chan struct{}
	wg       sync.WaitGroup
	kickCh   chan struct{}
}

// NewCommunityService 创建社区服务
func NewCommunityService(settings *ForumSettingsService) *CommunityService {
	return &CommunityService{
		settings: settings,
		client:   &http.Client{Timeout: communityHeartbeatTimeout},
		stopCh:   make(chan struct{}),
		kickCh:   make(chan struct{}, 1),
	}
}

// StartBackground 启动 24h 心跳循环
func (c *CommunityService) StartBackground() {
	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		timer := time.NewTimer(30 * time.Second)
		defer timer.Stop()
		for {
			select {
			case <-c.stopCh:
				return
			case <-c.kickCh:
				c.trySendHeartbeat()
				if !timer.Stop() {
					select {
					case <-timer.C:
					default:
					}
				}
				timer.Reset(communityHeartbeatInterval)
			case <-timer.C:
				c.trySendHeartbeat()
				timer.Reset(communityHeartbeatInterval)
			}
		}
	}()
}

// Stop 停止后台心跳
func (c *CommunityService) Stop() {
	select {
	case <-c.stopCh:
	default:
		close(c.stopCh)
	}
	c.wg.Wait()
}

// KickHeartbeat 请求尽快发送一次心跳（开启上报时调用）
func (c *CommunityService) KickHeartbeat() {
	select {
	case c.kickCh <- struct{}{}:
	default:
	}
}

func (c *CommunityService) trySendHeartbeat() {
	_ = c.SendHeartbeatOnce("")
}

// SendHeartbeatOnce 立即发送一次心跳；requestOrigin 可在管理端保存时传入以补全本站地址
func (c *CommunityService) SendHeartbeatOnce(requestOrigin string) error {
	cfg := c.settings.CommunityConfig()
	if !cfg.ReportEnabled {
		return nil
	}
	if requestOrigin != "" {
		if _, err := c.settings.EnsureCommunitySiteURL(requestOrigin); err != nil {
			log.Printf("[community] 组装心跳失败: %v", err)
			return err
		}
	}
	payload, err := c.buildPayload(requestOrigin)
	if err != nil {
		log.Printf("[community] 组装心跳失败: %v", err)
		return err
	}
	hub := strings.TrimRight(communityHubBaseURL, "/")
	if hub == "" {
		hub = DefaultCommunityHubURL
	}
	endpoint := hub + "/api/community/heartbeat"
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		log.Printf("[community] 创建请求失败: %v", err)
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "jiang13-forum/"+AppVersion)
	resp, err := c.client.Do(req)
	if err != nil {
		log.Printf("[community] 上报失败: %v", err)
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		err := fmt.Errorf("上报被拒绝: HTTP %d", resp.StatusCode)
		log.Printf("[community] %v", err)
		return err
	}
	return nil
}

func (c *CommunityService) buildPayload(requestOrigin string) (*CommunityHeartbeatPayload, error) {
	id, err := c.settings.EnsureCommunityInstanceID()
	if err != nil {
		return nil, err
	}
	siteURL := c.settings.CommunitySiteURL(requestOrigin)
	if siteURL == "" {
		return nil, fmt.Errorf("无法确定本站公开地址：请先在 OIDC 设置中填写 ROOT_URL，或通过浏览器管理端开启上报")
	}
	var users, posts int64
	_ = model.DB.Model(&model.User{}).Count(&users).Error
	_ = model.DB.Model(&model.Post{}).Where("status = ?", model.ContentStatusPublished).Count(&posts).Error
	brand := c.settings.SiteBranding()
	return &CommunityHeartbeatPayload{
		InstanceID: id,
		SiteURL:    truncateRunes(siteURL, maxCommunitySiteURLLen),
		SiteName:   truncateRunes(brand.Name, maxCommunitySiteNameLen),
		Version:    truncateRunes(AppVersion, maxCommunityVersionLen),
		Users:      users,
		Posts:      posts,
	}, nil
}

// ReceiveHeartbeat 枢纽接收心跳并 upsert
func (c *CommunityService) ReceiveHeartbeat(in CommunityHeartbeatPayload, remoteIP string) error {
	if !c.settings.CommunityConfig().HubEnabled {
		return ErrCommunityHubDisabled
	}
	in.InstanceID = strings.TrimSpace(in.InstanceID)
	in.SiteURL = strings.TrimSpace(in.SiteURL)
	in.SiteName = strings.TrimSpace(in.SiteName)
	in.Version = strings.TrimSpace(in.Version)
	if in.InstanceID == "" || len(in.InstanceID) > maxCommunityInstanceIDLen {
		return ErrCommunityBadPayload
	}
	if err := validateCommunitySiteURL(in.SiteURL); err != nil {
		return err
	}
	in.SiteURL = truncateRunes(in.SiteURL, maxCommunitySiteURLLen)
	in.SiteName = truncateRunes(in.SiteName, maxCommunitySiteNameLen)
	in.Version = truncateRunes(in.Version, maxCommunityVersionLen)
	if in.Users < 0 {
		in.Users = 0
	}
	if in.Posts < 0 {
		in.Posts = 0
	}
	now := time.Now()
	var row model.CommunityInstance
	res := model.DB.Where("instance_id = ?", in.InstanceID).Limit(1).Find(&row)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		row = model.CommunityInstance{
			InstanceID:  in.InstanceID,
			SiteURL:     in.SiteURL,
			SiteName:    in.SiteName,
			Version:     in.Version,
			Users:       in.Users,
			Posts:       in.Posts,
			RemoteIP:    truncateRunes(remoteIP, 64),
			FirstSeenAt: now,
			LastSeenAt:  now,
		}
		return model.DB.Create(&row).Error
	}
	row.SiteURL = in.SiteURL
	row.SiteName = in.SiteName
	row.Version = in.Version
	row.Users = in.Users
	row.Posts = in.Posts
	row.RemoteIP = truncateRunes(remoteIP, 64)
	row.LastSeenAt = now
	return model.DB.Save(&row).Error
}

// ListInstances 管理端实例列表（按最近心跳倒序）
func (c *CommunityService) ListInstances() ([]CommunityInstanceView, error) {
	var rows []model.CommunityInstance
	if err := model.DB.Order("last_seen_at DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	now := time.Now()
	out := make([]CommunityInstanceView, 0, len(rows))
	for _, r := range rows {
		out = append(out, CommunityInstanceView{
			InstanceID:   r.InstanceID,
			SiteURL:      r.SiteURL,
			SiteName:     r.SiteName,
			Version:      r.Version,
			Users:        r.Users,
			Posts:        r.Posts,
			FirstSeenAt:  r.FirstSeenAt,
			LastSeenAt:   r.LastSeenAt,
			Online:       now.Sub(r.LastSeenAt) <= communityOnlineWithin,
			Featured:     r.Featured,
			FeaturedNote: r.FeaturedNote,
		})
	}
	return out, nil
}

// SetInstanceFeatured 人工精选 / 取消；心跳无法自助上柜
func (c *CommunityService) SetInstanceFeatured(instanceID string, in CommunityFeatureInput) (*CommunityInstanceView, error) {
	instanceID = strings.TrimSpace(instanceID)
	if instanceID == "" {
		return nil, ErrCommunityBadPayload
	}
	var row model.CommunityInstance
	if err := model.DB.Where("instance_id = ?", instanceID).First(&row).Error; err != nil {
		return nil, err
	}
	row.Featured = in.Featured
	if in.Featured {
		row.FeaturedNote = truncateRunes(strings.TrimSpace(in.FeaturedNote), maxCommunityFeaturedNoteLen)
	} else {
		row.FeaturedNote = ""
	}
	if err := model.DB.Save(&row).Error; err != nil {
		return nil, err
	}
	now := time.Now()
	return &CommunityInstanceView{
		InstanceID:   row.InstanceID,
		SiteURL:      row.SiteURL,
		SiteName:     row.SiteName,
		Version:      row.Version,
		Users:        row.Users,
		Posts:        row.Posts,
		FirstSeenAt:  row.FirstSeenAt,
		LastSeenAt:   row.LastSeenAt,
		Online:       now.Sub(row.LastSeenAt) <= communityOnlineWithin,
		Featured:     row.Featured,
		FeaturedNote: row.FeaturedNote,
	}, nil
}

// ListShowcase 公开展柜：仅精选；枢纽关闭时返回空
func (c *CommunityService) ListShowcase() ([]CommunityShowcaseItem, error) {
	if !c.settings.CommunityConfig().HubEnabled {
		return []CommunityShowcaseItem{}, nil
	}
	var rows []model.CommunityInstance
	if err := model.DB.Where("featured = ?", true).Order("last_seen_at DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]CommunityShowcaseItem, 0, len(rows))
	for _, r := range rows {
		if validateCommunitySiteURL(r.SiteURL) != nil {
			continue
		}
		out = append(out, CommunityShowcaseItem{
			SiteURL:      r.SiteURL,
			SiteName:     r.SiteName,
			Version:      r.Version,
			FeaturedNote: r.FeaturedNote,
		})
	}
	return out, nil
}

func validateCommunitySiteURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return ErrCommunityBadPayload
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return ErrCommunityBadPayload
	}
	return nil
}

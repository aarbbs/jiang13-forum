package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"git.iioio.com/freefire/jiang13-forum/model"
)

var (
	ErrGiteaNotConfigured = errors.New("Gitea 同步未配置或未启用")
	ErrGiteaSyncBusy      = errors.New("同步正在进行中，请稍后再试")
)

// GiteaRepoView 前台展示
type GiteaRepoView struct {
	ID              uint       `json:"id"`
	GiteaID         int64      `json:"gitea_id"`
	OwnerLogin      string     `json:"owner_login"`
	Name            string     `json:"name"`
	FullName        string     `json:"full_name"`
	Description     string     `json:"description"`
	HTMLURL         string     `json:"html_url"`
	UpdatedAtRemote *time.Time `json:"updated_at_remote"`
	ForumUserID     *uint      `json:"forum_user_id,omitempty"`
	SyncedAt        time.Time  `json:"synced_at"`
}

// GiteaService 从 Gitea API 同步会员公开仓库
type GiteaService struct {
	settings *ForumSettingsService
	client   *http.Client
	mu       sync.Mutex
	syncing  bool
	stopCh   chan struct{}
	wg       sync.WaitGroup
}

func NewGiteaService(settings *ForumSettingsService) *GiteaService {
	return &GiteaService{
		settings: settings,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		stopCh: make(chan struct{}),
	}
}

// StartBackgroundSync 按配置间隔后台同步；失败只记日志
func (g *GiteaService) StartBackgroundSync() {
	g.wg.Add(1)
	go func() {
		defer g.wg.Done()
		// 启动后稍等再首次尝试，避免拖慢启动
		timer := time.NewTimer(15 * time.Second)
		defer timer.Stop()
		for {
			select {
			case <-g.stopCh:
				return
			case <-timer.C:
				if _, err := g.SyncRepos(); err != nil && !errors.Is(err, ErrGiteaNotConfigured) && !errors.Is(err, ErrGiteaSyncBusy) {
					log.Printf("[gitea] 后台同步失败: %v", err)
				}
				cfg := g.settings.GiteaSyncConfig()
				interval := time.Duration(cfg.SyncIntervalMin) * time.Minute
				if interval < 5*time.Minute {
					interval = 5 * time.Minute
				}
				timer.Reset(interval)
			}
		}
	}()
}

// Stop 停止后台同步
func (g *GiteaService) Stop() {
	select {
	case <-g.stopCh:
	default:
		close(g.stopCh)
	}
	g.wg.Wait()
}

// ListPublic 列出已同步的公开仓库
func (g *GiteaService) ListPublic(page, size int) ([]GiteaRepoView, int64, error) {
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 30
	}
	if size > 100 {
		size = 100
	}
	var total int64
	q := model.DB.Model(&model.GiteaRepo{}).Where("private = ?", false)
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []model.GiteaRepo
	err := model.DB.Where("private = ?", false).
		Order("updated_at_remote desc, id desc").
		Offset((page - 1) * size).
		Limit(size).
		Find(&rows).Error
	if err != nil {
		return nil, 0, err
	}
	out := make([]GiteaRepoView, 0, len(rows))
	for _, r := range rows {
		out = append(out, toGiteaRepoView(r))
	}
	return out, total, nil
}

// SyncRepos 按论坛用户名拉取 Gitea 公开仓并 upsert
func (g *GiteaService) SyncRepos() (int, error) {
	cfg := g.settings.GiteaSyncConfig()
	if !cfg.Ready {
		return 0, ErrGiteaNotConfigured
	}

	g.mu.Lock()
	if g.syncing {
		g.mu.Unlock()
		return 0, ErrGiteaSyncBusy
	}
	g.syncing = true
	g.mu.Unlock()
	defer func() {
		g.mu.Lock()
		g.syncing = false
		g.mu.Unlock()
	}()

	var users []model.User
	if err := model.DB.Where("banned = ?", false).Select("id", "username").Find(&users).Error; err != nil {
		return 0, err
	}

	seen := make(map[int64]struct{})
	syncedOwners := make(map[string]struct{})
	now := time.Now()
	upserted := 0

	for _, u := range users {
		username := strings.TrimSpace(u.Username)
		if username == "" {
			continue
		}
		repos, err := g.fetchUserPublicRepos(cfg.BaseURL, cfg.Token, username)
		if err != nil {
			// 用户在 Gitea 不存在等：跳过，不中断整次同步
			log.Printf("[gitea] 跳过用户 %s: %v", username, err)
			continue
		}
		syncedOwners[strings.ToLower(username)] = struct{}{}
		uid := u.ID
		for _, gr := range repos {
			if gr.Private {
				continue
			}
			seen[gr.ID] = struct{}{}
			owner := gr.Owner.Login
			if owner == "" {
				owner = username
			}
			row := model.GiteaRepo{
				GiteaID:         gr.ID,
				OwnerLogin:      owner,
				Name:            gr.Name,
				FullName:        gr.FullName,
				Description:     truncStr(gr.Description, 2048),
				HTMLURL:         gr.HTMLURL,
				Private:         false,
				UpdatedAtRemote: parseGiteaTime(gr.UpdatedAt),
				ForumUserID:     &uid,
				SyncedAt:        now,
			}
			var existing model.GiteaRepo
			err := model.DB.Where("gitea_id = ?", gr.ID).First(&existing).Error
			if err != nil {
				if err := model.DB.Create(&row).Error; err != nil {
					log.Printf("[gitea] 创建仓库失败 %s: %v", gr.FullName, err)
					continue
				}
			} else {
				row.ID = existing.ID
				if err := model.DB.Model(&existing).Updates(map[string]any{
					"owner_login":       row.OwnerLogin,
					"name":              row.Name,
					"full_name":         row.FullName,
					"description":       row.Description,
					"html_url":          row.HTMLURL,
					"private":           false,
					"updated_at_remote": row.UpdatedAtRemote,
					"forum_user_id":     row.ForumUserID,
					"synced_at":         row.SyncedAt,
				}).Error; err != nil {
					log.Printf("[gitea] 更新仓库失败 %s: %v", gr.FullName, err)
					continue
				}
			}
			upserted++
		}
	}

	// 仅清理本次成功同步到的 owner 下、却未再出现的旧记录
	if len(syncedOwners) > 0 {
		var all []model.GiteaRepo
		if err := model.DB.Where("private = ?", false).Find(&all).Error; err == nil {
			for _, r := range all {
				if _, ok := syncedOwners[strings.ToLower(r.OwnerLogin)]; !ok {
					continue
				}
				if _, ok := seen[r.GiteaID]; !ok {
					_ = model.DB.Delete(&r).Error
				}
			}
		}
	}

	log.Printf("[gitea] 同步完成：upsert %d 个公开仓库", upserted)
	return upserted, nil
}

type giteaAPIRepo struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	FullName    string `json:"full_name"`
	Description string `json:"description"`
	HTMLURL     string `json:"html_url"`
	Private     bool   `json:"private"`
	UpdatedAt   string `json:"updated_at"`
	Owner       struct {
		Login string `json:"login"`
	} `json:"owner"`
}

func (g *GiteaService) fetchUserPublicRepos(baseURL, token, username string) ([]giteaAPIRepo, error) {
	var all []giteaAPIRepo
	page := 1
	for {
		u, err := url.Parse(strings.TrimRight(baseURL, "/") + "/api/v1/users/" + url.PathEscape(username) + "/repos")
		if err != nil {
			return nil, err
		}
		q := u.Query()
		q.Set("page", strconv.Itoa(page))
		q.Set("limit", "50")
		u.RawQuery = q.Encode()

		req, err := http.NewRequest(http.MethodGet, u.String(), nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "token "+token)
		req.Header.Set("Accept", "application/json")

		resp, err := g.client.Do(req)
		if err != nil {
			return nil, err
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
		_ = resp.Body.Close()

		if resp.StatusCode == http.StatusNotFound {
			return nil, fmt.Errorf("用户不存在")
		}
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("HTTP %d: %s", resp.StatusCode, truncStr(string(body), 200))
		}

		var pageRepos []giteaAPIRepo
		if err := json.Unmarshal(body, &pageRepos); err != nil {
			return nil, err
		}
		if len(pageRepos) == 0 {
			break
		}
		all = append(all, pageRepos...)
		if len(pageRepos) < 50 {
			break
		}
		page++
		if page > 20 {
			break
		}
	}
	return all, nil
}

func toGiteaRepoView(r model.GiteaRepo) GiteaRepoView {
	return GiteaRepoView{
		ID:              r.ID,
		GiteaID:         r.GiteaID,
		OwnerLogin:      r.OwnerLogin,
		Name:            r.Name,
		FullName:        r.FullName,
		Description:     r.Description,
		HTMLURL:         r.HTMLURL,
		UpdatedAtRemote: r.UpdatedAtRemote,
		ForumUserID:     r.ForumUserID,
		SyncedAt:        r.SyncedAt,
	}
}

func parseGiteaTime(raw string) *time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05Z",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, raw); err == nil {
			return &t
		}
	}
	return nil
}

func truncStr(s string, max int) string {
	if max <= 0 || len(s) <= max {
		return s
	}
	return s[:max]
}

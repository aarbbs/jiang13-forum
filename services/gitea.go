package services

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

	"git.iioio.com/freefire/jiang13-forum/models"
)

var (
	ErrGiteaNotConfigured = errors.New("Gitea 同步未配置或未启用")
	ErrGiteaSyncBusy      = errors.New("同步正在进行中，请稍后再试")
)

// GiteaOwnerView 仓库关联的论坛用户摘要（列表展示头像/徽标）
type GiteaOwnerView struct {
	ID       uint                  `json:"id"`
	Nickname string                `json:"nickname"`
	Avatar   string                `json:"avatar"`
	Role     models.Role            `json:"role"`
	Verified bool                  `json:"verified"`
	Exp      int                   `json:"exp"`
	Level    int                   `json:"level"`
	Badges   []models.UserBadgeView `json:"badges,omitempty"`
}

// GiteaRepoView 前台展示
type GiteaRepoView struct {
	ID              uint            `json:"id"`
	GiteaID         int64           `json:"gitea_id"`
	OwnerLogin      string          `json:"owner_login"`
	Name            string          `json:"name"`
	FullName        string          `json:"full_name"`
	Description     string          `json:"description"`
	HTMLURL         string          `json:"html_url"`
	Language        string          `json:"language"`
	StarsCount      int             `json:"stars_count"`
	ForksCount      int             `json:"forks_count"`
	UpdatedAtRemote *time.Time      `json:"updated_at_remote"`
	ForumUserID     *uint           `json:"forum_user_id,omitempty"`
	Owner           *GiteaOwnerView `json:"owner,omitempty"`
	SyncedAt        time.Time       `json:"synced_at"`
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

// ListPublic 列出已绑定论坛用户的公开仓库；q 模糊匹配仓库字段与论坛昵称/用户名
func (g *GiteaService) ListPublic(page, size int, q string) ([]GiteaRepoView, int64, error) {
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 30
	}
	if size > 100 {
		size = 100
	}
	// 打开列表时自愈：按 owner_login≈username 回填缺失的 forum_user_id
	BackfillForumUserIDs()

	q = strings.TrimSpace(q)
	db := models.DB.Model(&models.GiteaRepo{}).Where("private = ? AND forum_user_id IS NOT NULL AND forum_user_id > 0", false)
	if q != "" {
		like := "%" + escapeLikePattern(q) + "%"
		db = db.Where(
			`(full_name LIKE ? ESCAPE '\' OR description LIKE ? ESCAPE '\' OR owner_login LIKE ? ESCAPE '\'
			 OR forum_user_id IN (
				SELECT id FROM users WHERE nickname LIKE ? ESCAPE '\' OR username LIKE ? ESCAPE '\'
			 ))`,
			like, like, like, like, like,
		)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var rows []models.GiteaRepo
	err := db.Order("updated_at_remote desc, id desc").
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

// BackfillForumUserIDs 将缺失 forum_user_id 的公开仓按 owner_login（忽略大小写）匹配论坛 username
func BackfillForumUserIDs() int {
	var rows []models.GiteaRepo
	if err := models.DB.Where("private = ? AND (forum_user_id IS NULL OR forum_user_id = 0)", false).
		Find(&rows).Error; err != nil || len(rows) == 0 {
		return 0
	}
	var users []models.User
	if err := models.DB.Select("id", "username").Where("banned = ?", false).Find(&users).Error; err != nil || len(users) == 0 {
		return 0
	}
	byLogin := make(map[string]uint, len(users))
	for _, u := range users {
		key := strings.ToLower(strings.TrimSpace(u.Username))
		if key == "" {
			continue
		}
		byLogin[key] = u.ID
	}
	n := 0
	for i := range rows {
		key := strings.ToLower(strings.TrimSpace(rows[i].OwnerLogin))
		uid, ok := byLogin[key]
		if !ok || uid == 0 {
			continue
		}
		if err := models.DB.Model(&rows[i]).Update("forum_user_id", uid).Error; err != nil {
			log.Printf("[gitea] 回填 forum_user_id 失败 repo=%s: %v", rows[i].FullName, err)
			continue
		}
		n++
	}
	if n > 0 {
		log.Printf("[gitea] 回填 forum_user_id：%d 条", n)
	}
	return n
}

// AttachGiteaOwners 为列表项批量填充论坛用户摘要；丢弃无法解析到论坛用户的条目。
// 优先 forum_user_id；缺失时按 owner_login≈username 兜底，并回写 forum_user_id。
func AttachGiteaOwners(list []GiteaRepoView, badge *BadgeService) []GiteaRepoView {
	if len(list) == 0 {
		return list
	}

	idSet := make(map[uint]struct{})
	ids := make([]uint, 0, len(list))
	loginSet := make(map[string]struct{})
	logins := make([]string, 0, len(list))
	for _, item := range list {
		if item.ForumUserID != nil && *item.ForumUserID > 0 {
			id := *item.ForumUserID
			if _, ok := idSet[id]; !ok {
				idSet[id] = struct{}{}
				ids = append(ids, id)
			}
			continue
		}
		key := strings.ToLower(strings.TrimSpace(item.OwnerLogin))
		if key == "" {
			continue
		}
		if _, ok := loginSet[key]; ok {
			continue
		}
		loginSet[key] = struct{}{}
		logins = append(logins, key)
	}

	byID := make(map[uint]*models.User)
	byLogin := make(map[string]*models.User)
	ptrs := make([]*models.User, 0, len(ids)+len(logins))

	if len(ids) > 0 {
		var users []models.User
		if err := models.DB.Where("id IN ? AND banned = ?", ids, false).Find(&users).Error; err == nil {
			for i := range users {
				u := &users[i]
				byID[u.ID] = u
				ptrs = append(ptrs, u)
				key := strings.ToLower(strings.TrimSpace(u.Username))
				if key != "" {
					byLogin[key] = u
				}
			}
		}
	}
	if len(logins) > 0 {
		var users []models.User
		if err := models.DB.Where("banned = ? AND LOWER(username) IN ?", false, logins).Find(&users).Error; err == nil {
			for i := range users {
				u := &users[i]
				key := strings.ToLower(strings.TrimSpace(u.Username))
				if key == "" {
					continue
				}
				if _, exists := byLogin[key]; exists {
					continue
				}
				byLogin[key] = u
				byID[u.ID] = u
				ptrs = append(ptrs, u)
			}
		}
	}

	if len(ptrs) == 0 {
		return nil
	}
	// 去重 ptrs
	seenPtr := make(map[uint]struct{}, len(ptrs))
	uniq := make([]*models.User, 0, len(ptrs))
	for _, u := range ptrs {
		if u == nil || u.ID == 0 {
			continue
		}
		if _, ok := seenPtr[u.ID]; ok {
			continue
		}
		seenPtr[u.ID] = struct{}{}
		uniq = append(uniq, u)
	}
	if badge != nil {
		badge.AttachBadgeSummaries(uniq, 3)
	} else {
		for _, u := range uniq {
			u.Level = models.LevelFromExp(u.Exp)
		}
	}

	out := make([]GiteaRepoView, 0, len(list))
	for i := range list {
		item := list[i]
		var u *models.User
		if item.ForumUserID != nil && *item.ForumUserID > 0 {
			u = byID[*item.ForumUserID]
		}
		if u == nil {
			key := strings.ToLower(strings.TrimSpace(item.OwnerLogin))
			u = byLogin[key]
			if u != nil {
				uid := u.ID
				item.ForumUserID = &uid
				// 回写缺失关联，便于下次列表过滤命中
				_ = models.DB.Model(&models.GiteaRepo{}).Where("id = ?", item.ID).
					Update("forum_user_id", uid).Error
			}
		}
		if u == nil {
			continue
		}
		nick := strings.TrimSpace(u.Nickname)
		if nick == "" {
			nick = u.Username
		}
		item.Owner = &GiteaOwnerView{
			ID:       u.ID,
			Nickname: nick,
			Avatar:   u.Avatar,
			Role:     u.Role,
			Verified: u.Verified,
			Exp:      u.Exp,
			Level:    models.LevelFromExp(u.Exp),
			Badges:   u.Badges,
		}
		out = append(out, item)
	}
	return out
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

	// 同步前先回填历史缺失关联
	BackfillForumUserIDs()

	var users []models.User
	if err := models.DB.Where("banned = ?", false).Select("id", "username").Find(&users).Error; err != nil {
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
			row := models.GiteaRepo{
				GiteaID:         gr.ID,
				OwnerLogin:      owner,
				Name:            gr.Name,
				FullName:        gr.FullName,
				Description:     truncStr(gr.Description, 2048),
				HTMLURL:         gr.HTMLURL,
				Language:        truncStr(gr.Language, 64),
				StarsCount:      gr.StarsCount,
				ForksCount:      gr.ForksCount,
				Private:         false,
				UpdatedAtRemote: parseGiteaTime(gr.UpdatedAt),
				ForumUserID:     &uid,
				SyncedAt:        now,
			}
			var existing models.GiteaRepo
			err := models.DB.Where("gitea_id = ?", gr.ID).First(&existing).Error
			if err != nil {
				if err := models.DB.Create(&row).Error; err != nil {
					log.Printf("[gitea] 创建仓库失败 %s: %v", gr.FullName, err)
					continue
				}
			} else {
				row.ID = existing.ID
				if err := models.DB.Model(&existing).Updates(map[string]any{
					"owner_login":       row.OwnerLogin,
					"name":              row.Name,
					"full_name":         row.FullName,
					"description":       row.Description,
					"html_url":          row.HTMLURL,
					"language":          row.Language,
					"stars_count":       row.StarsCount,
					"forks_count":       row.ForksCount,
					"private":           false,
					"updated_at_remote": row.UpdatedAtRemote,
					"forum_user_id":     uid, // 写死 uint，避免 *uint 进 map 未落库
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
		var all []models.GiteaRepo
		if err := models.DB.Where("private = ?", false).Find(&all).Error; err == nil {
			for _, r := range all {
				if _, ok := syncedOwners[strings.ToLower(r.OwnerLogin)]; !ok {
					continue
				}
				if _, ok := seen[r.GiteaID]; !ok {
					_ = models.DB.Delete(&r).Error
				}
			}
		}
	}

	// 同步后再回填一次（覆盖 owner_login 大小写等边角）
	BackfillForumUserIDs()

	log.Printf("[gitea] 同步完成：upsert %d 个公开仓库", upserted)
	return upserted, nil
}

type giteaAPIRepo struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	FullName    string `json:"full_name"`
	Description string `json:"description"`
	HTMLURL     string `json:"html_url"`
	Language    string `json:"language"`
	StarsCount  int    `json:"stars_count"`
	ForksCount  int    `json:"forks_count"`
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

func toGiteaRepoView(r models.GiteaRepo) GiteaRepoView {
	return GiteaRepoView{
		ID:              r.ID,
		GiteaID:         r.GiteaID,
		OwnerLogin:      r.OwnerLogin,
		Name:            r.Name,
		FullName:        r.FullName,
		Description:     r.Description,
		HTMLURL:         r.HTMLURL,
		Language:        r.Language,
		StarsCount:      r.StarsCount,
		ForksCount:      r.ForksCount,
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

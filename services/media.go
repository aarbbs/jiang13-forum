package services

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"

	"git.iioio.com/freefire/jiang13-forum/config"
	"git.iioio.com/freefire/jiang13-forum/models"
)

// MediaItem 管理端媒体资源条目
type MediaItem struct {
	ID          uint      `json:"id"`
	Category    string    `json:"category"`
	Name        string    `json:"name"`
	URL         string    `json:"url"`
	Size        int64     `json:"size"`
	ModifiedAt  time.Time `json:"modified_at"`
	ContentType string    `json:"content_type"`
	StorageType string    `json:"storage_type,omitempty"`
}

// MediaListResult 媒体列表分页结果
type MediaListResult struct {
	Files          []MediaItem    `json:"files"`
	Total          int            `json:"total"`
	Page           int            `json:"page"`
	TotalPages     int            `json:"total_pages"`
	StorageType    string         `json:"storage_type"`
	CategoryCounts map[string]int `json:"category_counts"`
}

var mediaCategories = []string{
	UploadCategoryAvatars,
	UploadCategoryPosts,
	UploadCategorySite,
}

// ListMedia 从数据库索引列出媒体（上传/删除时维护；启动时会扫盘回填）
func (s *UploadStore) ListMedia(category, query string, page, size int) (*MediaListResult, error) {
	if s == nil {
		return nil, errors.New("上传存储未初始化")
	}
	if models.DB == nil {
		return nil, errors.New("数据库未初始化")
	}
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 24
	}
	if size > 100 {
		size = 100
	}
	category = strings.ToLower(strings.TrimSpace(category))
	if category == "" || category == "all" {
		category = "all"
	} else if !validMediaCategory(category) {
		return nil, errors.New("无效的分类")
	}
	query = strings.TrimSpace(query)

	// 索引为空时先同步一次，避免升级后首次打开空白
	var indexed int64
	_ = models.DB.Model(&models.Media{}).Count(&indexed).Error
	if indexed == 0 {
		_, _ = s.SyncMediaIndex()
	}

	counts := map[string]int{
		UploadCategoryAvatars: 0,
		UploadCategoryPosts:   0,
		UploadCategorySite:    0,
	}
	type catCount struct {
		Category string
		Cnt      int
	}
	var rows []catCount
	if err := models.DB.Model(&models.Media{}).
		Select("category, count(*) as cnt").
		Group("category").
		Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, r := range rows {
		counts[r.Category] = r.Cnt
	}

	dbq := models.DB.Model(&models.Media{})
	if category != "all" {
		dbq = dbq.Where("category = ?", category)
	}
	if query != "" {
		like := "%" + query + "%"
		dbq = dbq.Where("name LIKE ? OR url LIKE ?", like, like)
	}

	var total int64
	if err := dbq.Count(&total).Error; err != nil {
		return nil, err
	}
	totalPages := 1
	if total > 0 {
		totalPages = int((total + int64(size) - 1) / int64(size))
	}
	if page > totalPages {
		page = totalPages
	}

	var records []models.Media
	offset := (page - 1) * size
	if err := dbq.Order("created_at desc, id desc").Offset(offset).Limit(size).Find(&records).Error; err != nil {
		return nil, err
	}

	files := make([]MediaItem, 0, len(records))
	for _, r := range records {
		mod := r.UpdatedAt
		if mod.IsZero() {
			mod = r.CreatedAt
		}
		files = append(files, MediaItem{
			ID:          r.ID,
			Category:    r.Category,
			Name:        r.Name,
			URL:         r.URL,
			Size:        r.Size,
			ModifiedAt:  mod.UTC(),
			ContentType: r.ContentType,
			StorageType: r.StorageType,
		})
	}

	mode, _, _, _ := s.snapshot()
	storageType := config.StorageTypeLocal
	if mode == config.StorageTypeS3 {
		storageType = config.StorageTypeS3
	}

	return &MediaListResult{
		Files:          files,
		Total:          int(total),
		Page:           page,
		TotalPages:     totalPages,
		StorageType:    storageType,
		CategoryCounts: counts,
	}, nil
}

// DeleteMedia 按 URL 批量删除媒体（含伴生扩展名与数据库索引）
func (s *UploadStore) DeleteMedia(urls []string) (int, error) {
	if s == nil {
		return 0, errors.New("上传存储未初始化")
	}
	n := 0
	seen := map[string]bool{}
	for _, u := range urls {
		u = strings.TrimSpace(u)
		if u == "" || seen[u] {
			continue
		}
		seen[u] = true
		if !s.isManagedMediaURL(u) {
			continue
		}
		s.DeleteByURL(u)
		n++
	}
	return n, nil
}

// DeleteMediaByIDs 按索引 ID 删除媒体
func (s *UploadStore) DeleteMediaByIDs(ids []uint) (int, error) {
	if s == nil {
		return 0, errors.New("上传存储未初始化")
	}
	if models.DB == nil || len(ids) == 0 {
		return 0, nil
	}
	clean := make([]uint, 0, len(ids))
	seen := map[uint]bool{}
	for _, id := range ids {
		if id == 0 || seen[id] {
			continue
		}
		seen[id] = true
		clean = append(clean, id)
	}
	if len(clean) == 0 {
		return 0, nil
	}
	var rows []models.Media
	if err := models.DB.Where("id IN ?", clean).Find(&rows).Error; err != nil {
		return 0, err
	}
	urls := make([]string, 0, len(rows))
	for _, r := range rows {
		urls = append(urls, r.URL)
	}
	return s.DeleteMedia(urls)
}

// SyncMediaIndex 扫描当前存储后端，回填/校正媒体索引；返回写入或更新条数
func (s *UploadStore) SyncMediaIndex() (int, error) {
	if s == nil || models.DB == nil {
		return 0, errors.New("存储或数据库未初始化")
	}
	mode, _, _, _ := s.snapshot()
	storageType := config.StorageTypeLocal
	var items []MediaItem
	var err error
	if mode == config.StorageTypeS3 {
		storageType = config.StorageTypeS3
		items, err = s.listMediaS3("all")
	} else {
		items, err = s.listMediaLocal("all")
	}
	if err != nil {
		return 0, err
	}

	seen := make(map[string]struct{}, len(items))
	n := 0
	for _, it := range items {
		seen[it.URL] = struct{}{}
		if err := s.upsertMediaRecord(it.Category, it.Name, it.URL, it.Size, it.ContentType, storageType, nil); err != nil {
			continue
		}
		n++
	}

	// 清理当前后端下已不存在的索引（其它后端记录保留）
	var stale []models.Media
	_ = models.DB.Where("storage_type = ?", storageType).Find(&stale).Error
	for _, row := range stale {
		if _, ok := seen[row.URL]; ok {
			continue
		}
		_ = models.DB.Delete(&models.Media{}, row.ID).Error
	}
	return n, nil
}

func (s *UploadStore) upsertMediaRecord(category, name, url string, size int64, contentType, storageType string, userID *uint) error {
	if models.DB == nil || strings.TrimSpace(url) == "" {
		return nil
	}
	category = strings.TrimSpace(category)
	name = strings.TrimSpace(name)
	url = strings.TrimSpace(url)
	if storageType == "" {
		storageType = config.StorageTypeLocal
	}
	if contentType == "" {
		contentType = imageContentType(strings.ToLower(filepath.Ext(name)))
	}

	var existing models.Media
	err := models.DB.Where("url = ?", url).First(&existing).Error
	if err == nil {
		updates := map[string]interface{}{
			"category":     category,
			"name":         name,
			"size":         size,
			"content_type": contentType,
			"storage_type": storageType,
		}
		if userID != nil {
			updates["user_id"] = *userID
		}
		return models.DB.Model(&existing).Updates(updates).Error
	}

	rec := models.Media{
		Category:    category,
		Name:        name,
		URL:         url,
		Size:        size,
		ContentType: contentType,
		StorageType: storageType,
		UserID:      userID,
	}
	return models.DB.Create(&rec).Error
}

func (s *UploadStore) deleteMediaRecords(urls []string) {
	if models.DB == nil || len(urls) == 0 {
		return
	}
	clean := make([]string, 0, len(urls))
	seen := map[string]bool{}
	for _, u := range urls {
		u = strings.TrimSpace(u)
		if u == "" || seen[u] {
			continue
		}
		seen[u] = true
		clean = append(clean, u)
	}
	if len(clean) == 0 {
		return
	}
	_ = models.DB.Where("url IN ?", clean).Delete(&models.Media{}).Error
}

func (s *UploadStore) resolveSiblingPublicURLs(rawURL string) []string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return nil
	}
	var rel string
	var basePrefix string // 拼回公开 URL 的前缀（含 category 前的部分）

	if strings.HasPrefix(rawURL, "/uploads/") {
		path := rawURL
		if i := strings.Index(path, "?"); i >= 0 {
			path = path[:i]
		}
		rel = strings.TrimPrefix(path, "/uploads/")
		basePrefix = "/uploads/"
	} else {
		_, publicBase, _, _ := s.snapshot()
		r, ok := relativeUnderPublicBase(rawURL, publicBase)
		if !ok {
			return []string{rawURL}
		}
		rel = r
		basePrefix = strings.TrimRight(publicBase, "/") + "/"
	}

	siblings := uploadSiblingRels(rel)
	if len(siblings) == 0 {
		return []string{rawURL}
	}
	out := make([]string, 0, len(siblings))
	for _, sib := range siblings {
		out = append(out, basePrefix+sib)
	}
	return out
}

func parseUploaderID(category, namePrefix string) *uint {
	if category != UploadCategoryAvatars && category != UploadCategoryPosts {
		return nil
	}
	id, err := strconv.ParseUint(strings.TrimSpace(namePrefix), 10, 64)
	if err != nil || id == 0 {
		return nil
	}
	u := uint(id)
	return &u
}

func (s *UploadStore) isManagedMediaURL(rawURL string) bool {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return false
	}
	if strings.HasPrefix(rawURL, "/uploads/") {
		rel := strings.TrimPrefix(rawURL, "/uploads/")
		cat, _, ok := splitCategoryName(rel)
		return ok && validMediaCategory(cat)
	}
	_, publicBase, _, backend := s.snapshot()
	if backend == nil || publicBase == "" {
		return false
	}
	rel, ok := relativeUnderPublicBase(rawURL, publicBase)
	if !ok {
		return false
	}
	cat, _, ok := splitCategoryName(rel)
	return ok && validMediaCategory(cat)
}

func (s *UploadStore) listMediaLocal(category string) ([]MediaItem, error) {
	cats := mediaCategories
	if category != "all" {
		cats = []string{category}
	}
	var out []MediaItem
	root := s.UploadsRoot()
	for _, cat := range cats {
		dir := filepath.Join(root, cat)
		entries, err := os.ReadDir(dir)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, err
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			name := e.Name()
			if strings.HasPrefix(name, ".") {
				continue
			}
			ext := strings.ToLower(filepath.Ext(name))
			if !allowedImageExt[ext] {
				continue
			}
			info, err := e.Info()
			if err != nil {
				continue
			}
			out = append(out, MediaItem{
				Category:    cat,
				Name:        name,
				URL:         "/uploads/" + cat + "/" + name,
				Size:        info.Size(),
				ModifiedAt:  info.ModTime().UTC(),
				ContentType: imageContentType(ext),
				StorageType: config.StorageTypeLocal,
			})
		}
	}
	return out, nil
}

func (s *UploadStore) listMediaS3(category string) ([]MediaItem, error) {
	_, publicBase, keyPrefix, backend := s.snapshot()
	if backend == nil {
		return nil, errors.New("对象存储未就绪")
	}
	cats := mediaCategories
	if category != "all" {
		cats = []string{category}
	}
	var out []MediaItem
	ctx := context.Background()
	for _, cat := range cats {
		prefix := keyPrefix + cat + "/"
		for obj := range backend.client.ListObjects(ctx, backend.bucket, minio.ListObjectsOptions{
			Prefix:    prefix,
			Recursive: true,
		}) {
			if obj.Err != nil {
				return nil, obj.Err
			}
			if strings.HasSuffix(obj.Key, "/") {
				continue
			}
			name := strings.TrimPrefix(obj.Key, prefix)
			if name == "" || strings.Contains(name, "/") {
				continue
			}
			if strings.HasPrefix(name, ".") {
				continue
			}
			ext := strings.ToLower(filepath.Ext(name))
			if !allowedImageExt[ext] {
				continue
			}
			out = append(out, MediaItem{
				Category:    cat,
				Name:        name,
				URL:         publicBase + "/" + cat + "/" + name,
				Size:        obj.Size,
				ModifiedAt:  obj.LastModified.UTC(),
				ContentType: imageContentType(ext),
				StorageType: config.StorageTypeS3,
			})
		}
	}
	return out, nil
}

func validMediaCategory(cat string) bool {
	switch cat {
	case UploadCategoryAvatars, UploadCategoryPosts, UploadCategorySite:
		return true
	default:
		return false
	}
}

func splitCategoryName(rel string) (category, name string, ok bool) {
	rel = strings.TrimSpace(strings.ReplaceAll(rel, "\\", "/"))
	rel = strings.TrimPrefix(rel, "/")
	parts := strings.SplitN(rel, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	if strings.Contains(parts[1], "/") {
		return "", "", false
	}
	return parts[0], parts[1], true
}
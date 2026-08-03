package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"mime/multipart"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"git.iioio.com/freefire/jiang13-forum/config"
)

// UploadCategory 上传分类目录名
const (
	UploadCategoryAvatars = "avatars"
	UploadCategoryPosts   = "posts"
	UploadCategorySite    = "site"
)

// StorageConfig 上传存储配置（管理后台 / 内部使用）
type StorageConfig struct {
	Type           string `json:"type"` // local | s3
	Endpoint       string `json:"endpoint"`
	Region         string `json:"region"`
	Bucket         string `json:"bucket"`
	AccessKey      string `json:"access_key"`
	SecretKey      string `json:"secret_key,omitempty"` // 更新时传入；回显时为空
	PublicBaseURL  string `json:"public_base_url"`
	Prefix         string `json:"prefix"`
	ForcePathStyle bool   `json:"force_path_style"`
	HasSecretKey   bool   `json:"has_secret_key"`
	Ready          bool   `json:"ready"`
	// ImageDelivery 展示方案：webp（默认）| original；上传始终保留原图
	ImageDelivery string `json:"image_delivery"`
}

// UploadStore 统一上传存储（本地或 S3 兼容），支持运行时热切换
type UploadStore struct {
	mu         sync.RWMutex
	dataDir    string
	settings   *ForumSettingsService
	mode       string
	s3         *s3Backend
	publicBase string
	keyPrefix  string
}

type s3Backend struct {
	client *minio.Client
	bucket string
}

// NewUploadStore 创建本地默认存储；调用 Apply / ReloadFromSettings 切换后端
func NewUploadStore(dataDir string, settings *ForumSettingsService) *UploadStore {
	return &UploadStore{
		dataDir:  dataDir,
		settings: settings,
		mode:     config.StorageTypeLocal,
	}
}

// ReloadFromSettings 按数据库配置重建存储客户端
func (s *UploadStore) ReloadFromSettings(settings *ForumSettingsService) error {
	if settings == nil {
		return errors.New("设置服务未初始化")
	}
	return s.Apply(settings.StorageConfig())
}

// Apply 应用存储配置（失败时保持原配置不变）
func (s *UploadStore) Apply(cfg StorageConfig) error {
	if s == nil {
		return errors.New("上传存储未初始化")
	}
	typ := normalizeStorageType(cfg.Type)
	if typ == config.StorageTypeLocal {
		s.mu.Lock()
		s.mode = config.StorageTypeLocal
		s.s3 = nil
		s.publicBase = ""
		s.keyPrefix = ""
		s.mu.Unlock()
		return nil
	}

	if err := validateStorageConfigForApply(cfg); err != nil {
		return err
	}

	endpoint, secure, err := parseS3Endpoint(cfg.Endpoint)
	if err != nil {
		return err
	}
	region := strings.TrimSpace(cfg.Region)
	if region == "" {
		region = "us-east-1"
	}
	lookup := minio.BucketLookupDNS
	if cfg.ForcePathStyle {
		lookup = minio.BucketLookupPath
	}
	client, err := minio.New(endpoint, &minio.Options{
		Creds:        credentials.NewStaticV4(strings.TrimSpace(cfg.AccessKey), cfg.SecretKey, ""),
		Secure:       secure,
		Region:       region,
		BucketLookup: lookup,
	})
	if err != nil {
		return fmt.Errorf("初始化 S3 客户端失败: %w", err)
	}

	s.mu.Lock()
	s.mode = config.StorageTypeS3
	s.s3 = &s3Backend{client: client, bucket: strings.TrimSpace(cfg.Bucket)}
	s.publicBase = normalizeRootURL(cfg.PublicBaseURL)
	s.keyPrefix = normalizeObjectPrefix(cfg.Prefix)
	s.mu.Unlock()
	return nil
}

func validateStorageConfigForApply(cfg StorageConfig) error {
	if strings.TrimSpace(cfg.Endpoint) == "" {
		return errors.New("S3 Endpoint 不能为空")
	}
	if strings.TrimSpace(cfg.Bucket) == "" {
		return errors.New("S3 Bucket 不能为空")
	}
	if strings.TrimSpace(cfg.AccessKey) == "" {
		return errors.New("S3 Access Key 不能为空")
	}
	if strings.TrimSpace(cfg.SecretKey) == "" {
		return errors.New("S3 Secret Key 不能为空")
	}
	if normalizeRootURL(cfg.PublicBaseURL) == "" {
		return errors.New("公开访问地址 PUBLIC_BASE_URL 不能为空")
	}
	return nil
}

func normalizeStorageType(raw string) string {
	t := strings.ToLower(strings.TrimSpace(raw))
	if t == config.StorageTypeS3 {
		return config.StorageTypeS3
	}
	return config.StorageTypeLocal
}

func normalizeObjectPrefix(raw string) string {
	p := strings.TrimSpace(raw)
	p = strings.TrimPrefix(p, "/")
	if p == "" {
		return ""
	}
	return strings.TrimSuffix(p, "/") + "/"
}

// snapshot 读取当前后端快照（调用方勿修改返回指针）
func (s *UploadStore) snapshot() (mode, publicBase, keyPrefix string, s3 *s3Backend) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.mode, s.publicBase, s.keyPrefix, s.s3
}

// IsLocal 是否本地磁盘存储
func (s *UploadStore) IsLocal() bool {
	if s == nil {
		return true
	}
	mode, _, _, backend := s.snapshot()
	return mode != config.StorageTypeS3 || backend == nil
}

// UploadsRoot 本地 uploads 根目录
func (s *UploadStore) UploadsRoot() string {
	if s == nil {
		return ""
	}
	return filepath.Join(s.dataDir, "uploads")
}

// SaveImage 保存图片：始终保留原图；静态图额外写 WebP 衍生，按展示方案返回 URL
func (s *UploadStore) SaveImage(file *multipart.FileHeader, category, namePrefix string) (string, error) {
	if s == nil {
		return "", errors.New("上传存储未初始化")
	}
	category = strings.Trim(category, "/")
	if category == "" {
		return "", errors.New("无效的上传分类")
	}

	prepared, err := prepareUploadImage(file)
	if err != nil {
		return "", err
	}
	base := fmt.Sprintf("%s_%d", namePrefix, time.Now().UnixNano())
	origName := base + prepared.OrigExt
	webpName := base + ".webp"

	delivery := ImageDeliveryWebP
	if s.settings != nil {
		delivery = s.settings.ImageDelivery()
	}

	mode, publicBase, keyPrefix, backend := s.snapshot()
	useS3 := mode == config.StorageTypeS3
	if useS3 && backend == nil {
		return "", errors.New("对象存储未就绪，请检查管理后台「对象存储」配置")
	}

	// 1) 写原图
	if useS3 {
		if err := s.putBytesS3(backend, keyPrefix, category, origName, prepared.OrigContentType, prepared.OrigData); err != nil {
			return "", err
		}
	} else {
		if err := s.putBytesLocal(category, origName, prepared.OrigData); err != nil {
			return "", err
		}
	}

	// 2) 写 WebP 衍生（若有）
	hasWebP := len(prepared.WebPData) > 0
	if hasWebP {
		if useS3 {
			if err := s.putBytesS3(backend, keyPrefix, category, webpName, "image/webp", prepared.WebPData); err != nil {
				return "", err
			}
		} else {
			if err := s.putBytesLocal(category, webpName, prepared.WebPData); err != nil {
				return "", err
			}
		}
	}

	// 3) 按展示方案选择返回 URL
	returnName := origName
	if delivery == ImageDeliveryWebP && (hasWebP || prepared.OrigExt == ".webp") {
		if hasWebP {
			returnName = webpName
		} else {
			returnName = origName // 原图已是 webp
		}
	}

	publicURL := s.publicURL(useS3, publicBase, category, returnName)

	// 写入媒体索引（原图 + WebP 衍生均登记）
	storageType := config.StorageTypeLocal
	if useS3 {
		storageType = config.StorageTypeS3
	}
	uploader := parseUploaderID(category, namePrefix)
	origURL := s.publicURL(useS3, publicBase, category, origName)
	_ = s.upsertMediaRecord(category, origName, origURL, int64(len(prepared.OrigData)), prepared.OrigContentType, storageType, uploader)
	if hasWebP {
		webpURL := s.publicURL(useS3, publicBase, category, webpName)
		_ = s.upsertMediaRecord(category, webpName, webpURL, int64(len(prepared.WebPData)), "image/webp", storageType, uploader)
	}

	// 缩略图优先用 WebP 衍生（更小）；否则用返回文件
	if category == UploadCategoryPosts && !useS3 {
		thumbFile := returnName
		if hasWebP {
			thumbFile = webpName
		}
		rel := filepath.ToSlash(filepath.Join(category, thumbFile))
		go WarmPostImageThumb(s.UploadsRoot(), rel)
	}
	return publicURL, nil
}

func (s *UploadStore) publicURL(useS3 bool, publicBase, category, filename string) string {
	if useS3 {
		return publicBase + "/" + category + "/" + filename
	}
	return "/uploads/" + category + "/" + filename
}

func (s *UploadStore) putBytesLocal(category, filename string, data []byte) error {
	dir := filepath.Join(s.UploadsRoot(), category)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, filename), data, 0644)
}

func (s *UploadStore) putBytesS3(backend *s3Backend, keyPrefix, category, filename, contentType string, data []byte) error {
	key := keyPrefix + category + "/" + filename
	opts := minio.PutObjectOptions{ContentType: contentType}
	_, err := backend.client.PutObject(
		context.Background(),
		backend.bucket,
		key,
		bytes.NewReader(data),
		int64(len(data)),
		opts,
	)
	if err != nil {
		return fmt.Errorf("上传到对象存储失败: %w", err)
	}
	return nil
}

// DeleteByURL 删除本站管理的上传文件（非本站 URL 则忽略）
func (s *UploadStore) DeleteByURL(rawURL string) {
	if s == nil {
		return
	}
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return
	}

	siblingURLs := s.resolveSiblingPublicURLs(rawURL)

	// 始终尝试清理本地 /uploads/…（兼容切换到 S3 前的旧文件）
	s.deleteLocalByURL(rawURL)

	_, publicBase, keyPrefix, backend := s.snapshot()
	if backend != nil {
		s.deleteS3ByURL(backend, publicBase, keyPrefix, rawURL)
	}

	s.deleteMediaRecords(siblingURLs)
}

func (s *UploadStore) deleteLocalByURL(rawURL string) {
	path := rawURL
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return
	}
	if i := strings.Index(path, "?"); i >= 0 {
		path = path[:i]
	}
	const prefix = "/uploads/"
	if !strings.HasPrefix(path, prefix) {
		return
	}
	rel := strings.TrimPrefix(path, prefix)
	rel = filepath.Clean(filepath.FromSlash(rel))
	if rel == "." || strings.HasPrefix(rel, "..") {
		return
	}
	relSlash := filepath.ToSlash(rel)
	for _, candidate := range uploadSiblingRels(relSlash) {
		full := filepath.Join(s.UploadsRoot(), filepath.FromSlash(candidate))
		_ = os.Remove(full)
		if strings.HasPrefix(candidate, UploadCategoryPosts+"/") {
			thumbDir := filepath.Join(s.UploadsRoot(), ".thumbs")
			_ = os.Remove(filepath.Join(thumbDir, filepath.FromSlash(candidate)+".webp"))
			_ = os.Remove(filepath.Join(thumbDir, filepath.FromSlash(candidate)+".jpg"))
		}
	}
}

func (s *UploadStore) deleteS3ByURL(backend *s3Backend, publicBase, keyPrefix, rawURL string) {
	if backend == nil || publicBase == "" {
		return
	}
	rel, ok := relativeUnderPublicBase(rawURL, publicBase)
	if !ok {
		return
	}
	parts := strings.SplitN(rel, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return
	}
	for _, candidate := range uploadSiblingRels(parts[0] + "/" + parts[1]) {
		key := keyPrefix + candidate
		_ = backend.client.RemoveObject(context.Background(), backend.bucket, key, minio.RemoveObjectOptions{})
	}
}

// uploadSiblingRels 返回同一主文件名下的自身与伴生扩展名路径（rel 使用 /）
func uploadSiblingRels(rel string) []string {
	rel = strings.TrimSpace(strings.ReplaceAll(rel, "\\", "/"))
	ext := ""
	if i := strings.LastIndex(rel, "."); i >= 0 && i > strings.LastIndex(rel, "/") {
		ext = strings.ToLower(rel[i:])
	}
	stem := rel
	if ext != "" {
		stem = rel[:len(rel)-len(ext)]
	}
	if stem == "" {
		return nil
	}
	seen := map[string]bool{}
	out := make([]string, 0, 6)
	add := func(e string) {
		p := stem + e
		if seen[p] {
			return
		}
		seen[p] = true
		out = append(out, p)
	}
	if ext != "" {
		add(ext)
	}
	for _, e := range siblingUploadExts(ext) {
		add(e)
	}
	return out
}

func parseS3Endpoint(raw string) (host string, secure bool, err error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", false, errors.New("S3 ENDPOINT 不能为空")
	}
	secure = true
	if strings.Contains(raw, "://") {
		u, err := url.Parse(raw)
		if err != nil {
			return "", false, fmt.Errorf("S3 ENDPOINT 无效: %w", err)
		}
		if u.Host == "" {
			return "", false, errors.New("S3 ENDPOINT 无效")
		}
		switch strings.ToLower(u.Scheme) {
		case "http":
			secure = false
		case "https":
			secure = true
		default:
			return "", false, fmt.Errorf("S3 ENDPOINT 不支持协议 %q", u.Scheme)
		}
		return u.Host, secure, nil
	}
	host = raw
	if strings.HasPrefix(host, "localhost") || strings.HasPrefix(host, "127.0.0.1") {
		secure = false
	}
	return host, secure, nil
}

func relativeUnderPublicBase(rawURL, publicBase string) (string, bool) {
	publicBase = strings.TrimRight(strings.TrimSpace(publicBase), "/")
	rawURL = strings.TrimSpace(rawURL)
	if publicBase == "" || rawURL == "" {
		return "", false
	}
	if strings.HasPrefix(rawURL, publicBase+"/") {
		rel := strings.TrimPrefix(rawURL, publicBase+"/")
		if i := strings.Index(rel, "?"); i >= 0 {
			rel = rel[:i]
		}
		rel = strings.TrimPrefix(rel, "/")
		if rel == "" || strings.Contains(rel, "..") {
			return "", false
		}
		return rel, true
	}
	return "", false
}


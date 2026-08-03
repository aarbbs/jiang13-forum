package service

import (
	"errors"
	"sort"
	"strings"
	"time"

	"git.iioio.com/freefire/jiang13-forum/model"
	"gorm.io/gorm"
)

type PostService struct {
	filter   *SensitiveFilter
	settings *ForumSettingsService
}

func NewPostService(filter *SensitiveFilter, settings *ForumSettingsService) *PostService {
	return &PostService{filter: filter, settings: settings}
}

func normalizePostType(raw string) string {
	switch strings.TrimSpace(raw) {
	case model.PostTypeQuestion:
		return model.PostTypeQuestion
	default:
		return model.PostTypeNormal
	}
}

type PostListQuery struct {
	BoardID       uint
	UserID        uint // >0 时仅返回该用户的帖子
	Page          int
	Size          int
	Keyword       string
	Sort          string // latest | reply | hot
	ViewerID      uint   // 当前查看者（用于 pending 仅作者可见）
	ViewerIsAdmin bool
	Status        string // 管理端筛选：pending|published|rejected|all；空则按可见性规则
}

// PostListItem 帖子列表项（含评论数等扩展字段）
type PostListItem struct {
	model.Post
	CommentCount int        `json:"comment_count"`
	LastReplyAt  *time.Time `json:"last_reply_at,omitempty"`
}

func (s *PostService) ListItems(q PostListQuery) ([]PostListItem, int64, error) {
	posts, total, err := s.List(q)
	if err != nil {
		return nil, 0, err
	}
	if len(posts) == 0 {
		return []PostListItem{}, total, nil
	}
	ids := make([]uint, len(posts))
	for i, p := range posts {
		ids[i] = p.ID
	}
	countMap := s.commentCountMap(ids)
	replyMap := s.lastReplyMap(ids)
	items := make([]PostListItem, len(posts))
	for i, p := range posts {
		items[i] = PostListItem{
			Post:         p,
			CommentCount: countMap[p.ID],
			LastReplyAt:  replyMap[p.ID],
		}
	}
	return items, total, nil
}

func (s *PostService) commentCountMap(postIDs []uint) map[uint]int {
	type row struct {
		PostID uint
		Count  int
	}
	var rows []row
	model.DB.Model(&model.Comment{}).Select("post_id, count(*) as count").
		Where("post_id IN ? AND status = ?", postIDs, model.ContentStatusPublished).
		Group("post_id").Scan(&rows)
	m := make(map[uint]int)
	for _, r := range rows {
		m[r.PostID] = r.Count
	}
	return m
}

func (s *PostService) lastReplyMap(postIDs []uint) map[uint]*time.Time {
	type row struct {
		PostID    uint
		LastReply string
	}
	var rows []row
	model.DB.Model(&model.Comment{}).
		Select("post_id, MAX(created_at) as last_reply").
		Where("post_id IN ? AND status = ?", postIDs, model.ContentStatusPublished).
		Group("post_id").
		Scan(&rows)
	m := make(map[uint]*time.Time, len(rows))
	for _, r := range rows {
		if t, ok := parseSQLiteTime(r.LastReply); ok {
			m[r.PostID] = &t
		}
	}
	return m
}

// parseSQLiteTime 解析 SQLite 聚合查询返回的时间字符串
func parseSQLiteTime(s string) (time.Time, bool) {
	if s == "" {
		return time.Time{}, false
	}
	for _, layout := range []string{
		"2006-01-02 15:04:05.999999999-07:00",
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05",
	} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func (s *PostService) HotPosts(limit int) ([]PostListItem, error) {
	if limit <= 0 {
		limit = 10
	}
	var posts []model.Post
	err := model.DB.Preload("User").Preload("Board").
		Where("status = ?", model.ContentStatusPublished).
		Order("like_count desc, view_count desc").Limit(limit).Find(&posts).Error
	if err != nil {
		return nil, err
	}
	ids := make([]uint, len(posts))
	for i, p := range posts {
		ids[i] = p.ID
	}
	countMap := s.commentCountMap(ids)
	items := make([]PostListItem, len(posts))
	for i, p := range posts {
		items[i] = PostListItem{Post: p, CommentCount: countMap[p.ID]}
	}
	return items, nil
}

// TagCount 标签及其出现次数
type TagCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// PopularTags 聚合帖子标签，按热度降序返回
func (s *PostService) PopularTags(limit int) ([]TagCount, error) {
	if limit <= 0 {
		limit = 40
	}
	var rows []struct{ Tags string }
	if err := model.DB.Model(&model.Post{}).
		Select("tags").
		Where("status = ? AND tags <> '' AND tags IS NOT NULL", model.ContentStatusPublished).
		Find(&rows).Error; err != nil {
		return nil, err
	}

	counts := make(map[string]int)
	// 保留首次出现的原始大小写作为展示名
	display := make(map[string]string)
	for _, row := range rows {
		for _, part := range strings.FieldsFunc(row.Tags, func(r rune) bool {
			return r == ',' || r == '，'
		}) {
			name := strings.TrimSpace(part)
			if name == "" {
				continue
			}
			key := strings.ToLower(name)
			counts[key]++
			if _, ok := display[key]; !ok {
				display[key] = name
			}
		}
	}

	list := make([]TagCount, 0, len(counts))
	for key, n := range counts {
		list = append(list, TagCount{Name: display[key], Count: n})
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].Count != list[j].Count {
			return list[i].Count > list[j].Count
		}
		return strings.ToLower(list[i].Name) < strings.ToLower(list[j].Name)
	})
	if len(list) > limit {
		list = list[:limit]
	}
	return list, nil
}

func (s *PostService) CommentCount(postID uint) int {
	var count int64
	model.DB.Model(&model.Comment{}).
		Where("post_id = ? AND status = ?", postID, model.ContentStatusPublished).
		Count(&count)
	return int(count)
}

// CanViewPost 是否可查看该帖（pending/rejected 仅作者与管理员）
func CanViewPost(post *model.Post, viewerID uint, isAdmin bool) bool {
	if post == nil {
		return false
	}
	if isAdmin || post.Status == model.ContentStatusPublished || post.Status == "" {
		return true
	}
	if post.Status == model.ContentStatusPending || post.Status == model.ContentStatusRejected {
		return viewerID > 0 && post.UserID == viewerID
	}
	return false
}

func applyPostVisibility(db *gorm.DB, q PostListQuery) *gorm.DB {
	if q.ViewerIsAdmin {
		switch q.Status {
		case model.ContentStatusPending, model.ContentStatusPublished, model.ContentStatusRejected:
			return db.Where("status = ?", q.Status)
		case "all", "":
			return db
		default:
			return db
		}
	}
	if q.ViewerID > 0 {
		return db.Where(
			"status = ? OR (status IN ? AND user_id = ?)",
			model.ContentStatusPublished,
			[]string{model.ContentStatusPending, model.ContentStatusRejected},
			q.ViewerID,
		)
	}
	return db.Where("status = ?", model.ContentStatusPublished)
}

func (s *PostService) List(q PostListQuery) ([]model.Post, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	q.Size = s.settings.NormalizePageSize(q.Size)
	if q.Keyword != "" {
		kw, err := s.settings.NormalizeSearchKeyword(q.Keyword)
		if err != nil {
			return nil, 0, err
		}
		q.Keyword = kw
	}
	db := model.DB.Model(&model.Post{}).Preload("User").Preload("Board")
	db = applyPostVisibility(db, q)
	if q.BoardID > 0 {
		db = db.Where("board_id = ?", q.BoardID)
	}
	if q.UserID > 0 {
		db = db.Where("user_id = ?", q.UserID)
	}
	if q.Keyword != "" {
		kw := "%" + q.Keyword + "%"
		db = db.Where("title LIKE ? OR content_plain LIKE ? OR tags LIKE ?", kw, kw, kw)
	}
	var total int64
	db.Count(&total)
	var posts []model.Post
	db = db.Order("pinned desc")
	switch normalizePostSort(q.Sort) {
	case "reply":
		// 有回复的帖子优先，按最后回复时间倒序；无回复的帖子沉底（仅计已公开评论）
		db = db.Order(`(
			SELECT COUNT(*) FROM comments
			WHERE comments.post_id = posts.id AND comments.deleted_at IS NULL
			AND comments.status = 'published'
		) > 0 DESC`)
		db = db.Order(`(
			SELECT MAX(created_at) FROM comments
			WHERE comments.post_id = posts.id AND comments.deleted_at IS NULL
			AND comments.status = 'published'
		) DESC`)
		db = db.Order("posts.created_at DESC")
	case "hot":
		db = db.Order("like_count desc, view_count desc")
	default:
		db = db.Order("id desc")
	}
	err := db.Order("id desc").Offset((q.Page - 1) * q.Size).Limit(q.Size).Find(&posts).Error
	return posts, total, err
}

func normalizePostSort(sort string) string {
	switch sort {
	case "reply", "hot":
		return sort
	default:
		return "latest"
	}
}

func (s *PostService) FindByID(id uint) (*model.Post, error) {
	var post model.Post
	err := model.DB.Preload("User").Preload("Board").First(&post, id).Error
	if err != nil {
		return nil, ErrPostNotFound
	}
	return &post, nil
}

func (s *PostService) RecordView(id uint) {
	model.DB.Model(&model.Post{}).Where("id = ?", id).
		UpdateColumn("view_count", gorm.Expr("view_count + 1"))
}

func (s *PostService) GetByID(id uint) (*model.Post, error) {
	post, err := s.FindByID(id)
	if err != nil {
		return nil, err
	}
	s.RecordView(id)
	return post, nil
}

func (s *PostService) Create(userID, boardID uint, title, content, tags, postType string, isAdmin bool) (*model.Post, error) {
	title = s.filter.Filter(strings.TrimSpace(title))
	content = s.filter.Filter(content)
	tags = s.filter.Filter(strings.TrimSpace(tags))
	postType = normalizePostType(postType)
	if title == "" || content == "" {
		return nil, errors.New("标题和内容不能为空")
	}
	if err := s.settings.ValidateTextLength(title, s.settings.PostTitleMax(), ErrPostTitleTooLong); err != nil {
		return nil, err
	}
	if err := s.settings.ValidateTextLength(tags, s.settings.PostTagsMax(), ErrPostTagsTooLong); err != nil {
		return nil, err
	}
	if err := s.settings.ValidateTextLength(content, s.settings.PostContentMax(), ErrPostContentTooLong); err != nil {
		return nil, err
	}
	if _, err := NewBoardService().GetByID(boardID); err != nil {
		return nil, err
	}
	status := model.ContentStatusPending
	if isAdmin {
		status = model.ContentStatusPublished
	}
	post := &model.Post{
		BoardID:          boardID,
		UserID:           userID,
		Title:            title,
		Content:          content,
		ContentPlain:     StripHTMLForSearch(content),
		Tags:             tags,
		PostType:         postType,
		QuestionResolved: false,
		Status:           status,
	}
	return post, model.DB.Create(post).Error
}

// Update 更新帖子。boardID>0 时可改板块；为 0 时保持原板块。
// postType 为空时保持原类型；改为非 question 时清除已解决标记。
func (s *PostService) Update(userID, postID uint, isAdmin bool, title, content, tags, postType string, boardID uint) error {
	var post model.Post
	if err := model.DB.First(&post, postID).Error; err != nil {
		return ErrPostNotFound
	}
	if !isAdmin && post.UserID != userID {
		return ErrPermissionDenied
	}
	if err := s.checkEditable(&post, isAdmin); err != nil {
		return err
	}
	title = s.filter.Filter(strings.TrimSpace(title))
	content = s.filter.Filter(content)
	tags = s.filter.Filter(strings.TrimSpace(tags))
	if err := s.settings.ValidateTextLength(title, s.settings.PostTitleMax(), ErrPostTitleTooLong); err != nil {
		return err
	}
	if err := s.settings.ValidateTextLength(tags, s.settings.PostTagsMax(), ErrPostTagsTooLong); err != nil {
		return err
	}
	if err := s.settings.ValidateTextLength(content, s.settings.PostContentMax(), ErrPostContentTooLong); err != nil {
		return err
	}
	nextBoardID := post.BoardID
	if boardID > 0 && boardID != post.BoardID {
		if _, err := NewBoardService().GetByID(boardID); err != nil {
			return err
		}
		nextBoardID = boardID
	}
	nextType := post.PostType
	if strings.TrimSpace(postType) != "" {
		nextType = normalizePostType(postType)
	}
	nextResolved := post.QuestionResolved
	if nextType != model.PostTypeQuestion {
		nextResolved = false
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		rev := model.PostRevision{
			PostID: postID, EditorID: userID,
			Title: post.Title, Content: post.Content, Tags: post.Tags,
		}
		if err := tx.Create(&rev).Error; err != nil {
			return err
		}
		updates := map[string]interface{}{
			"board_id":          nextBoardID,
			"title":             title,
			"content":           content,
			"content_plain":     StripHTMLForSearch(content),
			"tags":              tags,
			"post_type":         nextType,
			"question_resolved": nextResolved,
		}
		// 普通用户修改后重新进入审核
		if !isAdmin {
			updates["status"] = model.ContentStatusPending
		}
		return tx.Model(&post).Updates(updates).Error
	})
}

// SetStatus 设置帖子审核状态
func (s *PostService) SetStatus(postID uint, status string) error {
	switch status {
	case model.ContentStatusPending, model.ContentStatusPublished, model.ContentStatusRejected:
	default:
		return errors.New("无效的审核状态")
	}
	res := model.DB.Model(&model.Post{}).Where("id = ?", postID).Update("status", status)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrPostNotFound
	}
	return nil
}

// PendingPostCount 待审帖数量
func (s *PostService) PendingPostCount() (int64, error) {
	var n int64
	err := model.DB.Model(&model.Post{}).Where("status = ?", model.ContentStatusPending).Count(&n).Error
	return n, err
}

// CanEdit 判断当前用户是否可编辑帖子
func (s *PostService) CanEdit(post *model.Post, isAdmin bool) bool {
	return s.checkEditable(post, isAdmin) == nil
}

// EditBlockReason 返回不可编辑的原因（可编辑时返回空字符串）
func (s *PostService) EditBlockReason(post *model.Post, isAdmin bool) string {
	if err := s.checkEditable(post, isAdmin); err != nil {
		return err.Error()
	}
	return ""
}

func (s *PostService) checkEditable(post *model.Post, isAdmin bool) error {
	if isAdmin {
		return nil
	}
	if post.EditLocked {
		return ErrPostEditLocked
	}
	window := s.settings.PostEditWindowHours()
	if window > 0 && time.Since(post.CreatedAt) > time.Duration(window)*time.Hour {
		return ErrPostEditExpired
	}
	return nil
}

// CanUserEdit 判断指定用户是否可编辑帖子
func (s *PostService) CanUserEdit(post *model.Post, userID uint, isAdmin bool) bool {
	if userID == 0 {
		return false
	}
	if !isAdmin && post.UserID != userID {
		return false
	}
	return s.CanEdit(post, isAdmin)
}

// UserEditBlockReason 返回用户不可编辑的原因
func (s *PostService) UserEditBlockReason(post *model.Post, userID uint, isAdmin bool) string {
	if userID == 0 {
		return "请先登录"
	}
	if !isAdmin && post.UserID != userID {
		return ErrPermissionDenied.Error()
	}
	return s.EditBlockReason(post, isAdmin)
}

func (s *PostService) SetEditLocked(postID uint, locked bool) error {
	res := model.DB.Model(&model.Post{}).Where("id = ?", postID).Update("edit_locked", locked)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrPostNotFound
	}
	return nil
}

func (s *PostService) ListRevisions(postID uint) ([]model.PostRevision, error) {
	var revs []model.PostRevision
	err := model.DB.Preload("Editor").Where("post_id = ?", postID).
		Order("id desc").Find(&revs).Error
	if err != nil {
		return nil, err
	}
	if revs == nil {
		revs = []model.PostRevision{}
	}
	return revs, nil
}

func (s *PostService) GetRevision(postID, revID uint) (*model.PostRevision, error) {
	var rev model.PostRevision
	err := model.DB.Preload("Editor").
		Where("id = ? AND post_id = ?", revID, postID).First(&rev).Error
	if err != nil {
		return nil, ErrRevisionNotFound
	}
	return &rev, nil
}

// Delete 软删除帖子及其评论（进入回收站）；点赞/收藏保留以便恢复。仅管理员可删。
func (s *PostService) Delete(userID, postID uint, isAdmin bool) error {
	if !isAdmin {
		return ErrPermissionDenied
	}
	var post model.Post
	if err := model.DB.First(&post, postID).Error; err != nil {
		return ErrPostNotFound
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("post_id = ?", postID).Delete(&model.Comment{}).Error; err != nil {
			return err
		}
		return tx.Delete(&post).Error
	})
}

// TrashPostItem 回收站列表项
type TrashPostItem struct {
	PostListItem
	DeletedAt time.Time `json:"deleted_at"`
}

// ListTrash 列出已软删帖子
func (s *PostService) ListTrash(page, size int, keyword string) ([]TrashPostItem, int64, error) {
	if page < 1 {
		page = 1
	}
	size = s.settings.NormalizePageSize(size)
	db := model.DB.Unscoped().Model(&model.Post{}).
		Where("deleted_at IS NOT NULL").
		Preload("User").Preload("Board")
	if keyword != "" {
		kw, err := s.settings.NormalizeSearchKeyword(keyword)
		if err != nil {
			return nil, 0, err
		}
		like := "%" + kw + "%"
		db = db.Where("title LIKE ? OR content_plain LIKE ? OR tags LIKE ?", like, like, like)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var posts []model.Post
	if err := db.Order("deleted_at DESC").Offset((page - 1) * size).Limit(size).Find(&posts).Error; err != nil {
		return nil, 0, err
	}
	if len(posts) == 0 {
		return []TrashPostItem{}, total, nil
	}
	ids := make([]uint, len(posts))
	for i, p := range posts {
		ids[i] = p.ID
	}
	// 评论已软删，统计需 Unscoped
	type row struct {
		PostID uint
		Cnt    int
	}
	var rows []row
	_ = model.DB.Unscoped().Model(&model.Comment{}).
		Select("post_id, COUNT(*) as cnt").
		Where("post_id IN ?", ids).
		Group("post_id").Scan(&rows)
	countMap := make(map[uint]int, len(rows))
	for _, r := range rows {
		countMap[r.PostID] = r.Cnt
	}
	out := make([]TrashPostItem, len(posts))
	for i, p := range posts {
		item := PostListItem{Post: p, CommentCount: countMap[p.ID]}
		out[i] = TrashPostItem{PostListItem: item}
		if p.DeletedAt.Valid {
			out[i].DeletedAt = p.DeletedAt.Time
		}
	}
	return out, total, nil
}

// Restore 从回收站恢复帖子及评论
func (s *PostService) Restore(postID uint) error {
	var post model.Post
	if err := model.DB.Unscoped().First(&post, postID).Error; err != nil {
		return ErrPostNotFound
	}
	if !post.DeletedAt.Valid {
		return errors.New("帖子未被删除")
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Unscoped().Model(&model.Comment{}).
			Where("post_id = ? AND deleted_at IS NOT NULL", postID).
			Update("deleted_at", nil).Error; err != nil {
			return err
		}
		return tx.Unscoped().Model(&post).Update("deleted_at", nil).Error
	})
}

// Purge 永久删除回收站中的帖子（含评论、点赞、收藏、修订）
func (s *PostService) Purge(postID uint) error {
	var post model.Post
	if err := model.DB.Unscoped().First(&post, postID).Error; err != nil {
		return ErrPostNotFound
	}
	if !post.DeletedAt.Valid {
		return errors.New("仅可彻底删除回收站中的帖子，请先删除帖子")
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		var commentIDs []uint
		if err := tx.Unscoped().Model(&model.Comment{}).Where("post_id = ?", postID).Pluck("id", &commentIDs).Error; err != nil {
			return err
		}
		if len(commentIDs) > 0 {
			if err := tx.Where("comment_id IN ?", commentIDs).Delete(&model.CommentRevision{}).Error; err != nil {
				return err
			}
		}
		if err := tx.Unscoped().Where("post_id = ?", postID).Delete(&model.Comment{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("post_id = ?", postID).Delete(&model.PostLike{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("post_id = ?", postID).Delete(&model.PostFavorite{}).Error; err != nil {
			return err
		}
		if err := tx.Where("post_id = ?", postID).Delete(&model.PostRevision{}).Error; err != nil {
			return err
		}
		return tx.Unscoped().Delete(&post).Error
	})
}

func (s *PostService) SetPinned(postID uint, pinned bool) error {
	return model.DB.Model(&model.Post{}).Where("id = ?", postID).Update("pinned", pinned).Error
}

func (s *PostService) SetFeatured(postID uint, featured bool) error {
	return model.DB.Model(&model.Post{}).Where("id = ?", postID).Update("featured", featured).Error
}

// SetQuestionResolved 标记问答帖已解决 / 未解决（作者或管理员）
func (s *PostService) SetQuestionResolved(userID, postID uint, isAdmin bool, resolved bool) error {
	var post model.Post
	if err := model.DB.First(&post, postID).Error; err != nil {
		return ErrPostNotFound
	}
	if !isAdmin && post.UserID != userID {
		return ErrPermissionDenied
	}
	if post.PostType != model.PostTypeQuestion {
		return errors.New("仅问答帖可标记解决状态")
	}
	return model.DB.Model(&post).Update("question_resolved", resolved).Error
}

func (s *PostService) ToggleLike(userID, postID uint) (liked bool, err error) {
	var like model.PostLike
	result := model.DB.Where("post_id = ? AND user_id = ?", postID, userID).Limit(1).Find(&like)
	if result.Error != nil {
		return false, result.Error
	}
	if result.RowsAffected > 0 {
		model.DB.Delete(&like)
		model.DB.Model(&model.Post{}).Where("id = ?", postID).UpdateColumn("like_count", gorm.Expr("like_count - 1"))
		return false, nil
	}
	like = model.PostLike{PostID: postID, UserID: userID}
	if err := model.DB.Create(&like).Error; err != nil {
		return false, err
	}
	model.DB.Model(&model.Post{}).Where("id = ?", postID).UpdateColumn("like_count", gorm.Expr("like_count + 1"))
	return true, nil
}

func (s *PostService) IsLiked(userID, postID uint) bool {
	var count int64
	model.DB.Model(&model.PostLike{}).Where("post_id = ? AND user_id = ?", postID, userID).Count(&count)
	return count > 0
}

func (s *PostService) ToggleFavorite(userID, postID uint) (faved bool, err error) {
	var fav model.PostFavorite
	result := model.DB.Where("post_id = ? AND user_id = ?", postID, userID).Limit(1).Find(&fav)
	if result.Error != nil {
		return false, result.Error
	}
	if result.RowsAffected > 0 {
		if err := model.DB.Delete(&fav).Error; err != nil {
			return false, err
		}
		return false, nil
	}
	fav = model.PostFavorite{PostID: postID, UserID: userID}
	if err := model.DB.Create(&fav).Error; err != nil {
		return false, err
	}
	return true, nil
}

func (s *PostService) IsFavorited(userID, postID uint) bool {
	var count int64
	model.DB.Model(&model.PostFavorite{}).Where("post_id = ? AND user_id = ?", postID, userID).Count(&count)
	return count > 0
}

func (s *PostService) ListFavorites(userID uint, page, size int) ([]model.PostFavorite, int64, error) {
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 20
	}
	// 仅统计可查看的收藏（已公开，或本人未公开帖）
	base := model.DB.Model(&model.PostFavorite{}).
		Joins("JOIN posts ON posts.id = post_favorites.post_id AND posts.deleted_at IS NULL").
		Where("post_favorites.user_id = ?", userID).
		Where("posts.status = ? OR posts.user_id = ?", model.ContentStatusPublished, userID)
	var total int64
	base.Count(&total)
	var favs []model.PostFavorite
	err := model.DB.Preload("Post.User").Preload("Post.Board").
		Joins("JOIN posts ON posts.id = post_favorites.post_id AND posts.deleted_at IS NULL").
		Where("post_favorites.user_id = ?", userID).
		Where("posts.status = ? OR posts.user_id = ?", model.ContentStatusPublished, userID).
		Order("post_favorites.id desc").
		Offset((page - 1) * size).Limit(size).Find(&favs).Error
	return favs, total, err
}

// SitemapPost 站点地图用的轻量帖子字段
type SitemapPost struct {
	ID        uint
	CreatedAt time.Time
	UpdatedAt time.Time
}

// ListSitemap 按更新时间倒序列出帖子（供 sitemap）
func (s *PostService) ListSitemap(limit int) ([]SitemapPost, error) {
	if limit <= 0 {
		limit = 5000
	}
	var rows []SitemapPost
	err := model.DB.Model(&model.Post{}).
		Select("id, created_at, updated_at").
		Where("status = ?", model.ContentStatusPublished).
		Order("updated_at desc, id desc").
		Limit(limit).
		Find(&rows).Error
	return rows, err
}

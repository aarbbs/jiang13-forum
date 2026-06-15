package service

import (
	"errors"
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

type PostListQuery struct {
	BoardID uint
	Page    int
	Size    int
	Keyword string
	Sort    string // latest | reply | hot
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
		Where("post_id IN ?", postIDs).Group("post_id").Scan(&rows)
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
		Where("post_id IN ?", postIDs).
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

func (s *PostService) CommentCount(postID uint) int {
	var count int64
	model.DB.Model(&model.Comment{}).Where("post_id = ?", postID).Count(&count)
	return int(count)
}

func (s *PostService) List(q PostListQuery) ([]model.Post, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Size < 1 {
		q.Size = 20
	}
	db := model.DB.Model(&model.Post{}).Preload("User").Preload("Board")
	if q.BoardID > 0 {
		db = db.Where("board_id = ?", q.BoardID)
	}
	if q.Keyword != "" {
		kw := "%" + q.Keyword + "%"
		db = db.Where("title LIKE ? OR content LIKE ? OR tags LIKE ?", kw, kw, kw)
	}
	var total int64
	db.Count(&total)
	var posts []model.Post
	db = db.Order("pinned desc")
	switch normalizePostSort(q.Sort) {
	case "reply":
		// 有回复的帖子优先，按最后回复时间倒序；无回复的帖子沉底
		db = db.Order(`(
			SELECT COUNT(*) FROM comments
			WHERE comments.post_id = posts.id AND comments.deleted_at IS NULL
		) > 0 DESC`)
		db = db.Order(`(
			SELECT MAX(created_at) FROM comments
			WHERE comments.post_id = posts.id AND comments.deleted_at IS NULL
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

func (s *PostService) GetByID(id uint) (*model.Post, error) {
	var post model.Post
	err := model.DB.Preload("User").Preload("Board").First(&post, id).Error
	if err != nil {
		return nil, ErrPostNotFound
	}
	model.DB.Model(&post).UpdateColumn("view_count", gorm.Expr("view_count + 1"))
	return &post, nil
}

func (s *PostService) Create(userID, boardID uint, title, content, tags string) (*model.Post, error) {
	title = s.filter.Filter(strings.TrimSpace(title))
	content = s.filter.Filter(content)
	tags = s.filter.Filter(strings.TrimSpace(tags))
	if title == "" || content == "" {
		return nil, errors.New("标题和内容不能为空")
	}
	if _, err := NewBoardService().GetByID(boardID); err != nil {
		return nil, err
	}
	post := &model.Post{
		BoardID: boardID, UserID: userID,
		Title: title, Content: content, Tags: tags,
	}
	return post, model.DB.Create(post).Error
}

func (s *PostService) Update(userID, postID uint, isAdmin bool, title, content, tags string) error {
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
	return model.DB.Transaction(func(tx *gorm.DB) error {
		rev := model.PostRevision{
			PostID: postID, EditorID: userID,
			Title: post.Title, Content: post.Content, Tags: post.Tags,
		}
		if err := tx.Create(&rev).Error; err != nil {
			return err
		}
		return tx.Model(&post).Updates(map[string]interface{}{
			"title": title, "content": content, "tags": tags,
		}).Error
	})
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

func (s *PostService) Delete(userID, postID uint, isAdmin bool) error {
	var post model.Post
	if err := model.DB.First(&post, postID).Error; err != nil {
		return ErrPostNotFound
	}
	if !isAdmin && post.UserID != userID {
		return ErrPermissionDenied
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("post_id = ?", postID).Delete(&model.Comment{}).Error; err != nil {
			return err
		}
		if err := tx.Where("post_id = ?", postID).Delete(&model.PostLike{}).Error; err != nil {
			return err
		}
		if err := tx.Where("post_id = ?", postID).Delete(&model.PostFavorite{}).Error; err != nil {
			return err
		}
		return tx.Delete(&post).Error
	})
}

func (s *PostService) SetPinned(postID uint, pinned bool) error {
	return model.DB.Model(&model.Post{}).Where("id = ?", postID).Update("pinned", pinned).Error
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
	var total int64
	model.DB.Model(&model.PostFavorite{}).Where("user_id = ?", userID).Count(&total)
	var favs []model.PostFavorite
	err := model.DB.Preload("Post.User").Preload("Post.Board").
		Where("user_id = ?", userID).Order("id desc").
		Offset((page - 1) * size).Limit(size).Find(&favs).Error
	return favs, total, err
}

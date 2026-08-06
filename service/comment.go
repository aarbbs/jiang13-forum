package service

import (
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	"git.iioio.com/freefire/jiang13-forum/model"
)

type CommentService struct {
	filter   *SensitiveFilter
	settings *ForumSettingsService
}

func NewCommentService(filter *SensitiveFilter, settings *ForumSettingsService) *CommentService {
	return &CommentService{filter: filter, settings: settings}
}

// HasUserReplied 用户是否已在该帖发表过有效评论（已发布或审核中，不含被拒）
func (s *CommentService) HasUserReplied(postID, userID uint) bool {
	if postID == 0 || userID == 0 {
		return false
	}
	var count int64
	err := model.DB.Model(&model.Comment{}).
		Where("post_id = ? AND user_id = ? AND status IN ?", postID, userID,
			[]string{model.ContentStatusPublished, model.ContentStatusPending}).
		Limit(1).
		Count(&count).Error
	return err == nil && count > 0
}

type CommentCreateInput struct {
	UserID     uint
	PostID     uint
	Content    string
	ReplyTo    *uint
	GuestNick  string
	GuestEmail string
	GuestURL   string
	IsPrivate  bool
}

func (s *CommentService) canViewPrivate(c model.Comment, viewerID uint, isAdmin bool, postAuthorID uint, guestSet map[uint]struct{}) bool {
	if !c.IsPrivate {
		return true
	}
	if isAdmin {
		return true
	}
	if viewerID > 0 && viewerID == postAuthorID {
		return true
	}
	if c.UserID > 0 && viewerID == c.UserID {
		return true
	}
	if _, ok := guestSet[c.ID]; ok {
		return true
	}
	return false
}

func (s *CommentService) fillReplyTargets(comments []model.Comment, loadMissing bool) {
	idMap := make(map[uint]model.Comment, len(comments))
	for _, c := range comments {
		idMap[c.ID] = c
	}
	for i := range comments {
		if comments[i].ReplyTo == nil {
			continue
		}
		if target, ok := idMap[*comments[i].ReplyTo]; ok {
			t := target
			comments[i].ReplyTarget = &t
			continue
		}
		if loadMissing {
			var target model.Comment
			if model.DB.Preload("User").First(&target, *comments[i].ReplyTo).Error == nil {
				comments[i].ReplyTarget = &target
			}
		}
	}
}

func canViewComment(c model.Comment, viewerID uint, isAdmin bool) bool {
	if isAdmin || c.Status == model.ContentStatusPublished || c.Status == "" {
		return true
	}
	if c.Status == model.ContentStatusPending || c.Status == model.ContentStatusRejected {
		return viewerID > 0 && c.UserID == viewerID
	}
	return false
}

func (s *CommentService) ListByPost(postID, viewerID uint, isAdmin bool, postAuthorID uint, visibleGuestIDs []uint) ([]model.Comment, error) {
	var comments []model.Comment
	err := model.DB.Preload("User").Where("post_id = ?", postID).Order("floor asc").Find(&comments).Error
	if err != nil {
		return nil, err
	}

	guestSet := make(map[uint]struct{}, len(visibleGuestIDs))
	for _, id := range visibleGuestIDs {
		guestSet[id] = struct{}{}
	}

	allByID := make(map[uint]model.Comment, len(comments))
	for _, c := range comments {
		allByID[c.ID] = c
	}

	visible := make([]model.Comment, 0, len(comments))
	visibleIDs := make(map[uint]struct{}, len(comments))
	for i := range comments {
		if !canViewComment(comments[i], viewerID, isAdmin) {
			continue
		}
		if comments[i].IsPrivate && !s.canViewPrivate(comments[i], viewerID, isAdmin, postAuthorID, guestSet) {
			comments[i].ContentHidden = true
			comments[i].Content = ""
		}
		visibleIDs[comments[i].ID] = struct{}{}
		visible = append(visible, comments[i])
	}

	// 父评论不可见时，回挂到最近可见祖先，避免回复在游客侧变成独立顶层评论
	for i := range visible {
		visible[i].ThreadParentID = resolveThreadParent(visible[i].ReplyTo, visibleIDs, allByID)
	}

	s.fillReplyTargets(visible, true)
	for i := range visible {
		if rt := visible[i].ReplyTarget; rt != nil && !canViewComment(*rt, viewerID, isAdmin) {
			// 不可见父评论仅保留昵称供 @，不泄露正文
			rt.Content = ""
			rt.ContentHidden = true
		}
	}
	s.fillLiked(visible, viewerID)
	return visible, nil
}

// resolveThreadParent 计算嵌套展示父节点：优先直接父评论，否则沿 reply_to 向上找到最近可见祖先
func resolveThreadParent(replyTo *uint, visibleIDs map[uint]struct{}, allByID map[uint]model.Comment) *uint {
	if replyTo == nil {
		return nil
	}
	if _, ok := visibleIDs[*replyTo]; ok {
		id := *replyTo
		return &id
	}
	cur := *replyTo
	for hops := 0; hops < 32; hops++ {
		parent, ok := allByID[cur]
		if !ok || parent.ReplyTo == nil {
			return nil
		}
		next := *parent.ReplyTo
		if _, ok := visibleIDs[next]; ok {
			id := next
			return &id
		}
		cur = next
	}
	return nil
}

func (s *CommentService) Create(in CommentCreateInput) (*model.Comment, error) {
	content := s.filter.Filter(strings.TrimSpace(in.Content))
	if content == "" {
		return nil, errors.New("评论内容不能为空")
	}
	if err := s.settings.ValidateTextLength(content, s.settings.CommentMax(), ErrCommentTooLong); err != nil {
		return nil, err
	}

	var post model.Post
	if err := model.DB.First(&post, in.PostID).Error; err != nil {
		return nil, ErrPostNotFound
	}

	if in.UserID == 0 {
		return nil, errors.New("请登录后评论")
	}
	var user model.User
	if err := model.DB.First(&user, in.UserID).Error; err != nil {
		return nil, errors.New("用户不存在")
	}
	if user.Banned {
		return nil, errors.New("账号已被禁言")
	}

	// 讨论锁定：管理员亦不可强评（避免结贴后仍被顶楼）
	if post.CommentsLocked {
		return nil, ErrPostCommentsLocked
	}

	// 未公开帖仅作者/管理员可评论
	if post.Status != model.ContentStatusPublished && post.Status != "" {
		if user.Role != model.RoleAdmin && post.UserID != in.UserID {
			return nil, errors.New("帖子审核中，暂不可评论")
		}
	}

	var maxFloor int
	model.DB.Model(&model.Comment{}).Where("post_id = ?", in.PostID).Select("COALESCE(MAX(floor), 0)").Scan(&maxFloor)

	if in.ReplyTo != nil {
		var target model.Comment
		if err := model.DB.Where("id = ? AND post_id = ?", *in.ReplyTo, in.PostID).First(&target).Error; err != nil {
			return nil, ErrCommentNotFound
		}
		if !canViewComment(target, in.UserID, user.Role == model.RoleAdmin) {
			return nil, ErrCommentNotFound
		}
	}

	status := model.ContentStatusPending
	if user.SkipsModeration() {
		status = model.ContentStatusPublished
	}

	comment := &model.Comment{
		PostID:     in.PostID,
		UserID:     in.UserID,
		Floor:      maxFloor + 1,
		Content:    content,
		ReplyTo:    in.ReplyTo,
		GuestNick:  strings.TrimSpace(in.GuestNick),
		GuestEmail: strings.TrimSpace(in.GuestEmail),
		GuestURL:   strings.TrimSpace(in.GuestURL),
		IsPrivate:  in.IsPrivate,
		Status:     status,
	}
	if err := model.DB.Create(comment).Error; err != nil {
		return nil, err
	}
	if status == model.ContentStatusPublished {
		AddExp(in.UserID, 2)
	}
	return comment, nil
}

// SetStatus 设置评论审核状态
func (s *CommentService) SetStatus(commentID uint, status string) error {
	switch status {
	case model.ContentStatusPending, model.ContentStatusPublished, model.ContentStatusRejected:
	default:
		return errors.New("无效的审核状态")
	}
	var comment model.Comment
	if err := model.DB.Select("id", "user_id", "status").First(&comment, commentID).Error; err != nil {
		return ErrCommentNotFound
	}
	prev := comment.Status
	res := model.DB.Model(&model.Comment{}).Where("id = ?", commentID).Update("status", status)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrCommentNotFound
	}
	if status == model.ContentStatusPublished && prev != model.ContentStatusPublished && comment.UserID > 0 {
		AddExp(comment.UserID, 2)
	}
	return nil
}

// GetByID 获取评论
func (s *CommentService) GetByID(id uint) (*model.Comment, error) {
	var c model.Comment
	if err := model.DB.Preload("User").Preload("Post").First(&c, id).Error; err != nil {
		return nil, ErrCommentNotFound
	}
	return &c, nil
}

// fillLiked 批量标记当前用户是否已点赞
func (s *CommentService) fillLiked(comments []model.Comment, viewerID uint) {
	if viewerID == 0 || len(comments) == 0 {
		return
	}
	ids := make([]uint, 0, len(comments))
	for _, c := range comments {
		ids = append(ids, c.ID)
	}
	var likes []model.CommentLike
	model.DB.Where("user_id = ? AND comment_id IN ?", viewerID, ids).Find(&likes)
	likedSet := make(map[uint]struct{}, len(likes))
	for _, l := range likes {
		likedSet[l.CommentID] = struct{}{}
	}
	for i := range comments {
		_, comments[i].Liked = likedSet[comments[i].ID]
	}
}

// ToggleLike 切换评论点赞
func (s *CommentService) ToggleLike(userID, commentID uint) (liked bool, likeCount int, err error) {
	var comment model.Comment
	if err := model.DB.Select("id", "like_count").First(&comment, commentID).Error; err != nil {
		return false, 0, ErrCommentNotFound
	}
	var like model.CommentLike
	result := model.DB.Where("comment_id = ? AND user_id = ?", commentID, userID).Limit(1).Find(&like)
	if result.Error != nil {
		return false, 0, result.Error
	}
	if result.RowsAffected > 0 {
		if err := model.DB.Delete(&like).Error; err != nil {
			return false, 0, err
		}
		model.DB.Model(&model.Comment{}).Where("id = ?", commentID).UpdateColumn("like_count", gorm.Expr("CASE WHEN like_count > 0 THEN like_count - 1 ELSE 0 END"))
		_ = model.DB.Select("like_count").First(&comment, commentID)
		return false, comment.LikeCount, nil
	}
	like = model.CommentLike{CommentID: commentID, UserID: userID}
	if err := model.DB.Create(&like).Error; err != nil {
		return false, 0, err
	}
	model.DB.Model(&model.Comment{}).Where("id = ?", commentID).UpdateColumn("like_count", gorm.Expr("like_count + 1"))
	_ = model.DB.Select("like_count").First(&comment, commentID)
	return true, comment.LikeCount, nil
}

// IsLiked 用户是否已点赞该评论
func (s *CommentService) IsLiked(userID, commentID uint) bool {
	if userID == 0 || commentID == 0 {
		return false
	}
	var count int64
	model.DB.Model(&model.CommentLike{}).Where("comment_id = ? AND user_id = ?", commentID, userID).Count(&count)
	return count > 0
}

// PendingCommentCount 待审评论数
func (s *CommentService) PendingCommentCount() (int64, error) {
	var n int64
	err := model.DB.Model(&model.Comment{}).Where("status = ?", model.ContentStatusPending).Count(&n).Error
	return n, err
}

func (s *CommentService) Delete(userID, commentID uint, isAdmin bool) error {
	if !isAdmin {
		return ErrPermissionDenied
	}
	return s.AdminDelete(commentID)
}

func (s *CommentService) Update(userID, commentID uint, isAdmin, skipModeration bool, content string) (string, bool, error) {
	var comment model.Comment
	if err := model.DB.First(&comment, commentID).Error; err != nil {
		return "", false, ErrCommentNotFound
	}
	if !isAdmin && (comment.UserID == 0 || comment.UserID != userID) {
		return "", false, ErrPermissionDenied
	}
	if !isAdmin {
		window := s.settings.CommentEditWindowMinutes()
		if window > 0 && time.Since(comment.CreatedAt) > time.Duration(window)*time.Minute {
			return "", false, errors.New("已超过可编辑时限")
		}
	}

	content = s.filter.Filter(strings.TrimSpace(content))
	if content == "" {
		return "", false, errors.New("评论内容不能为空")
	}
	if err := s.settings.ValidateTextLength(content, s.settings.CommentMax(), ErrCommentTooLong); err != nil {
		return "", false, err
	}
	if content == comment.Content {
		return content, false, nil
	}

	enteredPending := false
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		rev := model.CommentRevision{
			CommentID: commentID,
			EditorID:  userID,
			Content:   comment.Content,
		}
		if err := tx.Create(&rev).Error; err != nil {
			return err
		}
		updates := map[string]interface{}{"content": content}
		if !skipModeration {
			updates["status"] = model.ContentStatusPending
			enteredPending = true
		}
		return tx.Model(&comment).Updates(updates).Error
	})
	if err != nil {
		return "", false, err
	}
	return content, enteredPending, nil
}

// collectReplySubtreeIDs 沿 reply_to BFS 收集子树 ID（含 rootID）
// softDeletedOnly 为 true 时仅收集已软删节点（用于回收站恢复/永久删除）
func collectReplySubtreeIDs(db *gorm.DB, rootID uint, softDeletedOnly bool) ([]uint, error) {
	q := db
	if softDeletedOnly {
		q = db.Unscoped()
	}
	ids := []uint{rootID}
	seen := map[uint]struct{}{rootID: {}}
	frontier := []uint{rootID}
	for len(frontier) > 0 {
		childQ := q.Model(&model.Comment{}).Select("id").Where("reply_to IN ?", frontier)
		if softDeletedOnly {
			childQ = childQ.Where("deleted_at IS NOT NULL")
		}
		var children []model.Comment
		if err := childQ.Find(&children).Error; err != nil {
			return nil, err
		}
		frontier = frontier[:0]
		for _, c := range children {
			if _, ok := seen[c.ID]; ok {
				continue
			}
			seen[c.ID] = struct{}{}
			ids = append(ids, c.ID)
			frontier = append(frontier, c.ID)
		}
	}
	return ids, nil
}

// AdminDelete 软删除评论及其回复树（进入回收站）；修订与点赞保留以便恢复
func (s *CommentService) AdminDelete(commentID uint) error {
	var root model.Comment
	if err := model.DB.First(&root, commentID).Error; err != nil {
		return ErrCommentNotFound
	}
	ids, err := collectReplySubtreeIDs(model.DB, commentID, false)
	if err != nil {
		return err
	}
	return model.DB.Where("id IN ?", ids).Delete(&model.Comment{}).Error
}

// TrashCommentItem 评论回收站列表项
type TrashCommentItem struct {
	model.Comment
	DeletedAt time.Time `json:"deleted_at"`
}

// ListTrash 列出已软删评论（不含随帖子一并删除的评论，那些在帖子回收站处理）
func (s *CommentService) ListTrash(page, size int, keyword string) ([]TrashCommentItem, int64, error) {
	if page < 1 {
		page = 1
	}
	size = s.settings.NormalizePageSize(size)
	db := model.DB.Unscoped().Model(&model.Comment{}).
		Where("comments.deleted_at IS NOT NULL").
		Joins("JOIN posts ON posts.id = comments.post_id AND posts.deleted_at IS NULL").
		Preload("User").Preload("Post")
	if keyword != "" {
		kw, err := s.settings.NormalizeSearchKeyword(keyword)
		if err != nil {
			return nil, 0, err
		}
		like := "%" + kw + "%"
		db = db.Where("comments.content LIKE ? OR posts.title LIKE ?", like, like)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var comments []model.Comment
	if err := db.Order("comments.deleted_at DESC").Offset((page - 1) * size).Limit(size).Find(&comments).Error; err != nil {
		return nil, 0, err
	}
	out := make([]TrashCommentItem, len(comments))
	for i, c := range comments {
		out[i] = TrashCommentItem{Comment: c}
		if c.DeletedAt.Valid {
			out[i].DeletedAt = c.DeletedAt.Time
		}
	}
	return out, total, nil
}

// Restore 从回收站恢复评论及其已软删的回复树
func (s *CommentService) Restore(commentID uint) error {
	var comment model.Comment
	if err := model.DB.Unscoped().First(&comment, commentID).Error; err != nil {
		return ErrCommentNotFound
	}
	if !comment.DeletedAt.Valid {
		return errors.New("评论未被删除")
	}
	// 所属帖子必须仍存在且未删除
	var post model.Post
	if err := model.DB.First(&post, comment.PostID).Error; err != nil {
		return errors.New("所属帖子不存在或已在回收站，请先恢复帖子")
	}
	ids, err := collectReplySubtreeIDs(model.DB, commentID, true)
	if err != nil {
		return err
	}
	return model.DB.Unscoped().Model(&model.Comment{}).
		Where("id IN ?", ids).
		Update("deleted_at", nil).Error
}

// Purge 永久删除回收站中的评论及其已软删回复（含修订、点赞）
func (s *CommentService) Purge(commentID uint) error {
	var comment model.Comment
	if err := model.DB.Unscoped().First(&comment, commentID).Error; err != nil {
		return ErrCommentNotFound
	}
	if !comment.DeletedAt.Valid {
		return errors.New("仅可彻底删除回收站中的评论，请先删除评论")
	}
	ids, err := collectReplySubtreeIDs(model.DB, commentID, true)
	if err != nil {
		return err
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("comment_id IN ?", ids).Delete(&model.CommentRevision{}).Error; err != nil {
			return err
		}
		if err := tx.Where("comment_id IN ?", ids).Delete(&model.CommentLike{}).Error; err != nil {
			return err
		}
		return tx.Unscoped().Where("id IN ?", ids).Delete(&model.Comment{}).Error
	})
}

// ListRevisions 评论编辑历史（管理员查看）
func (s *CommentService) ListRevisions(commentID uint) ([]model.CommentRevision, error) {
	if _, err := s.GetByID(commentID); err != nil {
		return nil, err
	}
	var revs []model.CommentRevision
	err := model.DB.Preload("Editor").
		Where("comment_id = ?", commentID).
		Order("id desc").Find(&revs).Error
	if err != nil {
		return nil, err
	}
	if revs == nil {
		revs = []model.CommentRevision{}
	}
	return revs, nil
}

// RecentCommentItem 右栏「最新评论」条目
type RecentCommentItem struct {
	ID        uint   `json:"id"`
	PostID    uint   `json:"post_id"`
	Floor     int    `json:"floor"`
	UserID    uint   `json:"user_id,omitempty"`
	Author    string `json:"author"`
	Avatar    string `json:"avatar"`
	Excerpt   string `json:"excerpt"`
	PostTitle string `json:"post_title"`
	CreatedAt string `json:"created_at"`
}

// ListRecentPublic 前台最新公开评论（排除私密、已删帖）
func (s *CommentService) ListRecentPublic(limit int) ([]RecentCommentItem, error) {
	if limit < 1 {
		limit = 8
	}
	var comments []model.Comment
	err := model.DB.Preload("User").Preload("Post").
		Where("is_private = ? AND status = ?", false, model.ContentStatusPublished).
		Order("id desc").Limit(limit * 2). // 多取一些以跳过已删帖
		Find(&comments).Error
	if err != nil {
		return nil, err
	}

	out := make([]RecentCommentItem, 0, limit)
	for _, c := range comments {
		if c.Post.ID == 0 {
			continue
		}
		author := "游客"
		avatar := ""
		if c.UserID > 0 && c.User.Nickname != "" {
			author = c.User.Nickname
			avatar = c.User.Avatar
		} else if c.GuestNick != "" {
			author = c.GuestNick
		}
		excerpt := StripHTMLForSearch(c.Content)
		excerpt = truncateRunes(excerpt, 64)
		if excerpt == "" {
			excerpt = "发表了评论"
		}
		out = append(out, RecentCommentItem{
			ID:        c.ID,
			PostID:    c.PostID,
			Floor:     c.Floor,
			UserID:    c.UserID,
			Author:    author,
			Avatar:    avatar,
			Excerpt:   excerpt,
			PostTitle: c.Post.Title,
			// 返回 UTC ISO，由前端按本地时区展示（避免与后台差 8 小时）
			CreatedAt: c.CreatedAt.UTC().Format(time.RFC3339),
		})
		if len(out) >= limit {
			break
		}
	}
	return out, nil
}

func truncateRunes(s string, n int) string {
	if n <= 0 || s == "" {
		return s
	}
	runes := []rune(s)
	if len(runes) <= n {
		return s
	}
	return string(runes[:n]) + "…"
}

// ListRecent 管理员查看最近评论
func (s *CommentService) ListRecent(page, size int, status string) ([]model.Comment, int64, error) {
	if page < 1 {
		page = 1
	}
	if size < 1 {
		size = 20
	}
	db := model.DB.Model(&model.Comment{})
	switch status {
	case model.ContentStatusPending, model.ContentStatusPublished, model.ContentStatusRejected:
		db = db.Where("status = ?", status)
	}
	var total int64
	db.Count(&total)
	var comments []model.Comment
	err := db.Preload("User").Preload("Post").
		Order("CASE WHEN status = 'pending' THEN 0 ELSE 1 END, id DESC").
		Offset((page - 1) * size).Limit(size).Find(&comments).Error
	if err != nil {
		return nil, 0, err
	}
	s.fillReplyTargets(comments, true)
	return comments, total, err
}

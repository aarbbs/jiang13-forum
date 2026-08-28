package services

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"git.iioio.com/freefire/jiang13-forum/models"
)

var (
	ErrCannotMessageSelf = errors.New("不能给自己发私信")
)

type MessageService struct {
	filter   *SensitiveFilter
	settings *ForumSettingsService
}

func NewMessageService(filter *SensitiveFilter, settings *ForumSettingsService) *MessageService {
	return &MessageService{filter: filter, settings: settings}
}

type MessageSendInput struct {
	FromUserID      uint
	ToUserID        uint
	Subject         string
	Content         string
	Kind            string
	RelatedPostID   *uint
	RelatedReportID *uint
}

// Send 发送私信（用户互发或系统通知）
func (s *MessageService) Send(in MessageSendInput) (*models.PrivateMessage, error) {
	if in.ToUserID == 0 {
		return nil, errors.New("收件人不存在")
	}
	if in.FromUserID > 0 && in.FromUserID == in.ToUserID {
		return nil, ErrCannotMessageSelf
	}
	if in.FromUserID > 0 {
		var to models.User
		if err := models.DB.Select("id", "banned").First(&to, in.ToUserID).Error; err != nil {
			return nil, errors.New("收件人不存在")
		}
		if to.Banned {
			return nil, errors.New("对方账号已被禁言，暂时无法私信")
		}
	}

	subject := strings.TrimSpace(in.Subject)
	content := strings.TrimSpace(in.Content)
	if content == "" {
		return nil, errors.New("请填写内容")
	}
	// 会话式私信可不填标题，用正文摘要兜底
	if subject == "" {
		subject = truncateRunes(content, 40)
	}
	if utf8.RuneCountInString(subject) > 80 {
		return nil, errors.New("标题过长")
	}
	if utf8.RuneCountInString(content) > 4000 {
		return nil, errors.New("内容过长")
	}

	if s.filter != nil {
		subject = s.filter.Filter(subject)
		content = s.filter.Filter(content)
	}

	kind := in.Kind
	if kind == "" {
		if in.FromUserID == 0 {
			kind = models.MessageKindSystem
		} else {
			kind = models.MessageKindUser
		}
	}

	msg := &models.PrivateMessage{
		FromUserID:      in.FromUserID,
		ToUserID:        in.ToUserID,
		Subject:         subject,
		Content:         content,
		Kind:            kind,
		RelatedPostID:   in.RelatedPostID,
		RelatedReportID: in.RelatedReportID,
		IsRead:          false,
	}
	if err := models.DB.Create(msg).Error; err != nil {
		return nil, err
	}
	_ = models.DB.Preload("FromUser").Preload("ToUser").First(msg, msg.ID).Error
	return msg, nil
}

// SendSystem 系统私信（管理员/系统 → 用户）
func (s *MessageService) SendSystem(toUserID uint, subject, content, kind string, relatedPostID, relatedReportID *uint) (*models.PrivateMessage, error) {
	if kind == "" {
		kind = models.MessageKindSystem
	}
	return s.Send(MessageSendInput{
		FromUserID:      0,
		ToUserID:        toUserID,
		Subject:         subject,
		Content:         content,
		Kind:            kind,
		RelatedPostID:   relatedPostID,
		RelatedReportID: relatedReportID,
	})
}

// MarkAllRead 全部标为已读
func (s *MessageService) MarkAllRead(userID uint) error {
	return models.DB.Model(&models.PrivateMessage{}).
		Where("to_user_id = ? AND is_read = ?", userID, false).
		Update("is_read", true).Error
}

// UnreadCount 未读数
func (s *MessageService) UnreadCount(userID uint) (int64, error) {
	var n int64
	err := models.DB.Model(&models.PrivateMessage{}).
		Where("to_user_id = ? AND is_read = ?", userID, false).
		Count(&n).Error
	return n, err
}

// UnreadCounts 未读总数，以及私信 / 系统通知分项
func (s *MessageService) UnreadCounts(userID uint) (total, dm, notify int64, err error) {
	err = models.DB.Model(&models.PrivateMessage{}).
		Where("to_user_id = ? AND is_read = ?", userID, false).
		Count(&total).Error
	if err != nil {
		return 0, 0, 0, err
	}
	err = models.DB.Model(&models.PrivateMessage{}).
		Where("to_user_id = ? AND is_read = ? AND from_user_id = 0", userID, false).
		Count(&notify).Error
	if err != nil {
		return 0, 0, 0, err
	}
	dm = total - notify
	if dm < 0 {
		dm = 0
	}
	return total, dm, notify, nil
}

// ListNotifications 系统通知列表（按时间倒序，非聊天气泡）
func (s *MessageService) ListNotifications(userID uint, page, size int, kind string) ([]models.PrivateMessage, int64, error) {
	if page < 1 {
		page = 1
	}
	size = s.settings.NormalizePageSize(size)
	db := models.DB.Model(&models.PrivateMessage{}).
		Where("from_user_id = 0 AND to_user_id = ?", userID)
	kind = strings.TrimSpace(kind)
	if kind != "" && kind != "all" {
		db = db.Where("kind = ?", kind)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []models.PrivateMessage
	err := db.Order("id desc").Offset((page - 1) * size).Limit(size).Find(&list).Error
	if err != nil {
		return nil, 0, err
	}
	if list == nil {
		list = []models.PrivateMessage{}
	}
	return list, total, nil
}

// MarkNotificationsRead 将系统通知全部标为已读
func (s *MessageService) MarkNotificationsRead(userID uint) error {
	return s.MarkConversationRead(userID, 0)
}

// MessageConversation 按对方聚合的会话摘要
type MessageConversation struct {
	PeerUserID  uint                 `json:"peer_user_id"` // 0 = 系统通知
	PeerUser    *models.User          `json:"peer_user,omitempty"`
	IsSystem    bool                 `json:"is_system"`
	LastMessage *models.PrivateMessage `json:"last_message,omitempty"`
	UnreadCount int64                `json:"unread_count"`
	UpdatedAt   time.Time            `json:"updated_at"`
}

type ConversationListQuery struct {
	UserID uint
	Page   int
	Size   int
}

type ConversationMessagesQuery struct {
	UserID uint
	PeerID uint // 0 = 系统通知
	Page   int
	Size   int
	Before uint // 可选：加载更早消息（id < Before）
}

// ListConversations 会话列表（按对方聚合，最近消息优先）
func (s *MessageService) ListConversations(q ConversationListQuery) ([]MessageConversation, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	q.Size = s.settings.NormalizePageSize(q.Size)

	type peerRow struct {
		PeerID uint
		LastID uint
	}
	var rows []peerRow
	// peer_id：系统通知为 0；否则为对话另一方
	err := models.DB.Raw(`
		SELECT
			CASE
				WHEN from_user_id = 0 THEN 0
				WHEN from_user_id = ? THEN to_user_id
				ELSE from_user_id
			END AS peer_id,
			MAX(id) AS last_id
		FROM private_messages
		WHERE to_user_id = ? OR from_user_id = ?
		GROUP BY peer_id
		ORDER BY last_id DESC
		LIMIT ? OFFSET ?
	`, q.UserID, q.UserID, q.UserID, q.Size, (q.Page-1)*q.Size).Scan(&rows).Error
	if err != nil {
		return nil, 0, err
	}

	var total int64
	err = models.DB.Raw(`
		SELECT COUNT(*) FROM (
			SELECT
				CASE
					WHEN from_user_id = 0 THEN 0
					WHEN from_user_id = ? THEN to_user_id
					ELSE from_user_id
				END AS peer_id
			FROM private_messages
			WHERE to_user_id = ? OR from_user_id = ?
			GROUP BY peer_id
		)
	`, q.UserID, q.UserID, q.UserID).Scan(&total).Error
	if err != nil {
		return nil, 0, err
	}
	if len(rows) == 0 {
		return []MessageConversation{}, total, nil
	}

	lastIDs := make([]uint, len(rows))
	peerIDs := make([]uint, 0, len(rows))
	for i, r := range rows {
		lastIDs[i] = r.LastID
		if r.PeerID > 0 {
			peerIDs = append(peerIDs, r.PeerID)
		}
	}

	var lastMsgs []models.PrivateMessage
	if err := models.DB.Preload("FromUser").Preload("ToUser").
		Where("id IN ?", lastIDs).Find(&lastMsgs).Error; err != nil {
		return nil, 0, err
	}
	msgByID := make(map[uint]models.PrivateMessage, len(lastMsgs))
	for i := range lastMsgs {
		msgByID[lastMsgs[i].ID] = lastMsgs[i]
	}

	usersByID := make(map[uint]models.User)
	if len(peerIDs) > 0 {
		var users []models.User
		if err := models.DB.Where("id IN ?", peerIDs).Find(&users).Error; err != nil {
			return nil, 0, err
		}
		for i := range users {
			usersByID[users[i].ID] = users[i]
		}
	}

	type unreadRow struct {
		PeerID uint
		Cnt    int64
	}
	var unreadRows []unreadRow
	_ = models.DB.Raw(`
		SELECT
			CASE WHEN from_user_id = 0 THEN 0 ELSE from_user_id END AS peer_id,
			COUNT(*) AS cnt
		FROM private_messages
		WHERE to_user_id = ? AND is_read = 0
		GROUP BY peer_id
	`, q.UserID).Scan(&unreadRows)
	unreadByPeer := make(map[uint]int64, len(unreadRows))
	for _, u := range unreadRows {
		unreadByPeer[u.PeerID] = u.Cnt
	}

	out := make([]MessageConversation, 0, len(rows))
	for _, r := range rows {
		msg, ok := msgByID[r.LastID]
		if !ok {
			continue
		}
		conv := MessageConversation{
			PeerUserID:  r.PeerID,
			IsSystem:    r.PeerID == 0,
			LastMessage: &msg,
			UnreadCount: unreadByPeer[r.PeerID],
			UpdatedAt:   msg.CreatedAt,
		}
		if r.PeerID > 0 {
			if u, ok := usersByID[r.PeerID]; ok {
				uu := u
				conv.PeerUser = &uu
			}
		}
		out = append(out, conv)
	}
	return out, total, nil
}

// ListConversationMessages 某会话内消息（时间正序，支持 Before 向上翻页）
func (s *MessageService) ListConversationMessages(q ConversationMessagesQuery) ([]models.PrivateMessage, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	q.Size = s.settings.NormalizePageSize(q.Size)

	countDB := models.DB.Model(&models.PrivateMessage{})
	if q.PeerID == 0 {
		countDB = countDB.Where("from_user_id = 0 AND to_user_id = ?", q.UserID)
	} else {
		countDB = countDB.Where(
			"(from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)",
			q.UserID, q.PeerID, q.PeerID, q.UserID,
		)
	}

	var total int64
	if err := countDB.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	qdb := models.DB.Preload("FromUser").Preload("ToUser")
	if q.PeerID == 0 {
		qdb = qdb.Where("from_user_id = 0 AND to_user_id = ?", q.UserID)
	} else {
		qdb = qdb.Where(
			"(from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)",
			q.UserID, q.PeerID, q.PeerID, q.UserID,
		)
	}
	if q.Before > 0 {
		qdb = qdb.Where("id < ?", q.Before)
	}

	var list []models.PrivateMessage
	// 先按 id desc 取一页，再反转为正序（聊天从旧到新）
	err := qdb.Order("id desc").Limit(q.Size).Find(&list).Error
	if err != nil {
		return nil, 0, err
	}
	for i, j := 0, len(list)-1; i < j; i, j = i+1, j-1 {
		list[i], list[j] = list[j], list[i]
	}
	return list, total, nil
}

// MarkConversationRead 将会话内未读标为已读
func (s *MessageService) MarkConversationRead(userID, peerID uint) error {
	db := models.DB.Model(&models.PrivateMessage{}).
		Where("to_user_id = ? AND is_read = ?", userID, false)
	if peerID == 0 {
		db = db.Where("from_user_id = 0")
	} else {
		db = db.Where("from_user_id = ?", peerID)
	}
	return db.Update("is_read", true).Error
}

// FormatRejectContent 拒帖私信正文
func FormatRejectContent(postTitle string, postID uint, reason string) string {
	return fmt.Sprintf(
		"你的帖子《%s》（#%d）未通过审核。\n\n原因：\n%s\n\n如有疑问，可回复本私信联系管理员。",
		postTitle, postID, strings.TrimSpace(reason),
	)
}

// FormatCommentRejectContent 拒评论私信正文
func FormatCommentRejectContent(postTitle string, postID uint, floor int, reason string) string {
	return fmt.Sprintf(
		"你在帖子《%s》（#%d）中的评论（#%d 楼）未通过审核。\n\n原因：\n%s\n\n如有疑问，可回复本私信联系管理员。",
		postTitle, postID, floor, strings.TrimSpace(reason),
	)
}

package service

import (
	"fmt"
	"strings"
	"unicode/utf8"

	"git.iioio.com/freefire/jiang13-forum/model"
)

// NotifyService 站内消息 + 邮件提醒编排
type NotifyService struct {
	messages *MessageService
	mail     *MailService
	settings *ForumSettingsService
}

func NewNotifyService(messages *MessageService, mail *MailService, settings *ForumSettingsService) *NotifyService {
	return &NotifyService{messages: messages, mail: mail, settings: settings}
}

// 后台执行通知，不阻塞 HTTP 响应；panic 仅记日志
func (s *NotifyService) goNotify(fn func()) {
	if s == nil || fn == nil {
		return
	}
	go func() {
		defer func() {
			if r := recover(); r != nil {
				fmt.Printf("notify: 后台任务异常: %v\n", r)
			}
		}()
		fn()
	}()
}

// AsyncNotifyCommentPublished 异步：评论公开后通知被回复者或楼主
func (s *NotifyService) AsyncNotifyCommentPublished(comment *model.Comment) {
	if s == nil || comment == nil {
		return
	}
	cp := *comment
	s.goNotify(func() { s.NotifyCommentPublished(&cp) })
}

// AsyncNotifyCommentMentions 异步：评论公开后通知被 @ 的用户
func (s *NotifyService) AsyncNotifyCommentMentions(comment *model.Comment) {
	if s == nil || comment == nil {
		return
	}
	cp := *comment
	s.goNotify(func() { s.NotifyCommentMentions(&cp) })
}

// AsyncNotifyPendingPost 异步：待审帖通知管理员
func (s *NotifyService) AsyncNotifyPendingPost(post *model.Post) {
	if s == nil || post == nil {
		return
	}
	cp := *post
	s.goNotify(func() { s.NotifyPendingPost(&cp) })
}

// AsyncNotifyPendingComment 异步：待审评论通知管理员
func (s *NotifyService) AsyncNotifyPendingComment(comment *model.Comment) {
	if s == nil || comment == nil {
		return
	}
	cp := *comment
	s.goNotify(func() { s.NotifyPendingComment(&cp) })
}

// NotifyCommentPublished 评论公开后通知被回复者或楼主
func (s *NotifyService) NotifyCommentPublished(comment *model.Comment) {
	if s == nil || comment == nil || comment.Status != model.ContentStatusPublished {
		return
	}

	post, err := s.loadPost(comment.PostID)
	if err != nil {
		return
	}

	toUserID, err := s.resolveReplyRecipient(comment, post)
	if err != nil || toUserID == 0 || toUserID == comment.UserID {
		return
	}

	authorName := s.commentAuthorName(comment)
	title := post.Title
	if title == "" {
		title = "未知帖子"
	}
	displayFloor := s.resolveDisplayFloor(comment)
	isNested := comment.ReplyTo != nil && *comment.ReplyTo > 0
	subject := "收到新回复"
	content := FormatReplyContent(authorName, title, displayFloor, isNested)
	pid := comment.PostID
	cid := comment.ID
	floor := comment.Floor
	_, _ = s.messages.SendSystemWithRefs(toUserID, subject, content, model.MessageKindReply, SystemNotifyRefs{
		PostID:    &pid,
		CommentID: &cid,
		Floor:     &floor,
	})

	s.sendReplyMail(toUserID, authorName, title, comment.PostID, comment.Floor, displayFloor, isNested, comment.Content)
}

// NotifyCommentMentions 评论公开后通知被 @提及的用户（跳过已收到回复通知的人）
func (s *NotifyService) NotifyCommentMentions(comment *model.Comment) {
	if s == nil || comment == nil || comment.Status != model.ContentStatusPublished {
		return
	}
	names := ExtractMentionNames(comment.Content)
	ids := ResolveMentionUserIDs(names, comment.UserID)
	if len(ids) == 0 {
		return
	}

	post, err := s.loadPost(comment.PostID)
	if err != nil {
		return
	}
	// 已作为回复对象收到通知的用户不再重复发 mention
	replyTo, _ := s.resolveReplyRecipient(comment, post)
	authorName := s.commentAuthorName(comment)
	title := post.Title
	if title == "" {
		title = "未知帖子"
	}
	displayFloor := s.resolveDisplayFloor(comment)
	pid := comment.PostID
	cid := comment.ID
	floor := comment.Floor
	subject := "有人 @了你"
	content := FormatMentionContent(authorName, title, displayFloor)

	for _, uid := range ids {
		if uid == 0 || uid == comment.UserID || uid == replyTo {
			continue
		}
		_, _ = s.messages.SendSystemWithRefs(uid, subject, content, model.MessageKindMention, SystemNotifyRefs{
			PostID:    &pid,
			CommentID: &cid,
			Floor:     &floor,
		})
	}
}

// NotifyPendingPost 新帖进入待审时通知全部管理员
func (s *NotifyService) NotifyPendingPost(post *model.Post) {
	if s == nil || post == nil || post.Status != model.ContentStatusPending {
		return
	}
	title := strings.TrimSpace(post.Title)
	if title == "" {
		title = "无标题"
	}
	authorName := s.userDisplayName(post.UserID)
	subject := "新的待审核帖子"
	content := FormatPendingPostContent(authorName, title, post.ID)
	pid := post.ID
	s.notifyAdmins(subject, content, model.MessageKindModeration, SystemNotifyRefs{PostID: &pid}, func(siteName, baseURL string) (string, string, string) {
		adminPath := fmt.Sprintf("/admin/posts?id=%d", post.ID)
		return BuildModerationMail(siteName, "帖子", authorName, title, post.ID, 0, false, AbsoluteURL(baseURL, adminPath))
	})
}

// NotifyPendingComment 新评论进入待审时通知全部管理员
func (s *NotifyService) NotifyPendingComment(comment *model.Comment) {
	if s == nil || comment == nil || comment.Status != model.ContentStatusPending {
		return
	}
	post, err := s.loadPost(comment.PostID)
	if err != nil {
		return
	}
	title := strings.TrimSpace(post.Title)
	if title == "" {
		title = "未知帖子"
	}
	authorName := s.commentAuthorName(comment)
	subject := "新的待审核评论"
	displayFloor := s.resolveDisplayFloor(comment)
	isNested := comment.ReplyTo != nil && *comment.ReplyTo > 0
	content := FormatPendingCommentContent(authorName, title, displayFloor, isNested)
	pid := comment.PostID
	cid := comment.ID
	floor := comment.Floor
	adminPath := fmt.Sprintf("/admin/comments?id=%d", comment.ID)
	s.notifyAdmins(subject, content, model.MessageKindModeration, SystemNotifyRefs{
		PostID:    &pid,
		CommentID: &cid,
		Floor:     &floor,
	}, func(siteName, baseURL string) (string, string, string) {
		return BuildModerationMail(siteName, "评论", authorName, title, comment.PostID, displayFloor, isNested, AbsoluteURL(baseURL, adminPath))
	})
}

func (s *NotifyService) notifyAdmins(
	subject, content, kind string,
	refs SystemNotifyRefs,
	buildMail func(siteName, baseURL string) (subj, text, html string),
) {
	admins, err := s.listAdmins()
	if err != nil || len(admins) == 0 {
		return
	}

	seenEmail := make(map[string]struct{})
	siteName := s.siteName()
	baseURL := s.settings.SitePublicBaseURL("")
	mailSubj, mailText, mailHTML := "", "", ""
	if s.mail != nil && s.settings.MailReady() {
		mailSubj, mailText, mailHTML = buildMail(siteName, baseURL)
	}

	for _, admin := range admins {
		_, _ = s.messages.SendSystemWithRefs(admin.ID, subject, content, kind, refs)
		email := strings.TrimSpace(admin.Email)
		if email == "" || mailSubj == "" {
			continue
		}
		key := strings.ToLower(email)
		if _, ok := seenEmail[key]; ok {
			continue
		}
		seenEmail[key] = struct{}{}
		_ = s.mail.SendHTML(email, mailSubj, mailText, mailHTML)
	}
}

func (s *NotifyService) sendReplyMail(toUserID uint, authorName, postTitle string, postID uint, ownFloor, displayFloor int, isNested bool, rawContent string) {
	if s.mail == nil || !s.settings.MailReady() {
		return
	}
	var user model.User
	if err := model.DB.Select("id", "email", "nickname", "username").First(&user, toUserID).Error; err != nil {
		return
	}
	email := strings.TrimSpace(user.Email)
	if email == "" {
		return
	}
	siteName := s.siteName()
	baseURL := s.settings.SitePublicBaseURL("")
	postPath := s.settings.Permalink().PostPath(postID)
	link := AbsoluteURL(baseURL, postPath)
	// 直达评论自身楼层（嵌套回复也有独立 floor）
	if ownFloor > 0 {
		link = fmt.Sprintf("%s#floor-%d", link, ownFloor)
	}
	excerpt := truncateNotifyExcerpt(rawContent, 120)
	subj, text, html := BuildReplyMail(siteName, authorName, postTitle, displayFloor, isNested, excerpt, link)
	_ = s.mail.SendHTML(email, subj, text, html)
}

func (s *NotifyService) resolveReplyRecipient(comment *model.Comment, post *model.Post) (uint, error) {
	if comment.ReplyTo != nil && *comment.ReplyTo > 0 {
		var target model.Comment
		if err := model.DB.Select("id", "user_id", "post_id").
			Where("id = ? AND post_id = ?", *comment.ReplyTo, comment.PostID).
			First(&target).Error; err != nil {
			return 0, err
		}
		if target.UserID > 0 {
			return target.UserID, nil
		}
		// 游客评论无用户账号，回退到楼主
	}
	return post.UserID, nil
}

// resolveDisplayFloor 解析页面可见的顶层楼号（子回复沿 reply_to 上溯）
func (s *NotifyService) resolveDisplayFloor(comment *model.Comment) int {
	if comment == nil {
		return 0
	}
	if comment.ReplyTo == nil || *comment.ReplyTo == 0 {
		return comment.Floor
	}

	curID := *comment.ReplyTo
	seen := make(map[uint]struct{}, 8)
	for i := 0; i < 64; i++ {
		if _, ok := seen[curID]; ok {
			break
		}
		seen[curID] = struct{}{}
		var ancestor model.Comment
		if err := model.DB.Select("id", "floor", "reply_to").
			Where("id = ? AND post_id = ?", curID, comment.PostID).
			First(&ancestor).Error; err != nil {
			return comment.Floor
		}
		if ancestor.ReplyTo == nil || *ancestor.ReplyTo == 0 {
			return ancestor.Floor
		}
		curID = *ancestor.ReplyTo
	}
	return comment.Floor
}

func (s *NotifyService) loadPost(postID uint) (*model.Post, error) {
	var post model.Post
	if err := model.DB.Select("id", "user_id", "title", "status").First(&post, postID).Error; err != nil {
		return nil, err
	}
	return &post, nil
}

func (s *NotifyService) listAdmins() ([]model.User, error) {
	var admins []model.User
	err := model.DB.Select("id", "email", "nickname", "username").
		Where("role = ? AND banned = ?", model.RoleAdmin, false).
		Find(&admins).Error
	return admins, err
}

func (s *NotifyService) siteName() string {
	name := strings.TrimSpace(s.settings.SiteBranding().Name)
	if name == "" {
		return "姜十三论坛"
	}
	return name
}

func (s *NotifyService) commentAuthorName(comment *model.Comment) string {
	if comment.UserID > 0 {
		if comment.User.ID == comment.UserID {
			if n := DisplayName(&comment.User); n != "" {
				return n
			}
		}
		return s.userDisplayName(comment.UserID)
	}
	if nick := strings.TrimSpace(comment.GuestNick); nick != "" {
		return nick
	}
	return "游客"
}

func (s *NotifyService) userDisplayName(userID uint) string {
	if userID == 0 {
		return "用户"
	}
	var u model.User
	if err := model.DB.Select("id", "nickname", "username").First(&u, userID).Error; err != nil {
		return fmt.Sprintf("用户 #%d", userID)
	}
	if n := DisplayName(&u); n != "" {
		return n
	}
	return fmt.Sprintf("用户 #%d", userID)
}

// FormatReplyContent 回复站内私信正文（floor 为可见顶层楼号）
func FormatReplyContent(authorName, postTitle string, displayFloor int, isNested bool) string {
	if isNested {
		return fmt.Sprintf("%s 在《%s》#%d 楼下回复了你。", authorName, postTitle, displayFloor)
	}
	return fmt.Sprintf("%s 在《%s》发表了 #%d 楼。", authorName, postTitle, displayFloor)
}

// FormatMentionContent @提及站内通知正文
func FormatMentionContent(authorName, postTitle string, displayFloor int) string {
	return fmt.Sprintf("%s 在《%s》#%d 楼中提到了你。", authorName, postTitle, displayFloor)
}

// FormatPendingPostContent 待审帖站内私信正文
func FormatPendingPostContent(authorName, postTitle string, postID uint) string {
	return fmt.Sprintf(
		"用户 %s 提交了待审核帖子《%s》（#%d），请前往管理后台处理。",
		authorName, postTitle, postID,
	)
}

// FormatPendingCommentContent 待审评论站内私信正文（floor 为可见顶层楼号）
func FormatPendingCommentContent(authorName, postTitle string, displayFloor int, isNested bool) string {
	if isNested {
		return fmt.Sprintf(
			"用户 %s 在《%s》#%d 楼下提交了待审核回复，请前往管理后台处理。",
			authorName, postTitle, displayFloor,
		)
	}
	return fmt.Sprintf(
		"用户 %s 在《%s》提交了待审核 #%d 楼评论，请前往管理后台处理。",
		authorName, postTitle, displayFloor,
	)
}

func truncateNotifyExcerpt(raw string, maxRunes int) string {
	plain := strings.TrimSpace(StripHTMLForSearch(raw))
	plain = strings.Join(strings.Fields(plain), " ")
	if plain == "" {
		return ""
	}
	if maxRunes <= 0 || utf8.RuneCountInString(plain) <= maxRunes {
		return plain
	}
	runes := []rune(plain)
	return string(runes[:maxRunes]) + "…"
}

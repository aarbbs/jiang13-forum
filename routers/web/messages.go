package web

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

type msgConvRow struct {
	PeerID       uint
	PeerName     string
	IsSystem     bool
	Preview      string
	Unread       int64
	UpdatedLabel string
}

type messagesListData struct {
	PageChrome
	Conversations []msgConvRow
	UnreadTotal   int64
	UnreadDM      int64
	UnreadNotify  int64
	Page          int
	PrevPage      int
	NextPage      int
	HasPrev       bool
	HasMore       bool
}

type msgBubble struct {
	ID           uint
	FromSelf     bool
	IsSystem     bool
	Subject      string
	Content      string
	CreatedLabel string
	Kind         string
}

type messagesThreadData struct {
	PageChrome
	PeerID      uint
	PeerName    string
	IsSystem    bool
	CanReply    bool
	Messages    []msgBubble
	OlderBefore uint
	HasOlder    bool
	Draft       string
	KindFilter  string
	KindLinks   []msgKindLink
}

type msgKindLink struct {
	Kind  string
	Label string
	URL   string
	Active bool
}

// MessagesList GET /messages
func (d Deps) MessagesList(c *gin.Context) {
	ctx := d.ctx(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	size := 30
	list, total, err := d.Message.ListConversations(services.ConversationListQuery{
		UserID: ctx.UserID(), Page: page, Size: size,
	})
	if err != nil {
		chrome := d.chrome(ctx, "私信 · "+d.Settings.SiteBranding().Name, "", "")
		chrome.Error = err.Error()
		ctx.HTML(http.StatusOK, "messages/list", messagesListData{PageChrome: chrome})
		return
	}
	rows := make([]msgConvRow, 0, len(list))
	for _, cv := range list {
		name := "系统通知"
		if !cv.IsSystem {
			name = "用户"
			if cv.PeerUser != nil {
				name = displayName(cv.PeerUser)
			}
		}
		preview := ""
		if cv.LastMessage != nil {
			preview = strings.TrimSpace(cv.LastMessage.Subject)
			if preview == "" {
				preview = truncateRunes(cv.LastMessage.Content, 48)
			}
		}
		rows = append(rows, msgConvRow{
			PeerID: cv.PeerUserID, PeerName: name, IsSystem: cv.IsSystem,
			Preview: preview, Unread: cv.UnreadCount,
			UpdatedLabel: formatTime(cv.UpdatedAt),
		})
	}
	totalUnread, dm, notify, _ := d.Message.UnreadCounts(ctx.UserID())
	chrome := d.chrome(ctx, "私信 · "+d.Settings.SiteBranding().Name, "", "")
	hasMore := int64(page*size) < total
	ctx.HTML(http.StatusOK, "messages/list", messagesListData{
		PageChrome: chrome, Conversations: rows,
		UnreadTotal: totalUnread, UnreadDM: dm, UnreadNotify: notify,
		Page: page, PrevPage: page - 1, NextPage: page + 1,
		HasPrev: page > 1, HasMore: hasMore,
	})
}

// MessagesThread GET /messages/with/:peerId
func (d Deps) MessagesThread(c *gin.Context) {
	peerID, err := parsePeerID(c.Param("peerId"))
	if err != nil {
		ctx := d.ctx(c)
		ctx.SetFlash("无效会话")
		ctx.Redirect("/messages")
		return
	}
	d.renderMessagesThread(c, peerID, "", c.Query("before"), "")
}

func (d Deps) renderMessagesThread(c *gin.Context, peerID uint, errMsg, beforeRaw, draft string) {
	ctx := d.ctx(c)
	uid := ctx.UserID()
	before, _ := strconv.ParseUint(beforeRaw, 10, 64)
	size := 40
	kindFilter := ""
	if peerID == 0 {
		kindFilter = normalizeNotifyKind(c.Query("kind"))
	}

	var list []models.PrivateMessage
	var total int64
	var err error
	if peerID == 0 && kindFilter != "" && kindFilter != "all" {
		list, total, err = d.Message.ListNotifications(uid, 1, size, kindFilter)
		_ = before // kind 筛选暂不分页 before
	} else {
		list, total, err = d.Message.ListConversationMessages(services.ConversationMessagesQuery{
			UserID: uid, PeerID: peerID, Page: 1, Size: size, Before: uint(before),
		})
	}
	if err != nil {
		ctx.SetFlash(err.Error())
		ctx.Redirect("/messages")
		return
	}
	if before == 0 {
		_ = d.Message.MarkConversationRead(uid, peerID)
	}

	peerName := "系统通知"
	canReply := peerID > 0
	if peerID > 0 {
		if u, e := d.User.GetByID(peerID); e == nil {
			peerName = displayName(u)
		} else {
			peerName = fmt.Sprintf("用户 #%d", peerID)
		}
	}

	bubbles := make([]msgBubble, 0, len(list))
	var oldest uint
	for _, m := range list {
		if oldest == 0 || m.ID < oldest {
			oldest = m.ID
		}
		bubbles = append(bubbles, msgBubble{
			ID: m.ID, FromSelf: m.FromUserID == uid && m.FromUserID > 0,
			IsSystem: m.FromUserID == 0, Subject: m.Subject, Content: m.Content,
			CreatedLabel: formatTime(m.CreatedAt), Kind: m.Kind,
		})
	}
	hasOlder := false
	if peerID != 0 || kindFilter == "" || kindFilter == "all" {
		if oldest > 0 {
			if before == 0 {
				hasOlder = total > int64(len(list))
			} else {
				hasOlder = len(list) >= size
			}
		}
	} else {
		hasOlder = false
	}

	chrome := d.chrome(ctx, peerName+" · 私信 · "+d.Settings.SiteBranding().Name, "", "")
	chrome.Error = errMsg
	data := messagesThreadData{
		PageChrome: chrome, PeerID: peerID, PeerName: peerName,
		IsSystem: peerID == 0, CanReply: canReply, Messages: bubbles,
		OlderBefore: oldest, HasOlder: hasOlder, Draft: draft,
	}
	if peerID == 0 {
		data.KindFilter = kindFilter
		data.KindLinks = notifyKindLinks(kindFilter)
	}
	ctx.HTML(http.StatusOK, "messages/thread", data)
}

func normalizeNotifyKind(raw string) string {
	k := strings.TrimSpace(strings.ToLower(raw))
	switch k {
	case "", "all":
		return "all"
	case models.MessageKindReply, models.MessageKindMention, models.MessageKindSystem,
		models.MessageKindReject, models.MessageKindReportResult, models.MessageKindModeration:
		return k
	default:
		return "all"
	}
}

func notifyKindLinks(active string) []msgKindLink {
	if active == "" {
		active = "all"
	}
	items := []struct{ kind, label string }{
		{"all", "全部"},
		{models.MessageKindReply, "回复"},
		{models.MessageKindMention, "提及"},
		{models.MessageKindSystem, "系统"},
		{models.MessageKindReject, "拒绝"},
		{models.MessageKindReportResult, "举报结果"},
		{models.MessageKindModeration, "审核"},
	}
	out := make([]msgKindLink, 0, len(items))
	for _, it := range items {
		url := "/messages/with/0"
		if it.kind != "all" {
			url += "?kind=" + it.kind
		}
		out = append(out, msgKindLink{
			Kind: it.kind, Label: it.label, URL: url, Active: active == it.kind,
		})
	}
	return out
}

// MessagesSend POST /messages/with/:peerId
func (d Deps) MessagesSend(c *gin.Context) {
	ctx := d.ctx(c)
	peerID, err := parsePeerID(c.Param("peerId"))
	if err != nil || peerID == 0 {
		ctx.SetFlash("无法向系统通知会话发送私信")
		ctx.Redirect("/messages")
		return
	}
	content := strings.TrimSpace(c.PostForm("content"))
	if !ctx.CheckCSRF() {
		d.renderMessagesThread(c, peerID, "无效请求，请重试", "", content)
		return
	}
	if d.Limiter != nil && !d.Limiter.Allow("message", fmt.Sprintf("%d", ctx.UserID())) {
		d.renderMessagesThread(c, peerID, "发送过于频繁，请稍后再试", "", content)
		return
	}
	if ctx.Doer != nil && ctx.Doer.Banned {
		d.renderMessagesThread(c, peerID, "账号已被禁言，无法发私信", "", content)
		return
	}
	_, err = d.Message.Send(services.MessageSendInput{
		FromUserID: ctx.UserID(),
		ToUserID:   peerID,
		Content:    content,
	})
	if err != nil {
		d.renderMessagesThread(c, peerID, err.Error(), "", content)
		return
	}
	ctx.SetFlash("已发送")
	ctx.Redirect(fmt.Sprintf("/messages/with/%d", peerID))
}

// MessagesReadAll POST /messages/read-all
func (d Deps) MessagesReadAll(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		ctx.SetFlash("无效请求，请重试")
		ctx.Redirect("/messages")
		return
	}
	_ = d.Message.MarkAllRead(ctx.UserID())
	ctx.SetFlash("已全部标为已读")
	ctx.Redirect("/messages")
}

func parsePeerID(raw string) (uint, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "system" {
		return 0, nil
	}
	id, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0, err
	}
	return uint(id), nil
}

func truncateRunes(s string, max int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) <= max {
		return string(r)
	}
	return string(r[:max]) + "…"
}

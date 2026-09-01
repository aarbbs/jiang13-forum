package service

import (
	"math"
	"strings"
	"time"

	"git.iioio.com/freefire/jiang13-forum/model"
)

// looksLikeModerationComment 判断待审通知是否指向评论（含嵌套回复）
func looksLikeModerationComment(subject, content string) bool {
	if strings.Contains(subject, "评论") || strings.Contains(content, "评论") {
		return true
	}
	return strings.Contains(content, "回复") || strings.Contains(content, "楼下")
}

// isNestedModerationContent 嵌套回复待审（正文为「#N 楼下…」）
func isNestedModerationContent(content string) bool {
	return strings.Contains(content, "楼下")
}

// resolveModerationCommentRef 为历史待审评论通知推断目标评论 ID 与自身楼号
func resolveModerationCommentRef(postID uint, content string, notifyAt time.Time) (commentID uint, floor int) {
	if postID == 0 || model.DB == nil {
		return 0, 0
	}
	displayFloor := parseNotifyFloor(content)
	if displayFloor <= 0 {
		return 0, 0
	}

	if isNestedModerationContent(content) {
		var parent struct {
			ID uint
		}
		err := model.DB.Unscoped().Model(&model.Comment{}).
			Select("id").
			Where("post_id = ? AND floor = ?", postID, displayFloor).
			First(&parent).Error
		if err != nil || parent.ID == 0 {
			return 0, 0
		}

		type childRow struct {
			ID        uint
			Floor     int
			CreatedAt time.Time
		}
		var children []childRow
		_ = model.DB.Unscoped().Model(&model.Comment{}).
			Select("id", "floor", "created_at").
			Where("post_id = ? AND reply_to = ?", postID, parent.ID).
			Find(&children).Error
		if len(children) == 0 {
			return 0, 0
		}
		if len(children) == 1 {
			return children[0].ID, children[0].Floor
		}
		best := children[0]
		bestDiff := math.MaxFloat64
		for _, c := range children {
			diff := math.Abs(float64(c.CreatedAt.Sub(notifyAt)))
			if diff < bestDiff {
				bestDiff = diff
				best = c
			}
		}
		// 通知与评论创建时间相差超过 7 天则放弃，避免误配旧回复
		if bestDiff > float64(7*24*time.Hour) {
			return 0, 0
		}
		return best.ID, best.Floor
	}

	var row struct {
		ID    uint
		Floor int
	}
	err := model.DB.Unscoped().Model(&model.Comment{}).
		Select("id", "floor").
		Where("post_id = ? AND floor = ?", postID, displayFloor).
		First(&row).Error
	if err != nil || row.ID == 0 {
		return 0, 0
	}
	return row.ID, row.Floor
}

// BackfillModerationNotifyRefs 为历史 moderation 通知补写 related_comment_id / related_floor
func BackfillModerationNotifyRefs() error {
	if model.DB == nil {
		return nil
	}
	var rows []model.PrivateMessage
	err := model.DB.Where("kind = ? AND (related_comment_id IS NULL OR related_comment_id = 0)", model.MessageKindModeration).
		Find(&rows).Error
	if err != nil {
		return err
	}
	for _, m := range rows {
		if m.RelatedPostID == nil || *m.RelatedPostID == 0 {
			continue
		}
		if !looksLikeModerationComment(m.Subject, m.Content) {
			continue
		}
		cid, fl := resolveModerationCommentRef(*m.RelatedPostID, m.Content, m.CreatedAt)
		if cid == 0 {
			continue
		}
		floor := fl
		updates := map[string]interface{}{
			"related_comment_id": cid,
			"related_floor":      floor,
		}
		_ = model.DB.Model(&model.PrivateMessage{}).Where("id = ?", m.ID).Updates(updates).Error
	}
	return nil
}

// enrichModerationCommentIDs 为无 related_comment_id 的评论类待审通知解析评论 ID
func enrichModerationCommentIDs(list []model.PrivateMessage) map[int]uint {
	out := make(map[int]uint)
	for i := range list {
		m := &list[i]
		if m.Kind != model.MessageKindModeration {
			continue
		}
		if m.RelatedCommentID != nil && *m.RelatedCommentID > 0 {
			continue
		}
		if m.RelatedPostID == nil || *m.RelatedPostID == 0 {
			continue
		}
		if !looksLikeModerationComment(m.Subject, m.Content) {
			continue
		}
		// 嵌套回复优先按子评论匹配，避免 displayFloor 查到父评论状态
		if isNestedModerationContent(m.Content) {
			cid, _ := resolveModerationCommentRef(*m.RelatedPostID, m.Content, m.CreatedAt)
			if cid > 0 {
				out[i] = cid
			}
			continue
		}
		// 顶层评论：有 related_floor 时按楼号查 ID
		if m.RelatedFloor != nil && *m.RelatedFloor > 0 {
			var row struct{ ID uint }
			if err := model.DB.Unscoped().Model(&model.Comment{}).
				Select("id").
				Where("post_id = ? AND floor = ?", *m.RelatedPostID, *m.RelatedFloor).
				First(&row).Error; err == nil && row.ID > 0 {
				out[i] = row.ID
			}
			continue
		}
		cid, _ := resolveModerationCommentRef(*m.RelatedPostID, m.Content, m.CreatedAt)
		if cid > 0 {
			out[i] = cid
		}
	}
	return out
}

package service

import (
	"errors"

	"git.iioio.com/freefire/jiang13-forum/model"
	"gorm.io/gorm"
)

var (
	ErrBountyNotOpen       = errors.New("悬赏已结束或已退回")
	ErrBountySelfAward     = errors.New("不能采纳自己的回复")
	ErrBountyInvalidPoint  = errors.New("悬赏积分至少为 1")
	ErrBountyRefundBlocked = errors.New("已有用户回复，无法自行取消悬赏，请采纳优质回复或联系管理员")
)

const bountyRefundBlockReason = "已有用户回复，无法自行取消悬赏，请采纳优质回复或联系管理员"

// CountEligibleBountyReplies 统计他人已发布的有效回复数（不含楼主）
func CountEligibleBountyReplies(db *gorm.DB, postID, authorID uint) (int64, error) {
	if db == nil {
		db = model.DB
	}
	var n int64
	err := db.Model(&model.Comment{}).
		Where("post_id = ? AND status = ? AND user_id != ?", postID, model.ContentStatusPublished, authorID).
		Count(&n).Error
	return n, err
}

// CanRefundBounty 当前查看者是否可取消悬赏（管理员始终可强制取消）
func CanRefundBounty(post *model.Post, viewerIsAdmin bool) (bool, string) {
	if post == nil || post.PostType != model.PostTypeBounty {
		return false, ""
	}
	if post.BountyStatus != model.BountyStatusOpen || post.BountyPoints < 1 {
		return false, ""
	}
	if viewerIsAdmin {
		return true, ""
	}
	n, err := CountEligibleBountyReplies(model.DB, post.ID, post.UserID)
	if err != nil {
		return false, ""
	}
	if n > 0 {
		return false, bountyRefundBlockReason
	}
	return true, ""
}

// EscrowBounty 发帖时托管悬赏积分
func EscrowBounty(tx *gorm.DB, userID, postID uint, points int) error {
	if points < 1 {
		return ErrBountyInvalidPoint
	}
	_, err := AdjustPointsTx(tx, userID, -points, model.PointReasonBountyEscrow, "post", postID, "发布悬赏帖")
	return err
}

// AwardBounty 采纳评论并发放悬赏
func AwardBounty(postID, operatorID uint, isAdmin bool, commentID uint) error {
	var post model.Post
	if err := model.DB.First(&post, postID).Error; err != nil {
		return ErrPostNotFound
	}
	if post.PostType != model.PostTypeBounty {
		return errors.New("非悬赏帖")
	}
	if !isAdmin && post.UserID != operatorID {
		return ErrPermissionDenied
	}
	if post.BountyStatus != model.BountyStatusOpen || post.BountyPoints < 1 {
		return ErrBountyNotOpen
	}
	var comment model.Comment
	if err := model.DB.First(&comment, commentID).Error; err != nil {
		return errors.New("评论不存在")
	}
	if comment.PostID != postID || comment.Status != model.ContentStatusPublished {
		return errors.New("评论无效")
	}
	if comment.UserID == post.UserID {
		return ErrBountySelfAward
	}
	points := post.BountyPoints
	return model.DB.Transaction(func(tx *gorm.DB) error {
		// 先以状态为条件抢占悬赏，防止并发采纳/退回重复发放积分
		if err := transitionBountyTx(tx, postID, points, map[string]interface{}{
			"bounty_status":     model.BountyStatusAwarded,
			"bounty_comment_id": commentID,
		}); err != nil {
			return err
		}
		_, err := AdjustPointsTx(tx, comment.UserID, points, model.PointReasonBountyAward, "post", postID, "悬赏采纳")
		return err
	})
}

// RefundBounty 取消悬赏并退回积分
func RefundBounty(postID, operatorID uint, isAdmin bool) error {
	var post model.Post
	if err := model.DB.First(&post, postID).Error; err != nil {
		return ErrPostNotFound
	}
	if post.PostType != model.PostTypeBounty {
		return errors.New("非悬赏帖")
	}
	if !isAdmin && post.UserID != operatorID {
		return ErrPermissionDenied
	}
	if post.BountyStatus != model.BountyStatusOpen || post.BountyPoints < 1 {
		return ErrBountyNotOpen
	}
	if !isAdmin {
		n, err := CountEligibleBountyReplies(model.DB, post.ID, post.UserID)
		if err != nil {
			return err
		}
		if n > 0 {
			return ErrBountyRefundBlocked
		}
	}
	points := post.BountyPoints
	return model.DB.Transaction(func(tx *gorm.DB) error {
		// 先以状态为条件抢占悬赏，防止并发采纳/退回重复发放积分
		if err := transitionBountyTx(tx, postID, points, map[string]interface{}{
			"bounty_status": model.BountyStatusRefunded,
			"bounty_points": 0,
		}); err != nil {
			return err
		}
		_, err := AdjustPointsTx(tx, post.UserID, points, model.PointReasonBountyRefund, "post", postID, "悬赏退回")
		return err
	})
}

// RefundBountyIfOpen 删帖时自动退回未采纳悬赏
func RefundBountyIfOpen(tx *gorm.DB, post *model.Post) error {
	if post == nil || post.PostType != model.PostTypeBounty {
		return nil
	}
	if post.BountyStatus != model.BountyStatusOpen || post.BountyPoints < 1 {
		return nil
	}
	points := post.BountyPoints
	err := transitionBountyTx(tx, post.ID, points, map[string]interface{}{
		"bounty_status": model.BountyStatusRefunded,
		"bounty_points": 0,
	})
	if errors.Is(err, ErrBountyNotOpen) {
		// 已被并发采纳或退回，无需再退
		return nil
	}
	if err != nil {
		return err
	}
	_, err = AdjustPointsTx(tx, post.UserID, points, model.PointReasonBountyRefund, "post", post.ID, "删帖退回悬赏")
	return err
}

// transitionBountyTx 仅当悬赏仍为 open 且积分未变时更新状态；
// 未命中任何行说明已被其他请求处理，返回 ErrBountyNotOpen
func transitionBountyTx(tx *gorm.DB, postID uint, points int, updates map[string]interface{}) error {
	res := tx.Model(&model.Post{}).
		Where("id = ? AND bounty_status = ? AND bounty_points = ?", postID, model.BountyStatusOpen, points).
		Updates(updates)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected != 1 {
		return ErrBountyNotOpen
	}
	return nil
}

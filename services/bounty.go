package services

import (
	"errors"

	"git.iioio.com/freefire/jiang13-forum/models"
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
		db = models.DB
	}
	var n int64
	err := db.Model(&models.Comment{}).
		Where("post_id = ? AND status = ? AND user_id != ?", postID, models.ContentStatusPublished, authorID).
		Count(&n).Error
	return n, err
}

// CanRefundBounty 当前查看者是否可取消悬赏（管理员始终可强制取消）
func CanRefundBounty(post *models.Post, viewerIsAdmin bool) (bool, string) {
	if post == nil || post.PostType != models.PostTypeBounty {
		return false, ""
	}
	if post.BountyStatus != models.BountyStatusOpen || post.BountyPoints < 1 {
		return false, ""
	}
	if viewerIsAdmin {
		return true, ""
	}
	n, err := CountEligibleBountyReplies(models.DB, post.ID, post.UserID)
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
	_, err := AdjustPointsTx(tx, userID, -points, models.PointReasonBountyEscrow, "post", postID, "发布悬赏帖")
	return err
}

// AwardBounty 采纳评论并发放悬赏
func AwardBounty(postID, operatorID uint, isAdmin bool, commentID uint) error {
	var post models.Post
	if err := models.DB.First(&post, postID).Error; err != nil {
		return ErrPostNotFound
	}
	if post.PostType != models.PostTypeBounty {
		return errors.New("非悬赏帖")
	}
	if !isAdmin && post.UserID != operatorID {
		return ErrPermissionDenied
	}
	if post.BountyStatus != models.BountyStatusOpen || post.BountyPoints < 1 {
		return ErrBountyNotOpen
	}
	var comment models.Comment
	if err := models.DB.First(&comment, commentID).Error; err != nil {
		return errors.New("评论不存在")
	}
	if comment.PostID != postID || comment.Status != models.ContentStatusPublished {
		return errors.New("评论无效")
	}
	if comment.UserID == post.UserID {
		return ErrBountySelfAward
	}
	points := post.BountyPoints
	return models.DB.Transaction(func(tx *gorm.DB) error {
		if _, err := AdjustPointsTx(tx, comment.UserID, points, models.PointReasonBountyAward, "post", postID, "悬赏采纳"); err != nil {
			return err
		}
		return tx.Model(&post).Updates(map[string]interface{}{
			"bounty_status":      models.BountyStatusAwarded,
			"bounty_comment_id":  commentID,
		}).Error
	})
}

// RefundBounty 取消悬赏并退回积分
func RefundBounty(postID, operatorID uint, isAdmin bool) error {
	var post models.Post
	if err := models.DB.First(&post, postID).Error; err != nil {
		return ErrPostNotFound
	}
	if post.PostType != models.PostTypeBounty {
		return errors.New("非悬赏帖")
	}
	if !isAdmin && post.UserID != operatorID {
		return ErrPermissionDenied
	}
	if post.BountyStatus != models.BountyStatusOpen || post.BountyPoints < 1 {
		return ErrBountyNotOpen
	}
	if !isAdmin {
		n, err := CountEligibleBountyReplies(models.DB, post.ID, post.UserID)
		if err != nil {
			return err
		}
		if n > 0 {
			return ErrBountyRefundBlocked
		}
	}
	points := post.BountyPoints
	return models.DB.Transaction(func(tx *gorm.DB) error {
		if _, err := AdjustPointsTx(tx, post.UserID, points, models.PointReasonBountyRefund, "post", postID, "悬赏退回"); err != nil {
			return err
		}
		return tx.Model(&post).Updates(map[string]interface{}{
			"bounty_status": models.BountyStatusRefunded,
			"bounty_points": 0,
		}).Error
	})
}

// RefundBountyIfOpen 删帖时自动退回未采纳悬赏
func RefundBountyIfOpen(tx *gorm.DB, post *models.Post) error {
	if post == nil || post.PostType != models.PostTypeBounty {
		return nil
	}
	if post.BountyStatus != models.BountyStatusOpen || post.BountyPoints < 1 {
		return nil
	}
	points := post.BountyPoints
	if _, err := AdjustPointsTx(tx, post.UserID, points, models.PointReasonBountyRefund, "post", post.ID, "删帖退回悬赏"); err != nil {
		return err
	}
	return tx.Model(post).Updates(map[string]interface{}{
		"bounty_status": models.BountyStatusRefunded,
		"bounty_points": 0,
	}).Error
}

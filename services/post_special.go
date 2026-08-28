package services

import (
	"errors"
	"strconv"

	"git.iioio.com/freefire/jiang13-forum/models"
	"gorm.io/gorm"
)

// PostCreateExtras 特殊帖创建附加参数
type PostCreateExtras struct {
	PollOptionsJSON    string
	BountyPoints       int
	LotteryWinnerCount int
}

// FinalizeSpecialPostCreate 创建帖后初始化投票/悬赏/抽奖
func FinalizeSpecialPostCreate(post *models.Post, userID uint, extras PostCreateExtras) error {
	if post == nil {
		return errors.New("帖子不存在")
	}
	return models.DB.Transaction(func(tx *gorm.DB) error {
		switch post.PostType {
		case models.PostTypePoll:
			opts, multi, maxChoices, endsAt, err := ParsePollOptionsJSON(extras.PollOptionsJSON)
			if err != nil {
				return err
			}
			return CreatePollForPost(tx, post.ID, multi, maxChoices, endsAt, opts)
		case models.PostTypeBounty:
			if extras.BountyPoints < 1 {
				return ErrBountyInvalidPoint
			}
			if err := tx.Model(post).Updates(map[string]interface{}{
				"bounty_points": extras.BountyPoints,
				"bounty_status": models.BountyStatusOpen,
			}).Error; err != nil {
				return err
			}
			return EscrowBounty(tx, userID, post.ID, extras.BountyPoints)
		case models.PostTypeLottery:
			count := extras.LotteryWinnerCount
			if count < 1 {
				count = 1
			}
			if count > 20 {
				return errors.New("开奖人数最多 20")
			}
			return tx.Model(post).Updates(map[string]interface{}{
				"lottery_winner_count": count,
				"lottery_status":       models.PostLotteryStatusOpen,
			}).Error
		default:
			return nil
		}
	})
}

// ParsePostExtrasFromForm 从表单解析特殊帖参数
func ParsePostExtrasFromForm(pollJSON, bountyRaw, lotteryRaw string) PostCreateExtras {
	bounty, _ := strconv.Atoi(bountyRaw)
	lottery, _ := strconv.Atoi(lotteryRaw)
	return PostCreateExtras{
		PollOptionsJSON:    pollJSON,
		BountyPoints:       bounty,
		LotteryWinnerCount: lottery,
	}
}

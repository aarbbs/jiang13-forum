package services

import (
	"crypto/rand"
	"errors"
	"math/big"

	"git.iioio.com/freefire/jiang13-forum/models"
	"gorm.io/gorm"
)

var (
	ErrLotteryAlreadyDrawn = errors.New("已开奖")
	ErrLotteryNotEnough    = errors.New("参与人数不足")
)

// PostLotteryView 帖内抽奖视图
type PostLotteryView struct {
	WinnerCount   int                    `json:"winner_count"`
	Status        string                 `json:"status"`
	ParticipantCount int                 `json:"participant_count"`
	Winners       []PostLotteryWinnerView `json:"winners,omitempty"`
}

type PostLotteryWinnerView struct {
	UserID    uint   `json:"user_id"`
	Username  string `json:"username"`
	Nickname  string `json:"nickname"`
	CommentID uint   `json:"comment_id"`
}

// InitPostLottery 初始化抽奖帖
func InitPostLottery(postID uint, winnerCount int) error {
	if winnerCount < 1 || winnerCount > 20 {
		return errors.New("开奖人数需 1-20")
	}
	return models.DB.Model(&models.Post{}).Where("id = ?", postID).Updates(map[string]interface{}{
		"lottery_winner_count": winnerCount,
		"lottery_status":       models.PostLotteryStatusOpen,
	}).Error
}

// GetPostLotteryView 获取抽奖视图
func GetPostLotteryView(post *models.Post) (*PostLotteryView, error) {
	if post == nil || post.PostType != models.PostTypeLottery {
		return nil, nil
	}
	participants, err := lotteryParticipants(post.ID, post.UserID)
	if err != nil {
		return nil, err
	}
	view := &PostLotteryView{
		WinnerCount:      post.LotteryWinnerCount,
		Status:           post.LotteryStatus,
		ParticipantCount: len(participants),
	}
	if post.LotteryStatus == models.PostLotteryStatusDrawn {
		var winners []models.PostLotteryWinner
		models.DB.Preload("User").Where("post_id = ?", post.ID).Find(&winners)
		for _, w := range winners {
			view.Winners = append(view.Winners, PostLotteryWinnerView{
				UserID: w.UserID, Username: w.User.Username, Nickname: w.User.Nickname,
				CommentID: w.CommentID,
			})
		}
	}
	return view, nil
}

func lotteryParticipants(postID, authorID uint) ([]models.Comment, error) {
	var comments []models.Comment
	err := models.DB.Where("post_id = ? AND status = ? AND user_id <> ?", postID, models.ContentStatusPublished, authorID).
		Order("id ASC").Find(&comments).Error
	if err != nil {
		return nil, err
	}
	seen := map[uint]bool{}
	var unique []models.Comment
	for _, c := range comments {
		if seen[c.UserID] {
			continue
		}
		seen[c.UserID] = true
		unique = append(unique, c)
	}
	return unique, nil
}

// DrawPostLottery 开奖
func DrawPostLottery(postID, operatorID uint, isAdmin bool) (*PostLotteryView, error) {
	var post models.Post
	if err := models.DB.First(&post, postID).Error; err != nil {
		return nil, ErrPostNotFound
	}
	if post.PostType != models.PostTypeLottery {
		return nil, errors.New("非抽奖帖")
	}
	if !isAdmin && post.UserID != operatorID {
		return nil, ErrPermissionDenied
	}
	if post.LotteryStatus == models.PostLotteryStatusDrawn {
		return nil, ErrLotteryAlreadyDrawn
	}
	participants, err := lotteryParticipants(postID, post.UserID)
	if err != nil {
		return nil, err
	}
	need := post.LotteryWinnerCount
	if need < 1 {
		need = 1
	}
	if len(participants) < need {
		return nil, ErrLotteryNotEnough
	}
	picked := randomPickComments(participants, need)
	err = models.DB.Transaction(func(tx *gorm.DB) error {
		for _, c := range picked {
			w := models.PostLotteryWinner{PostID: postID, UserID: c.UserID, CommentID: c.ID}
			if err := tx.Create(&w).Error; err != nil {
				return err
			}
		}
		return tx.Model(&post).Update("lottery_status", models.PostLotteryStatusDrawn).Error
	})
	if err != nil {
		return nil, err
	}
	post.LotteryStatus = models.PostLotteryStatusDrawn
	return GetPostLotteryView(&post)
}

func randomPickComments(comments []models.Comment, n int) []models.Comment {
	pool := append([]models.Comment{}, comments...)
	out := make([]models.Comment, 0, n)
	for i := 0; i < n && len(pool) > 0; i++ {
		idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(pool))))
		if err != nil {
			idx = big.NewInt(0)
		}
		j := int(idx.Int64())
		out = append(out, pool[j])
		pool = append(pool[:j], pool[j+1:]...)
	}
	return out
}

// DeleteLotteryData 删帖清理
func DeleteLotteryData(tx *gorm.DB, postID uint) {
	tx.Where("post_id = ?", postID).Delete(&models.PostLotteryWinner{})
}

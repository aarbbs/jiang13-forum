package service

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"git.iioio.com/freefire/jiang13-forum/model"
	"gorm.io/gorm"
)

var (
	ErrPollClosed       = errors.New("投票已结束")
	ErrPollAlreadyVoted = errors.New("已投过票")
	ErrPollInvalidVote  = errors.New("无效的投票选项")
)

const (
	pollEndsAtMinLead   = 5 * time.Minute
	pollEndsAtMaxWindow = 365 * 24 * time.Hour
)

// PollOptionInput 创建投票时的选项
type PollOptionInput struct {
	Text string `json:"text"`
}

// PollView 投票帖详情视图
type PollView struct {
	Multi       bool              `json:"multi"`
	MaxChoices  int               `json:"max_choices"`
	Closed      bool              `json:"closed"`
	EndsAt      *time.Time        `json:"ends_at,omitempty"`
	Options     []PollOptionView  `json:"options"`
	MyOptionIDs []uint            `json:"my_option_ids,omitempty"`
	TotalVotes  int               `json:"total_votes"`
}

type PollOptionView struct {
	ID        uint   `json:"id"`
	Text      string `json:"text"`
	VoteCount int    `json:"vote_count"`
	Percent   int    `json:"percent,omitempty"`
}

// CreatePollForPost 为投票帖创建投票配置与选项
func CreatePollForPost(tx *gorm.DB, postID uint, multi bool, maxChoices int, endsAt *time.Time, options []PollOptionInput) error {
	if len(options) < 2 || len(options) > 10 {
		return errors.New("投票选项需 2-10 个")
	}
	if !multi {
		maxChoices = 1
	} else if maxChoices < 1 || maxChoices > len(options) {
		maxChoices = len(options)
	}
	poll := model.Poll{PostID: postID, Multi: multi, MaxChoices: maxChoices, EndsAt: endsAt}
	if err := tx.Create(&poll).Error; err != nil {
		return err
	}
	for i, opt := range options {
		text := strings.TrimSpace(opt.Text)
		if text == "" {
			return errors.New("投票选项不能为空")
		}
		if len([]rune(text)) > 64 {
			return errors.New("投票选项最多 64 字")
		}
		row := model.PollOption{PostID: postID, Text: text, SortOrder: i}
		if err := tx.Create(&row).Error; err != nil {
			return err
		}
	}
	return nil
}

// ParsePollOptionsJSON 解析发帖表单中的 poll_options JSON
func ParsePollOptionsJSON(raw string) ([]PollOptionInput, bool, int, *time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, false, 1, nil, errors.New("投票选项不能为空")
	}
	var payload struct {
		Multi      bool              `json:"multi"`
		MaxChoices int               `json:"max_choices"`
		EndsAt     string            `json:"ends_at"`
		Options    []PollOptionInput `json:"options"`
	}
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return nil, false, 1, nil, err
	}
	endsAt, err := parsePollEndsAt(payload.EndsAt)
	if err != nil {
		return nil, false, 1, nil, err
	}
	return payload.Options, payload.Multi, payload.MaxChoices, endsAt, nil
}

func parsePollEndsAt(raw string) (*time.Time, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	var parsed time.Time
	var ok bool
	for _, layout := range []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02 15:04:05",
	} {
		if t, err := time.Parse(layout, raw); err == nil {
			parsed = t
			ok = true
			break
		}
	}
	if !ok {
		return nil, errors.New("投票截止时间格式无效")
	}
	now := time.Now()
	if !parsed.After(now.Add(pollEndsAtMinLead)) {
		return nil, errors.New("投票截止时间须晚于当前时间至少 5 分钟")
	}
	if parsed.After(now.Add(pollEndsAtMaxWindow)) {
		return nil, errors.New("投票截止时间不能超过 365 天")
	}
	utc := parsed.UTC()
	return &utc, nil
}

// closePollIfExpired 若已过截止时间则自动关闭投票
func closePollIfExpired(postID uint) error {
	var poll model.Poll
	if err := model.DB.Where("post_id = ?", postID).First(&poll).Error; err != nil {
		return err
	}
	if poll.Closed || poll.EndsAt == nil {
		return nil
	}
	if time.Now().Before(*poll.EndsAt) {
		return nil
	}
	res := model.DB.Model(&poll).Where("post_id = ? AND closed = ?", postID, false).Update("closed", true)
	return res.Error
}

// GetPollView 获取投票视图
func GetPollView(postID, viewerID uint) (*PollView, error) {
	if err := closePollIfExpired(postID); err != nil {
		return nil, err
	}
	var poll model.Poll
	if err := model.DB.Where("post_id = ?", postID).First(&poll).Error; err != nil {
		return nil, err
	}
	var opts []model.PollOption
	if err := model.DB.Where("post_id = ?", postID).Order("sort_order ASC, id ASC").Find(&opts).Error; err != nil {
		return nil, err
	}
	total := 0
	for _, o := range opts {
		total += o.VoteCount
	}
	showResults := poll.Closed
	var myIDs []uint
	if viewerID > 0 {
		var votes []model.PollVote
		model.DB.Where("post_id = ? AND user_id = ?", postID, viewerID).Find(&votes)
		for _, v := range votes {
			myIDs = append(myIDs, v.OptionID)
		}
		if len(myIDs) > 0 {
			showResults = true
		}
	}
	views := make([]PollOptionView, len(opts))
	for i, o := range opts {
		v := PollOptionView{ID: o.ID, Text: o.Text, VoteCount: o.VoteCount}
		if showResults && total > 0 {
			v.Percent = o.VoteCount * 100 / total
		}
		views[i] = v
	}
	return &PollView{
		Multi: poll.Multi, MaxChoices: poll.MaxChoices, Closed: poll.Closed,
		EndsAt: poll.EndsAt, Options: views, MyOptionIDs: myIDs, TotalVotes: total,
	}, nil
}

// VotePoll 用户投票
func VotePoll(postID, userID uint, optionIDs []uint) error {
	if userID == 0 {
		return ErrPermissionDenied
	}
	if err := closePollIfExpired(postID); err != nil {
		return err
	}
	var poll model.Poll
	if err := model.DB.Where("post_id = ?", postID).First(&poll).Error; err != nil {
		return err
	}
	if poll.Closed {
		return ErrPollClosed
	}
	var existing int64
	model.DB.Model(&model.PollVote{}).Where("post_id = ? AND user_id = ?", postID, userID).Count(&existing)
	if existing > 0 {
		return ErrPollAlreadyVoted
	}
	if len(optionIDs) == 0 {
		return ErrPollInvalidVote
	}
	if !poll.Multi && len(optionIDs) != 1 {
		return errors.New("本投票为单选")
	}
	if poll.Multi && len(optionIDs) > poll.MaxChoices {
		return errors.New("超出最多可选数")
	}
	seen := map[uint]bool{}
	for _, oid := range optionIDs {
		if oid == 0 || seen[oid] {
			return ErrPollInvalidVote
		}
		seen[oid] = true
		var opt model.PollOption
		if err := model.DB.Where("id = ? AND post_id = ?", oid, postID).First(&opt).Error; err != nil {
			return ErrPollInvalidVote
		}
	}
	return model.DB.Transaction(func(tx *gorm.DB) error {
		for _, oid := range optionIDs {
			v := model.PollVote{PostID: postID, OptionID: oid, UserID: userID}
			if err := tx.Create(&v).Error; err != nil {
				return err
			}
			if err := tx.Model(&model.PollOption{}).Where("id = ?", oid).
				UpdateColumn("vote_count", gorm.Expr("vote_count + 1")).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// ClosePoll 结束投票
func ClosePoll(postID, userID uint, isAdmin bool, postAuthorID uint) error {
	if !isAdmin && userID != postAuthorID {
		return ErrPermissionDenied
	}
	res := model.DB.Model(&model.Poll{}).Where("post_id = ?", postID).Update("closed", true)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return errors.New("投票不存在")
	}
	return nil
}

// LockPollOptions 编辑时锁定选项（已发布帖不允许改选项文案）
func LockPollOptions(postID uint) bool {
	var n int64
	model.DB.Model(&model.PollVote{}).Where("post_id = ?", postID).Count(&n)
	return n > 0
}

// EnsurePollExists 检查投票帖是否有 poll 记录
func EnsurePollExists(postID uint) bool {
	var n int64
	model.DB.Model(&model.Poll{}).Where("post_id = ?", postID).Count(&n)
	return n > 0
}

// DeletePollData 删帖时清理投票数据
func DeletePollData(tx *gorm.DB, postID uint) {
	tx.Where("post_id = ?", postID).Delete(&model.PollVote{})
	tx.Where("post_id = ?", postID).Delete(&model.PollOption{})
	tx.Where("post_id = ?", postID).Delete(&model.Poll{})
}

package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"git.iioio.com/freefire/jiang13-forum/model"
	"gorm.io/gorm"
)

const (
	// CreatorSharePercent 作者分成比例（读者支付的百分比）
	CreatorSharePercent = 70
	// SockpuppetAccountAgeDays 短龄号判定天数（同 IP 互刷拒绝分成）
	SockpuppetAccountAgeDays = 7
)

var (
	ErrBlockNotFound   = errors.New("付费块不存在")
	ErrAlreadyUnlocked = errors.New("已解锁")
	ErrSuspiciousTrade = errors.New("检测到异常关联账号，无法完成解锁分成")
)

var pointsOnlyBlockRe = regexp.MustCompile(`(?is)<points-only\b([^>]*)>([\s\S]*?)</points-only>`)

// PointsOnlyBlock 解析出的付费块
type PointsOnlyBlock struct {
	Key     string
	Cost    int
	Inner   string
	AttrRaw string
}

// ParsePointsOnlyBlocks 按出现顺序解析付费块；block_key = sha256(inner)[:16]
func ParsePointsOnlyBlocks(html string) []PointsOnlyBlock {
	matches := pointsOnlyBlockRe.FindAllStringSubmatch(html, -1)
	out := make([]PointsOnlyBlock, 0, len(matches))
	for _, m := range matches {
		attrs := m[1]
		inner := m[2]
		cost := parseDataCost(attrs)
		if cost < 1 {
			cost = 1
		}
		sum := sha256.Sum256([]byte(inner))
		key := hex.EncodeToString(sum[:])[:16]
		out = append(out, PointsOnlyBlock{Key: key, Cost: cost, Inner: inner, AttrRaw: attrs})
	}
	return out
}

func parseDataCost(attrs string) int {
	re := regexp.MustCompile(`(?i)data-cost\s*=\s*["']?(\d+)`)
	m := re.FindStringSubmatch(attrs)
	if len(m) < 2 {
		return 0
	}
	n, _ := strconv.Atoi(m[1])
	return n
}

// FindPointsBlock 按 key 查找块
func FindPointsBlock(html, blockKey string) (PointsOnlyBlock, bool) {
	for _, b := range ParsePointsOnlyBlocks(html) {
		if b.Key == blockKey {
			return b, true
		}
	}
	return PointsOnlyBlock{}, false
}

// RedactPointsOnlyHTML 遮盖未解锁付费块；unlocked 为已解锁的 block_key 集合
func RedactPointsOnlyHTML(html string, unlocked map[string]bool) string {
	if html == "" {
		return html
	}
	return pointsOnlyBlockRe.ReplaceAllStringFunc(html, func(full string) string {
		m := pointsOnlyBlockRe.FindStringSubmatch(full)
		if len(m) < 3 {
			return full
		}
		attrs, inner := m[1], m[2]
		sum := sha256.Sum256([]byte(inner))
		key := hex.EncodeToString(sum[:])[:16]
		if unlocked != nil && unlocked[key] {
			cost := parseDataCost(attrs)
			if cost < 1 {
				cost = 1
			}
			return fmt.Sprintf(`<points-only data-gate="points" data-cost="%d" data-block-key="%s" data-locked="false">%s</points-only>`, cost, key, inner)
		}
		cost := parseDataCost(attrs)
		if cost < 1 {
			cost = 1
		}
		length := gatedContentLength(inner)
		return fmt.Sprintf(`<points-only data-gate="points" data-cost="%d" data-block-key="%s" data-locked="true" data-length="%d"></points-only>`, cost, key, length)
	})
}

// ListUnlockedKeys 用户在某帖已解锁的 block_key
func ListUnlockedKeys(userID, postID uint) (map[string]bool, error) {
	out := map[string]bool{}
	if userID == 0 || postID == 0 {
		return out, nil
	}
	var rows []model.PostContentUnlock
	if err := model.DB.Select("block_key").Where("user_id = ? AND post_id = ?", userID, postID).Find(&rows).Error; err != nil {
		return out, err
	}
	for _, r := range rows {
		out[r.BlockKey] = true
	}
	return out, nil
}

// UnlockResult 解锁结果
type UnlockResult struct {
	BlockKey      string `json:"block_key"`
	Cost          int    `json:"cost"`
	AuthorShare   int    `json:"author_share"`
	PointsBalance int    `json:"points_balance"`
	InnerHTML     string `json:"inner_html"`
}

// UnlockPointsBlock 积分解锁付费块
func UnlockPointsBlock(readerID, postID uint, blockKey string) (*UnlockResult, error) {
	var post model.Post
	if err := model.DB.First(&post, postID).Error; err != nil {
		return nil, errors.New("帖子不存在")
	}
	block, ok := FindPointsBlock(post.Content, blockKey)
	if !ok {
		return nil, ErrBlockNotFound
	}

	// 作者自己免费解锁记录（无分成）
	if readerID == post.UserID {
		var n int64
		model.DB.Model(&model.PostContentUnlock{}).Where("user_id = ? AND post_id = ? AND block_key = ?", readerID, postID, blockKey).Count(&n)
		if n == 0 {
			_ = model.DB.Create(&model.PostContentUnlock{
				UserID: readerID, PostID: postID, BlockKey: blockKey, Cost: 0,
			}).Error
		}
		return &UnlockResult{BlockKey: blockKey, Cost: 0, AuthorShare: 0, InnerHTML: block.Inner}, nil
	}

	var existing model.PostContentUnlock
	model.DB.Where("user_id = ? AND post_id = ? AND block_key = ?", readerID, postID, blockKey).Limit(1).Find(&existing)
	if existing.ID > 0 {
		return nil, ErrAlreadyUnlocked
	}

	var reader, author model.User
	if err := model.DB.First(&reader, readerID).Error; err != nil {
		return nil, err
	}
	if err := model.DB.First(&author, post.UserID).Error; err != nil {
		return nil, err
	}

	// 短龄号 + 同登录 IP：拒绝整单（防互刷套现）
	if suspiciousUnlockPair(&reader, &author) {
		return nil, ErrSuspiciousTrade
	}

	cost := block.Cost
	authorShare := cost * CreatorSharePercent / 100
	var bal int
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var again model.PostContentUnlock
		if err := tx.Where("user_id = ? AND post_id = ? AND block_key = ?", readerID, postID, blockKey).Limit(1).Find(&again).Error; err != nil {
			return err
		}
		if again.ID > 0 {
			return ErrAlreadyUnlocked
		}
		var e error
		bal, e = AdjustPointsTx(tx, readerID, -cost, model.PointReasonUnlockSpend, "post_unlock", postID, "解锁付费内容")
		if e != nil {
			return e
		}
		if authorShare > 0 {
			if _, e = AdjustPointsTx(tx, author.ID, authorShare, model.PointReasonCreatorIncome, "post_unlock", postID, "创作分成"); e != nil {
				return e
			}
			if e = tx.Model(&model.User{}).Where("id = ?", author.ID).
				UpdateColumn("creator_income_total", gorm.Expr("creator_income_total + ?", authorShare)).Error; e != nil {
				return e
			}
		}
		return tx.Create(&model.PostContentUnlock{
			UserID: readerID, PostID: postID, BlockKey: blockKey, Cost: cost,
		}).Error
	})
	if err != nil {
		return nil, err
	}
	// 异步检查作者徽章
	go func() {
		_ = NewBadgeService().EvaluateAuto(author.ID)
	}()
	return &UnlockResult{
		BlockKey: blockKey, Cost: cost, AuthorShare: authorShare,
		PointsBalance: bal, InnerHTML: block.Inner,
	}, nil
}

func suspiciousUnlockPair(reader, author *model.User) bool {
	if reader == nil || author == nil {
		return false
	}
	ipR := strings.TrimSpace(reader.LastLoginIP)
	ipA := strings.TrimSpace(author.LastLoginIP)
	if ipR == "" || ipA == "" || ipR != ipA {
		return false
	}
	cutoff := time.Now().AddDate(0, 0, -SockpuppetAccountAgeDays)
	return reader.CreatedAt.After(cutoff) && author.CreatedAt.After(cutoff)
}

// RevealAllPointsOnly 作者/站长：保留正文并写入 block-key，标记未锁定
func RevealAllPointsOnly(html string) string {
	if html == "" {
		return html
	}
	return pointsOnlyBlockRe.ReplaceAllStringFunc(html, func(full string) string {
		m := pointsOnlyBlockRe.FindStringSubmatch(full)
		if len(m) < 3 {
			return full
		}
		attrs, inner := m[1], m[2]
		sum := sha256.Sum256([]byte(inner))
		key := hex.EncodeToString(sum[:])[:16]
		cost := parseDataCost(attrs)
		if cost < 1 {
			cost = 1
		}
		return fmt.Sprintf(`<points-only data-gate="points" data-cost="%d" data-block-key="%s" data-locked="false">%s</points-only>`, cost, key, inner)
	})
}

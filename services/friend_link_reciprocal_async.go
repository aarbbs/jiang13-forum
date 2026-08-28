package services

import (
	"sync"
	"time"

	"git.iioio.com/freefire/jiang13-forum/models"
)

const reciprocalCheckConcurrency = 3

var (
	reciprocalCheckMu  sync.Mutex
	reciprocalCheckGen = map[uint]uint64{}
	reciprocalCheckSem = make(chan struct{}, reciprocalCheckConcurrency)
)

func init() {
	for i := 0; i < reciprocalCheckConcurrency; i++ {
		reciprocalCheckSem <- struct{}{}
	}
}

// EnqueueReciprocalCheck 异步检测回链；同一申请多次入队时仅保留最后一次结果
func EnqueueReciprocalCheck(applyID uint, pageURL, ourSiteURL string) {
	reciprocalCheckMu.Lock()
	reciprocalCheckGen[applyID]++
	gen := reciprocalCheckGen[applyID]
	reciprocalCheckMu.Unlock()

	go runReciprocalCheck(applyID, gen, pageURL, ourSiteURL)
}

func runReciprocalCheck(applyID uint, gen uint64, pageURL, ourSiteURL string) {
	reciprocalCheckSem <- struct{}{}
	defer func() { <-reciprocalCheckSem }()

	verified, note := VerifyReciprocalLink(pageURL, ourSiteURL)
	now := time.Now()

	reciprocalCheckMu.Lock()
	if reciprocalCheckGen[applyID] != gen {
		reciprocalCheckMu.Unlock()
		return
	}
	reciprocalCheckMu.Unlock()

	_ = models.DB.Model(&models.FriendLinkApply{}).Where("id = ?", applyID).Updates(map[string]interface{}{
		"reciprocal_verified":   verified,
		"reciprocal_check_note": note,
		"reciprocal_checked_at": now,
	}).Error
}

// ResetReciprocalCheckState 重置为检测中，供重新检测使用
func ResetReciprocalCheckState(applyID uint) {
	_ = models.DB.Model(&models.FriendLinkApply{}).Where("id = ?", applyID).Updates(map[string]interface{}{
		"reciprocal_verified":   false,
		"reciprocal_check_note": "",
		"reciprocal_checked_at": nil,
	}).Error
}

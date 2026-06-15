package service

import (
	"sync"
	"time"

	"github.com/jiang13/forum/model"
)

const onlineTTL = 5 * time.Minute

// OnlineService 在线浏览追踪（内存）：登录会员 + 游客
type OnlineService struct {
	mu     sync.RWMutex
	seen   map[uint]time.Time   // 登录用户
	guests map[string]time.Time // 游客访客标识
}

func NewOnlineService() *OnlineService {
	s := &OnlineService{
		seen:   make(map[uint]time.Time),
		guests: make(map[string]time.Time),
	}
	go s.cleanup()
	return s
}

func (s *OnlineService) Ping(userID uint) {
	if userID == 0 {
		return
	}
	s.mu.Lock()
	s.seen[userID] = time.Now()
	s.mu.Unlock()
}

func (s *OnlineService) PingGuest(visitorID string) {
	if visitorID == "" {
		return
	}
	s.mu.Lock()
	s.guests[visitorID] = time.Now()
	s.mu.Unlock()
}

type OnlineUser struct {
	ID       uint   `json:"id"`
	Nickname string `json:"nickname"`
	Avatar   string `json:"avatar"`
}

func (s *OnlineService) List(limit int) []OnlineUser {
	if limit <= 0 {
		limit = 20
	}
	cutoff := time.Now().Add(-onlineTTL)
	s.mu.RLock()
	var ids []uint
	for id, t := range s.seen {
		if t.After(cutoff) {
			ids = append(ids, id)
		}
	}
	s.mu.RUnlock()
	if len(ids) == 0 {
		return nil
	}
	var users []model.User
	model.DB.Where("id IN ?", ids).Limit(limit).Find(&users)
	out := make([]OnlineUser, 0, len(users))
	for _, u := range users {
		out = append(out, OnlineUser{ID: u.ID, Nickname: u.Nickname, Avatar: u.Avatar})
	}
	return out
}

func (s *OnlineService) CountMembers() int {
	return s.countSeen(s.seen)
}

func (s *OnlineService) CountGuests() int {
	return s.countSeenString(s.guests)
}

// Count 当前浏览总人数（会员 + 游客）
func (s *OnlineService) Count() int {
	return s.CountMembers() + s.CountGuests()
}

func (s *OnlineService) countSeen(m map[uint]time.Time) int {
	cutoff := time.Now().Add(-onlineTTL)
	s.mu.RLock()
	defer s.mu.RUnlock()
	n := 0
	for _, t := range m {
		if t.After(cutoff) {
			n++
		}
	}
	return n
}

func (s *OnlineService) countSeenString(m map[string]time.Time) int {
	cutoff := time.Now().Add(-onlineTTL)
	s.mu.RLock()
	defer s.mu.RUnlock()
	n := 0
	for _, t := range m {
		if t.After(cutoff) {
			n++
		}
	}
	return n
}

func (s *OnlineService) cleanup() {
	ticker := time.NewTicker(time.Minute)
	for range ticker.C {
		cutoff := time.Now().Add(-onlineTTL * 2)
		s.mu.Lock()
		for id, t := range s.seen {
			if t.Before(cutoff) {
				delete(s.seen, id)
			}
		}
		for id, t := range s.guests {
			if t.Before(cutoff) {
				delete(s.guests, id)
			}
		}
		s.mu.Unlock()
	}
}

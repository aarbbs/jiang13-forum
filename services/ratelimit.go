package service

import (
	"sync"
	"time"
)

// RateLimiter 简单内存限流器，防止重复刷屏
type RateLimiter struct {
	mu       sync.Mutex
	records  map[string][]time.Time
	settings *ForumSettingsService
}

func NewRateLimiter(settings *ForumSettingsService) *RateLimiter {
	r := &RateLimiter{
		records:  make(map[string][]time.Time),
		settings: settings,
	}
	go r.cleanup()
	return r
}

// Allow 检查 action+key 是否允许操作
func (r *RateLimiter) Allow(action, key string) bool {
	limit := r.limitFor(action)
	window := r.windowFor(action)
	if limit <= 0 {
		return true
	}
	fullKey := action + ":" + key

	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-window)
	times := r.records[fullKey]
	var valid []time.Time
	for _, t := range times {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}
	if len(valid) >= limit {
		r.records[fullKey] = valid
		return false
	}
	valid = append(valid, now)
	r.records[fullKey] = valid
	return true
}

func (r *RateLimiter) limitFor(action string) int {
	if action == "friend_link" {
		return 5
	}
	return r.settings.RateLimitFor(action)
}

func (r *RateLimiter) windowFor(action string) time.Duration {
	if action == "friend_link" {
		return time.Hour
	}
	return time.Duration(r.settings.RateLimitWindowSec()) * time.Second
}

func (r *RateLimiter) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		r.mu.Lock()
		// 使用最大窗口清理，覆盖友链 1 小时窗口
		cutoff := time.Now().Add(-time.Hour * 2)
		for k, times := range r.records {
			var valid []time.Time
			for _, t := range times {
				if t.After(cutoff) {
					valid = append(valid, t)
				}
			}
			if len(valid) == 0 {
				delete(r.records, k)
			} else {
				r.records[k] = valid
			}
		}
		r.mu.Unlock()
	}
}

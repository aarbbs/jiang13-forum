package service

import (
	"sync"
	"time"
)

// RateLimiter 简单内存限流器，防止重复刷屏
type RateLimiter struct {
	mu       sync.Mutex
	records  map[string][]time.Time
	limit    int           // 窗口内最大次数
	window   time.Duration // 时间窗口
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	r := &RateLimiter{
		records: make(map[string][]time.Time),
		limit:   limit,
		window:  window,
	}
	go r.cleanup()
	return r
}

// Allow 检查 key（如 userID+action）是否允许操作
func (r *RateLimiter) Allow(key string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	cutoff := now.Add(-r.window)
	times := r.records[key]
	var valid []time.Time
	for _, t := range times {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}
	if len(valid) >= r.limit {
		r.records[key] = valid
		return false
	}
	valid = append(valid, now)
	r.records[key] = valid
	return true
}

func (r *RateLimiter) cleanup() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		r.mu.Lock()
		now := time.Now()
		cutoff := now.Add(-r.window * 2)
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

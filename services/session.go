package services

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"
	"sync"
	"time"

	"git.iioio.com/freefire/jiang13-forum/models"
)

const (
	// SessionTTL 浏览器会话默认有效期
	SessionTTL = 7 * 24 * time.Hour
	// sessionTouchMin 滑动续期写库节流
	sessionTouchMin = 2 * time.Minute
)

var (
	ErrSessionInvalid = errors.New("会话无效或已过期")
	sessionTouchCache sync.Map // sessionID -> time.Time
)

// CreateSession 为用户创建会话，返回 cookie 值
func CreateSession(userID uint, ip, userAgent string) (string, error) {
	id, err := newSessionID()
	if err != nil {
		return "", err
	}
	now := time.Now()
	ip = trimLen(ip, 45)
	ua := trimLen(userAgent, 256)
	rec := models.Session{
		ID:         id,
		UserID:     userID,
		ExpiresAt:  now.Add(SessionTTL),
		CreatedAt:  now,
		LastSeenAt: now,
		IP:         ip,
		UserAgent:  ua,
	}
	if err := models.DB.Create(&rec).Error; err != nil {
		return "", err
	}
	return id, nil
}

// ResolveSession 校验会话并返回用户；无效则删行并返回错误
func ResolveSession(sessionID string) (*models.User, *models.Session, error) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return nil, nil, ErrSessionInvalid
	}
	var sess models.Session
	if err := models.DB.First(&sess, "id = ?", sessionID).Error; err != nil {
		return nil, nil, ErrSessionInvalid
	}
	now := time.Now()
	if now.After(sess.ExpiresAt) {
		_ = models.DB.Delete(&models.Session{}, "id = ?", sessionID).Error
		return nil, nil, ErrSessionInvalid
	}
	var user models.User
	if err := models.DB.First(&user, sess.UserID).Error; err != nil {
		_ = models.DB.Delete(&models.Session{}, "id = ?", sessionID).Error
		return nil, nil, ErrSessionInvalid
	}
	touchSession(&sess, now)
	return &user, &sess, nil
}

func touchSession(sess *models.Session, now time.Time) {
	if v, ok := sessionTouchCache.Load(sess.ID); ok {
		if t, ok := v.(time.Time); ok && now.Sub(t) < sessionTouchMin {
			return
		}
	}
	sessionTouchCache.Store(sess.ID, now)
	half := SessionTTL / 2
	remaining := sess.ExpiresAt.Sub(now)
	updates := map[string]interface{}{"last_seen_at": now}
	if remaining < half {
		updates["expires_at"] = now.Add(SessionTTL)
		sess.ExpiresAt = now.Add(SessionTTL)
	}
	sess.LastSeenAt = now
	_ = models.DB.Model(&models.Session{}).Where("id = ?", sess.ID).Updates(updates).Error
}

// DeleteSession 登出当前会话
func DeleteSession(sessionID string) {
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		return
	}
	_ = models.DB.Delete(&models.Session{}, "id = ?", sessionID).Error
	sessionTouchCache.Delete(sessionID)
}

// RevokeUserSessions 吊销用户全部会话（禁言 / 改密）
func RevokeUserSessions(userID uint) {
	if userID == 0 {
		return
	}
	_ = models.DB.Where("user_id = ?", userID).Delete(&models.Session{}).Error
}

func newSessionID() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func trimLen(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) > n {
		return s[:n]
	}
	return s
}

// SessionCookieMaxAge Cookie MaxAge（秒）
func SessionCookieMaxAge() int {
	return int(SessionTTL.Seconds())
}

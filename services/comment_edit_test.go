package services

import (
	"testing"
	"time"

	"git.iioio.com/freefire/jiang13-forum/models"
)

func TestCanEditComment(t *testing.T) {
	now := time.Now()
	c := &models.Comment{UserID: 7, CreatedAt: now}
	if !canEditComment(c, 7, false, 3) {
		t.Fatal("author within window")
	}
	if canEditComment(c, 8, false, 3) {
		t.Fatal("other user")
	}
	if !canEditComment(c, 1, true, 3) {
		t.Fatal("admin always")
	}
	old := &models.Comment{UserID: 7, CreatedAt: now.Add(-10 * time.Minute)}
	if canEditComment(old, 7, false, 3) {
		t.Fatal("expired")
	}
	if !canEditComment(old, 7, true, 3) {
		t.Fatal("admin ignores window")
	}
}

func TestCanUserDeleteComment(t *testing.T) {
	s := &CommentService{}
	c := &models.Comment{UserID: 3}
	if !s.CanUserDeleteComment(c, 3, false) {
		t.Fatal("author")
	}
	if s.CanUserDeleteComment(c, 4, false) {
		t.Fatal("other")
	}
	if !s.CanUserDeleteComment(c, 1, true) {
		t.Fatal("admin")
	}
	guest := &models.Comment{UserID: 0}
	if s.CanUserDeleteComment(guest, 1, false) {
		t.Fatal("guest author id 0")
	}
}

package services

import (
	"errors"
	"testing"

	"github.com/glebarez/sqlite"
	"git.iioio.com/freefire/jiang13-forum/models"
	"gorm.io/gorm"
)

func setupBountyTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Post{}, &models.Comment{}, &models.PointLedger{}); err != nil {
		t.Fatal(err)
	}
	prev := models.DB
	models.DB = db
	t.Cleanup(func() { models.DB = prev })
	return db
}

func seedBountyPost(t *testing.T, db *gorm.DB, authorID uint, points int) models.Post {
	t.Helper()
	post := models.Post{
		UserID:       authorID,
		BoardID:      1,
		Title:        "悬赏测试",
		Content:      "内容",
		PostType:     models.PostTypeBounty,
		BountyPoints: points,
		BountyStatus: models.BountyStatusOpen,
		Status:       models.ContentStatusPublished,
	}
	if err := db.Create(&post).Error; err != nil {
		t.Fatal(err)
	}
	return post
}

func seedUser(t *testing.T, db *gorm.DB, id uint, points int) {
	t.Helper()
	u := models.User{
		ID:       id,
		Username: "user" + string(rune('0'+id)),
		Password: "hash",
		Nickname: "测试",
		Points:   points,
	}
	if err := db.Create(&u).Error; err != nil {
		t.Fatal(err)
	}
}

func seedComment(t *testing.T, db *gorm.DB, postID, userID uint, floor int, status string) {
	t.Helper()
	c := models.Comment{
		PostID:  postID,
		UserID:  userID,
		Floor:   floor,
		Content: "回复",
		Status:  status,
	}
	if err := db.Create(&c).Error; err != nil {
		t.Fatal(err)
	}
}

func TestCountEligibleBountyReplies(t *testing.T) {
	db := setupBountyTestDB(t)
	post := seedBountyPost(t, db, 1, 10)

	n, err := CountEligibleBountyReplies(db, post.ID, 1)
	if err != nil || n != 0 {
		t.Fatalf("无回复时期望 0，得到 %d err=%v", n, err)
	}

	seedComment(t, db, post.ID, 1, 1, models.ContentStatusPublished)
	n, err = CountEligibleBountyReplies(db, post.ID, 1)
	if err != nil || n != 0 {
		t.Fatalf("楼主自己的回复不应计入，得到 %d", n)
	}

	seedComment(t, db, post.ID, 2, 2, models.ContentStatusPublished)
	n, err = CountEligibleBountyReplies(db, post.ID, 1)
	if err != nil || n != 1 {
		t.Fatalf("他人 published 回复期望 1，得到 %d", n)
	}

	seedComment(t, db, post.ID, 3, 3, models.ContentStatusPending)
	n, err = CountEligibleBountyReplies(db, post.ID, 1)
	if err != nil || n != 1 {
		t.Fatalf("pending 回复不应增加计数，得到 %d", n)
	}

	seedComment(t, db, post.ID, 0, 4, models.ContentStatusPublished)
	n, err = CountEligibleBountyReplies(db, post.ID, 1)
	if err != nil || n != 2 {
		t.Fatalf("游客回复应计入，得到 %d", n)
	}
}

func TestCanRefundBounty(t *testing.T) {
	db := setupBountyTestDB(t)
	post := seedBountyPost(t, db, 1, 5)

	can, reason := CanRefundBounty(&post, false)
	if !can || reason != "" {
		t.Fatalf("无回复时楼主应可退，can=%v reason=%q", can, reason)
	}

	seedComment(t, db, post.ID, 2, 1, models.ContentStatusPublished)
	can, reason = CanRefundBounty(&post, false)
	if can || reason != bountyRefundBlockReason {
		t.Fatalf("有他人回复时楼主不可退，can=%v reason=%q", can, reason)
	}

	can, reason = CanRefundBounty(&post, true)
	if !can || reason != "" {
		t.Fatalf("管理员应可强制退，can=%v reason=%q", can, reason)
	}
}

func TestRefundBountyBlockedForAuthorWithReplies(t *testing.T) {
	db := setupBountyTestDB(t)
	seedUser(t, db, 1, 0)
	seedUser(t, db, 2, 0)
	post := seedBountyPost(t, db, 1, 8)
	seedComment(t, db, post.ID, 2, 1, models.ContentStatusPublished)

	err := RefundBounty(post.ID, 1, false)
	if !errors.Is(err, ErrBountyRefundBlocked) {
		t.Fatalf("楼主有他人回复时应拒绝退回，err=%v", err)
	}
}

func TestRefundBountyAllowedWithoutReplies(t *testing.T) {
	db := setupBountyTestDB(t)
	seedUser(t, db, 1, 0)
	post := seedBountyPost(t, db, 1, 6)

	if err := RefundBounty(post.ID, 1, false); err != nil {
		t.Fatalf("无回复时楼主应可退回，err=%v", err)
	}
	var updated models.Post
	if err := db.First(&updated, post.ID).Error; err != nil {
		t.Fatal(err)
	}
	if updated.BountyStatus != models.BountyStatusRefunded || updated.BountyPoints != 0 {
		t.Fatalf("状态应为 refunded 且积分为 0，得到 status=%s points=%d", updated.BountyStatus, updated.BountyPoints)
	}
	var author models.User
	if err := db.First(&author, 1).Error; err != nil {
		t.Fatal(err)
	}
	if author.Points != 6 {
		t.Fatalf("楼主应收回 6 积分，余额=%d", author.Points)
	}
}

func TestRefundBountyAdminBypassWithReplies(t *testing.T) {
	db := setupBountyTestDB(t)
	seedUser(t, db, 1, 0)
	seedUser(t, db, 2, 0)
	post := seedBountyPost(t, db, 1, 4)
	seedComment(t, db, post.ID, 2, 1, models.ContentStatusPublished)

	if err := RefundBounty(post.ID, 99, true); err != nil {
		t.Fatalf("管理员应可强制退回，err=%v", err)
	}
}

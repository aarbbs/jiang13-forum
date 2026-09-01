package service

import (
	"testing"
	"time"

	"git.iioio.com/freefire/jiang13-forum/model"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestParseNotifyFloor(t *testing.T) {
	cases := map[string]int{
		"用户 X 在《Y》提交了待审核 #2 楼评论": 2,
		"用户 X 在《Y》#3 楼下提交了待审核回复":  3,
		"无楼号":                        0,
	}
	for content, want := range cases {
		if got := parseNotifyFloor(content); got != want {
			t.Errorf("parseNotifyFloor(%q) = %d, want %d", content, got, want)
		}
	}
}

func TestEnrichModerationStatusPublished(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.User{}, &model.Post{}, &model.Comment{}, &model.PrivateMessage{}); err != nil {
		t.Fatal(err)
	}
	model.DB = db

	post := model.Post{Title: "测试帖", Status: model.ContentStatusPublished, UserID: 1}
	if err := db.Create(&post).Error; err != nil {
		t.Fatal(err)
	}
	comment := model.Comment{
		PostID: post.ID, UserID: 2, Floor: 2,
		Status: model.ContentStatusPublished,
	}
	if err := db.Create(&comment).Error; err != nil {
		t.Fatal(err)
	}

	pid := post.ID
	msg := model.PrivateMessage{
		FromUserID:    0,
		ToUserID:      1,
		Subject:       "新的待审核评论",
		Content:       "用户 A 在《测试帖》提交了待审核 #2 楼评论",
		Kind:          model.MessageKindModeration,
		RelatedPostID: &pid,
		CreatedAt:     time.Now(),
	}
	if err := db.Create(&msg).Error; err != nil {
		t.Fatal(err)
	}

	svc := &MessageService{}
	list := []model.PrivateMessage{msg}
	svc.enrichModerationStatus(list)
	if list[0].RelatedStatus != model.ContentStatusPublished {
		t.Fatalf("RelatedStatus = %q, want published", list[0].RelatedStatus)
	}
}

func TestResolveNestedModerationCommentRef(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Post{}, &model.Comment{}); err != nil {
		t.Fatal(err)
	}
	model.DB = db

	post := model.Post{Title: "嵌套", Status: model.ContentStatusPublished}
	if err := db.Create(&post).Error; err != nil {
		t.Fatal(err)
	}
	parent := model.Comment{PostID: post.ID, Floor: 1, Status: model.ContentStatusPublished}
	child := model.Comment{
		PostID: post.ID, Floor: 3, Status: model.ContentStatusPublished,
	}
	if err := db.Create(&parent).Error; err != nil {
		t.Fatal(err)
	}
	rt := parent.ID
	child.ReplyTo = &rt
	child.CreatedAt = time.Now()
	if err := db.Create(&child).Error; err != nil {
		t.Fatal(err)
	}

	notifyAt := child.CreatedAt.Add(2 * time.Second)
	cid, floor := resolveModerationCommentRef(post.ID, "用户 A 在《嵌套》#1 楼下提交了待审核回复", notifyAt)
	if cid != child.ID || floor != 3 {
		t.Fatalf("resolve = (%d, %d), want (%d, 3)", cid, floor, child.ID)
	}
}

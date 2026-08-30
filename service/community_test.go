package service

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"git.iioio.com/freefire/jiang13-forum/model"
)

func setupCommunityTest(t *testing.T) (*ForumSettingsService, *CommunityService) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(
		&model.ForumSetting{},
		&model.CommunityInstance{},
		&model.User{},
		&model.Post{},
	); err != nil {
		t.Fatal(err)
	}
	prev := model.DB
	model.DB = db
	t.Cleanup(func() { model.DB = prev })

	settings := NewForumSettingsService()
	svc := NewCommunityService(settings)
	return settings, svc
}

func TestCommunityHeartbeatHubDisabled(t *testing.T) {
	_, svc := setupCommunityTest(t)
	err := svc.ReceiveHeartbeat(CommunityHeartbeatPayload{
		InstanceID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		SiteURL:    "https://example.com",
		SiteName:   "测试站",
		Version:    "1.0.0",
		Users:      1,
		Posts:      2,
	}, "127.0.0.1")
	if !errors.Is(err, ErrCommunityHubDisabled) {
		t.Fatalf("want ErrCommunityHubDisabled, got %v", err)
	}
}

func TestCommunityHeartbeatAcceptAndList(t *testing.T) {
	settings, svc := setupCommunityTest(t)
	settings.SetCommunityHubEnabled(true)

	payload := CommunityHeartbeatPayload{
		InstanceID: "11111111-2222-3333-4444-555555555555",
		SiteURL:    "https://forum.example.org",
		SiteName:   "示例论坛",
		Version:    "1.2.3",
		Users:      10,
		Posts:      20,
	}
	if err := svc.ReceiveHeartbeat(payload, "203.0.113.9"); err != nil {
		t.Fatal(err)
	}
	payload.Users = 11
	payload.Posts = 21
	if err := svc.ReceiveHeartbeat(payload, "203.0.113.9"); err != nil {
		t.Fatal(err)
	}

	list, err := svc.ListInstances()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 {
		t.Fatalf("want 1 instance, got %d", len(list))
	}
	got := list[0]
	if got.Users != 11 || got.Posts != 21 || !got.Online {
		t.Fatalf("unexpected row: %+v", got)
	}
	if got.SiteURL != payload.SiteURL || got.SiteName != payload.SiteName {
		t.Fatalf("site fields mismatch: %+v", got)
	}
}

func TestCommunityUpdateIgnoresHubFields(t *testing.T) {
	settings, _ := setupCommunityTest(t)
	if settings.CommunityConfig().HubEnabled {
		t.Fatal("hub should be off by default")
	}
	if _, err := settings.UpdateCommunityConfig(CommunityConfig{
		ReportEnabled: true,
		HubEnabled:    true,
		HubURL:        "https://evil.example",
		SiteURL:       "https://should-be-ignored.example",
	}); err != nil {
		t.Fatal(err)
	}
	cfg := settings.CommunityConfig()
	if cfg.HubEnabled {
		t.Fatal("UpdateCommunityConfig must not enable hub")
	}
	if cfg.HubURL != DefaultCommunityHubURL {
		t.Fatalf("hub_url must stay official, got %s", cfg.HubURL)
	}
	if cfg.SiteURL == "https://should-be-ignored.example" {
		t.Fatal("client site_url must be ignored")
	}
	if !cfg.ReportEnabled {
		t.Fatal("report should be enabled")
	}
	settings.SetCommunityHubEnabled(true)
	if !settings.CommunityConfig().HubEnabled {
		t.Fatal("SetCommunityHubEnabled should enable hub")
	}
}

func TestCommunityHeartbeatBadURL(t *testing.T) {
	settings, svc := setupCommunityTest(t)
	settings.SetCommunityHubEnabled(true)
	err := svc.ReceiveHeartbeat(CommunityHeartbeatPayload{
		InstanceID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		SiteURL:    "javascript:alert(1)",
		SiteName:   "坏",
	}, "127.0.0.1")
	if !errors.Is(err, ErrCommunityBadPayload) {
		t.Fatalf("want ErrCommunityBadPayload, got %v", err)
	}
}

func TestCommunityOutboundHeartbeat(t *testing.T) {
	settings, svc := setupCommunityTest(t)
	var hits atomic.Int32
	var lastBody CommunityHeartbeatPayload

	hub := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/community/heartbeat" {
			http.NotFound(w, r)
			return
		}
		defer r.Body.Close()
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &lastBody)
		hits.Add(1)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	t.Cleanup(hub.Close)

	prevHub := communityHubBaseURL
	communityHubBaseURL = hub.URL
	t.Cleanup(func() { communityHubBaseURL = prevHub })

	svc.trySendHeartbeat()
	if hits.Load() != 0 {
		t.Fatal("report disabled should not send")
	}

	if err := settings.setString(SettingOIDCRootURL, "http://reporter.local"); err != nil {
		t.Fatal(err)
	}
	if err := settings.setString(SettingSiteName, "上报测试站"); err != nil {
		t.Fatal(err)
	}
	if _, err := settings.UpdateCommunityConfig(CommunityConfig{ReportEnabled: true}); err != nil {
		t.Fatal(err)
	}

	if err := svc.SendHeartbeatOnce(""); err != nil {
		t.Fatal(err)
	}
	if hits.Load() != 1 {
		t.Fatalf("want 1 outbound hit, got %d", hits.Load())
	}
	if lastBody.InstanceID == "" || lastBody.SiteURL == "" {
		t.Fatalf("empty payload: %+v", lastBody)
	}

	if _, err := settings.UpdateCommunityConfig(CommunityConfig{ReportEnabled: false}); err != nil {
		t.Fatal(err)
	}
	if err := svc.SendHeartbeatOnce(""); err != nil {
		t.Fatal(err)
	}
	if hits.Load() != 1 {
		t.Fatalf("after disable want still 1 hit, got %d", hits.Load())
	}
}

func TestCommunityFeatureAndShowcase(t *testing.T) {
	settings, svc := setupCommunityTest(t)
	settings.SetCommunityHubEnabled(true)

	payload := CommunityHeartbeatPayload{
		InstanceID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		SiteURL:    "https://forum.example.org",
		SiteName:   "示例论坛",
		Version:    "2.0.0",
	}
	if err := svc.ReceiveHeartbeat(payload, "127.0.0.1"); err != nil {
		t.Fatal(err)
	}

	empty, err := svc.ListShowcase()
	if err != nil {
		t.Fatal(err)
	}
	if len(empty) != 0 {
		t.Fatal("showcase should be empty before feature")
	}

	view, err := svc.SetInstanceFeatured(payload.InstanceID, CommunityFeatureInput{
		Featured:     true,
		FeaturedNote: "精选自托管",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !view.Featured || view.FeaturedNote != "精选自托管" {
		t.Fatalf("unexpected view: %+v", view)
	}

	items, err := svc.ListShowcase()
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].SiteURL != payload.SiteURL {
		t.Fatalf("showcase=%+v", items)
	}

	// 心跳更新不得清掉精选
	payload.Users = 9
	if err := svc.ReceiveHeartbeat(payload, "127.0.0.1"); err != nil {
		t.Fatal(err)
	}
	items, err = svc.ListShowcase()
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].FeaturedNote != "精选自托管" {
		t.Fatalf("featured lost after heartbeat: %+v", items)
	}

	settings.SetCommunityHubEnabled(false)
	items, err = svc.ListShowcase()
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Fatal("hub off should hide showcase")
	}
}

func TestCommunitySiteURLFromOrigin(t *testing.T) {
	settings, svc := setupCommunityTest(t)
	if _, err := settings.UpdateCommunityConfig(CommunityConfig{ReportEnabled: true}); err != nil {
		t.Fatal(err)
	}
	u, err := settings.EnsureCommunitySiteURL("http://localhost:5173")
	if err != nil {
		t.Fatal(err)
	}
	if u != "http://localhost:5173" {
		t.Fatalf("got %s", u)
	}
	if settings.CommunitySiteURL("") != "http://localhost:5173" {
		t.Fatal("should persist for ticker")
	}
	payload, err := svc.buildPayload("")
	if err != nil {
		t.Fatal(err)
	}
	if payload.SiteURL != "http://localhost:5173" {
		t.Fatalf("payload site_url=%s", payload.SiteURL)
	}
}

package service

import (
	"encoding/json"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/model"
)

// EnrichFriendLinksLogos 为缺少 LOGO 的已发布友链，从已通过申请中按 URL 回填
func EnrichFriendLinksLogos(links []FriendLink) []FriendLink {
	if len(links) == 0 {
		return links
	}
	needKeys := make(map[string]int)
	for i, l := range links {
		if strings.TrimSpace(l.Logo) != "" {
			continue
		}
		key := friendLinkURLKey(l.URL)
		if key == "" {
			continue
		}
		needKeys[key] = i
	}
	if len(needKeys) == 0 {
		return links
	}

	var applies []model.FriendLinkApply
	_ = model.DB.
		Where("status = ? AND logo <> ''", model.FriendLinkApplyStatusApproved).
		Order("id DESC").
		Find(&applies).Error

	logoByURL := make(map[string]string, len(applies))
	for _, a := range applies {
		key := friendLinkURLKey(a.URL)
		if key == "" {
			continue
		}
		if _, ok := logoByURL[key]; ok {
			continue
		}
		logo := normalizeFriendLinkLogoOptional(a.Logo)
		if logo != "" {
			logoByURL[key] = logo
		}
	}
	if len(logoByURL) == 0 {
		return links
	}

	out := make([]FriendLink, len(links))
	copy(out, links)
	for key, idx := range needKeys {
		if logo, ok := logoByURL[key]; ok {
			out[idx].Logo = logo
		}
	}
	return out
}

func friendLinksLogoSnapshot(links []FriendLink) string {
	type snap struct {
		URL  string `json:"url"`
		Logo string `json:"logo"`
	}
	items := make([]snap, len(links))
	for i, l := range links {
		items[i] = snap{URL: friendLinkURLKey(l.URL), Logo: strings.TrimSpace(l.Logo)}
	}
	b, _ := json.Marshal(items)
	return string(b)
}

// maybePersistEnrichedFriendLinks 若回填产生新 LOGO，写回 site_friend_links
func (s *ForumSettingsService) maybePersistEnrichedFriendLinks(enriched []FriendLink) error {
	raw := s.getString(SettingSiteFriendLinks, "[]")
	before := parseFriendLinksJSON(raw)
	if friendLinksLogoSnapshot(before) == friendLinksLogoSnapshot(enriched) {
		return nil
	}
	normalized, err := normalizeFriendLinks(enriched)
	if err != nil {
		return err
	}
	linksJSON, err := json.Marshal(normalized)
	if err != nil {
		return err
	}
	return s.setString(SettingSiteFriendLinks, string(linksJSON))
}

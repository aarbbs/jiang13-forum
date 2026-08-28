package services

import "testing"

func TestNormalizeAsideWidgetsPreservesOrder(t *testing.T) {
	in := []AsideWidget{
		{ID: AsideWidgetFriendLinks, Enabled: true},
		{ID: AsideWidgetTagCloud, Enabled: true},
		{ID: AsideWidgetRecentComments, Enabled: false},
	}
	out := NormalizeAsideWidgets(in)
	if len(out) != 4 {
		t.Fatalf("want 4 widgets, got %d", len(out))
	}
	want := []string{AsideWidgetFriendLinks, AsideWidgetTagCloud, AsideWidgetRecentComments, AsideWidgetRecentUsers}
	for i, id := range want {
		if out[i].ID != id {
			t.Fatalf("index %d: want %s, got %s", i, id, out[i].ID)
		}
	}
	if !out[0].Enabled || !out[1].Enabled || out[2].Enabled || out[3].Enabled {
		t.Fatalf("enabled flags mismatch: %+v", out)
	}
}

func TestAsideBoolsFromWidgets(t *testing.T) {
	widgets := []AsideWidget{
		{ID: AsideWidgetRecentComments, Enabled: true},
		{ID: AsideWidgetFriendLinks, Enabled: false},
		{ID: AsideWidgetTagCloud, Enabled: true},
		{ID: AsideWidgetRecentUsers, Enabled: true},
	}
	bools := asideBoolsFromWidgets(widgets)
	if !bools.tagCloud || !bools.recentComments || bools.friendLinks {
		t.Fatalf("unexpected bools: %+v", bools)
	}
}

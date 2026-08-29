package web

import (
	"testing"

	"git.iioio.com/freefire/jiang13-forum/services"
)

func TestMoveAsideWidget(t *testing.T) {
	base := []services.AsideWidget{
		{ID: services.AsideWidgetTagCloud, Enabled: true},
		{ID: services.AsideWidgetRecentComments, Enabled: false},
		{ID: services.AsideWidgetRecentUsers, Enabled: false},
		{ID: services.AsideWidgetFriendLinks, Enabled: true},
	}

	up := moveAsideWidget(append([]services.AsideWidget(nil), base...), "up:"+services.AsideWidgetRecentComments)
	if up[0].ID != services.AsideWidgetRecentComments || up[1].ID != services.AsideWidgetTagCloud {
		t.Fatalf("up move failed: %+v", up)
	}

	down := moveAsideWidget(append([]services.AsideWidget(nil), base...), "down:"+services.AsideWidgetTagCloud)
	if down[0].ID != services.AsideWidgetRecentComments || down[1].ID != services.AsideWidgetTagCloud {
		t.Fatalf("down move failed: %+v", down)
	}

	noop := moveAsideWidget(append([]services.AsideWidget(nil), base...), "up:"+services.AsideWidgetTagCloud)
	if noop[0].ID != services.AsideWidgetTagCloud {
		t.Fatalf("top up should noop: %+v", noop)
	}
}

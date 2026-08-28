package service

import (
	"strings"
	"testing"
)

func TestRedactReplyOnlyHTML(t *testing.T) {
	in := `<p>公开</p><reply-only><p>秘密答案</p></reply-only>`
	out := RedactReplyOnlyHTML(in)
	if strings.Contains(out, "秘密答案") {
		t.Fatalf("不应保留回复可见正文，得到: %q", out)
	}
	if !strings.Contains(out, `data-locked="true"`) || !strings.Contains(out, "reply-only") {
		t.Fatalf("应保留锁定壳，得到: %q", out)
	}
	if !strings.Contains(out, "公开") {
		t.Fatalf("不应误删公开段落，得到: %q", out)
	}
}

func TestRedactGatedPostHTML(t *testing.T) {
	in := `<members-only><p>登录密</p></members-only><reply-only><p>回复密</p></reply-only>`
	out := RedactGatedPostHTML(in)
	if strings.Contains(out, "登录密") || strings.Contains(out, "回复密") {
		t.Fatalf("门控正文应被遮盖，得到: %q", out)
	}
}

func TestUnwrapContentGateTags(t *testing.T) {
	in := `<p>公开</p>` +
		`<members-only data-gate="login"><p>登录密</p></members-only>` +
		`<reply-only data-gate="reply"><p>回复密</p></reply-only>` +
		`<points-only data-gate="points" data-cost="10"><p>积分密</p></points-only>`
	out := UnwrapContentGateTags(in)
	for _, tag := range []string{"members-only", "reply-only", "points-only"} {
		if strings.Contains(out, tag) {
			t.Fatalf("应剥离 %s 外壳，得到: %q", tag, out)
		}
	}
	for _, want := range []string{"公开", "登录密", "回复密", "积分密"} {
		if !strings.Contains(out, want) {
			t.Fatalf("应保留内部正文 %q，得到: %q", want, out)
		}
	}
}

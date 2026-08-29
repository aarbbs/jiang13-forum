package services

import "testing"

func TestCaptchaGenerateAndVerify(t *testing.T) {
	s := NewCaptchaService()
	id, svg, err := s.Generate()
	if err != nil {
		t.Fatal(err)
	}
	if id == "" || len(svg) < 20 {
		t.Fatalf("bad captcha output id=%q svgLen=%d", id, len(svg))
	}
	s.mu.Lock()
	ans := s.entries[id].answer
	s.mu.Unlock()
	if ans == "" {
		t.Fatal("empty stored answer")
	}
	if !s.Verify(id, ans) {
		t.Fatalf("correct answer %q should pass", ans)
	}
	if s.Verify(id, ans) {
		t.Fatal("captcha should be one-time")
	}

	id2, _, err := s.Generate()
	if err != nil {
		t.Fatal(err)
	}
	if s.Verify(id2, "XXXX") {
		t.Fatal("wrong answer should fail")
	}
}

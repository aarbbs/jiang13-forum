package services

import (
	"reflect"
	"testing"
)

func TestExtractMentionNames(t *testing.T) {
	got := ExtractMentionNames("hi @alice 和 @小明_x 以及 @bob-1")
	want := []string{"alice", "小明_x", "bob-1"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v, want %#v", got, want)
	}
}

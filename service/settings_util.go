package service

import (
	"strings"
	"unicode/utf8"
)

func runeLen(s string) int {
	return utf8.RuneCountInString(s)
}

func trimRunes(s string) string {
	return strings.TrimSpace(s)
}

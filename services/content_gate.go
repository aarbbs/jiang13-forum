package services

import "git.iioio.com/freefire/jiang13-forum/models"

// ApplyPostContentGates 按观众身份对帖文 HTML 做门控遮盖（消毒 + members/reply/points）
func ApplyPostContentGates(content string, post *models.Post, viewerID uint, isAdmin bool, hasReplied bool) string {
	content = SanitizePostHTML(content)
	if viewerID == 0 {
		content = RedactMembersOnlyHTML(content)
		content = RedactReplyOnlyHTML(content)
	} else if !isAdmin && post.UserID != viewerID && !hasReplied {
		content = RedactReplyOnlyHTML(content)
	}
	if isAdmin || post.UserID == viewerID {
		content = RevealAllPointsOnly(content)
	} else {
		unlocked, _ := ListUnlockedKeys(viewerID, post.ID)
		content = RedactPointsOnlyHTML(content, unlocked)
	}
	return content
}

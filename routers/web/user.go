package web

import (
	"net/http"
	"strconv"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/models"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

type userPublicData struct {
	PageChrome
	UserID        uint
	Username      string
	Nickname      string
	Signature     string
	Avatar        string
	Level         int
	Exp           int
	Points        int
	PostCount     int64
	CommentCount  int64
	FavoriteCount int64
	LikeReceived  int64
	IsSelf        bool
	Posts         []PostListItem
	Page          int
	PrevPage      int
	NextPage      int
	HasPrev       bool
	HasMore       bool
}

// UserPublic 公开用户主页（不含邮箱）
func (d Deps) UserPublic(c *gin.Context) {
	ctx := d.ctx(c)
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		d.render404(ctx)
		return
	}
	user, err := d.User.GetByID(uint(id))
	if err != nil {
		d.render404(ctx)
		return
	}
	st, _ := d.User.ActivityStats(user.ID)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	size := d.Settings.PageSizeDefault()
	posts, total, _ := d.Post.List(services.PostListQuery{
		UserID:        user.ID,
		Page:          page,
		Size:          size,
		Sort:          "latest",
		ViewerID:      ctx.UserID(),
		ViewerIsAdmin: ctx.IsAdmin(),
	})
	items := make([]PostListItem, 0, len(posts))
	for _, p := range posts {
		board := ""
		if p.Board.ID > 0 {
			board = p.Board.Name
		}
		items = append(items, PostListItem{
			ID: p.ID, Title: p.Title, AuthorName: displayName(user),
			BoardName: board, Pinned: p.Pinned || p.BoardPinned, Featured: p.Featured,
			CreatedLabel: formatTime(p.CreatedAt),
		})
	}
	nick := displayName(user)
	chrome := d.chrome(ctx, nick+" · "+d.Settings.SiteBranding().Name, strings.TrimSpace(user.Signature), "")
	hasMore := int64(page*size) < total
	ctx.HTML(http.StatusOK, "user/view", userPublicData{
		PageChrome: chrome,
		UserID:     user.ID,
		Username:   user.Username,
		Nickname:   user.Nickname,
		Signature:  user.Signature,
		Avatar:     user.Avatar,
		Level:      models.LevelFromExp(user.Exp),
		Exp:        user.Exp,
		Points:     user.Points,
		PostCount:  st.PostCount, CommentCount: st.CommentCount,
		FavoriteCount: st.FavoriteCount, LikeReceived: st.LikeReceived,
		IsSelf: ctx.UserID() == user.ID,
		Posts:  items,
		Page:   page, PrevPage: page - 1, NextPage: page + 1,
		HasPrev: page > 1, HasMore: hasMore,
	})
}

func displayName(u *models.User) string {
	if u == nil {
		return ""
	}
	n := strings.TrimSpace(u.Nickname)
	if n == "" {
		return u.Username
	}
	return n
}

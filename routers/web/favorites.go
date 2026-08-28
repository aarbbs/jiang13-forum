package web

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type favItem struct {
	PostID       uint
	Title        string
	AuthorName   string
	BoardName    string
	CreatedLabel string
}

type favoritesData struct {
	PageChrome
	Items    []favItem
	Page     int
	PrevPage int
	NextPage int
	HasPrev  bool
	HasMore  bool
	Total    int64
}

// FavoritesGet 我的收藏
func (d Deps) FavoritesGet(c *gin.Context) {
	ctx := d.ctx(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	size := d.Settings.PageSizeDefault()
	favs, total, err := d.Post.ListFavorites(ctx.UserID(), page, size)
	if err != nil {
		chrome := d.chrome(ctx, "收藏 · "+d.Settings.SiteBranding().Name, "", "")
		chrome.Error = err.Error()
		ctx.HTML(http.StatusOK, "favorites/list", favoritesData{PageChrome: chrome})
		return
	}
	items := make([]favItem, 0, len(favs))
	for _, f := range favs {
		title := f.Post.Title
		author := strings.TrimSpace(f.Post.User.Nickname)
		if author == "" {
			author = f.Post.User.Username
		}
		board := ""
		if f.Post.Board.ID > 0 {
			board = f.Post.Board.Name
		}
		items = append(items, favItem{
			PostID: f.PostID, Title: title, AuthorName: author, BoardName: board,
			CreatedLabel: formatTime(f.CreatedAt),
		})
	}
	chrome := d.chrome(ctx, "收藏 · "+d.Settings.SiteBranding().Name, "", "")
	hasMore := int64(page*size) < total
	ctx.HTML(http.StatusOK, "favorites/list", favoritesData{
		PageChrome: chrome,
		Items:      items,
		Page:       page, PrevPage: page - 1, NextPage: page + 1,
		HasPrev: page > 1, HasMore: hasMore, Total: total,
	})
}

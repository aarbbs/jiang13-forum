package web

import (
	"net/http"

	"git.iioio.com/freefire/jiang13-forum/modules/webctx"
	"github.com/gin-gonic/gin"
)

type boardsItemView struct {
	ID          uint
	Name        string
	Href        string
	Description string
	Icon        string
	ColorIndex  int
	PostCount   int
}

type boardsPageData struct {
	PageChrome
	Items []boardsItemView
}

// BoardsGet 公开板块索引
func (d Deps) BoardsGet(c *gin.Context) {
	ctx := d.ctx(c)
	d.renderBoards(ctx)
}

func (d Deps) renderBoards(ctx *webctx.Context) {
	brand := d.Settings.SiteBranding()
	chrome := d.chrome(ctx, "板块 · "+brand.Name, "", "")
	list, _ := d.Board.ListWithStats()
	items := make([]boardsItemView, 0, len(list))
	pl := d.permalink()
	for _, b := range list {
		color := b.ColorIndex
		if color < 0 {
			color = int(b.ID % 8)
		}
		items = append(items, boardsItemView{
			ID:          b.ID,
			Name:        b.Name,
			Href:        pl.BoardPath(b.ID),
			Description: b.Description,
			Icon:        b.Icon,
			ColorIndex:  color,
			PostCount:   b.PostCount,
		})
	}
	ctx.HTML(http.StatusOK, "boards/list", boardsPageData{
		PageChrome: chrome,
		Items:      items,
	})
}

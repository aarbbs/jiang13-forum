package api

import (
	"net/http"

	"git.iioio.com/freefire/jiang13-forum/config"
	"git.iioio.com/freefire/jiang13-forum/modules/auth"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

// Handlers 本分支仅挂载机器入口（health / SEO / thumb / OIDC）。
// 论坛 CRUD JSON 已删除，对照见 main 与 docs/rebuild-spec/04-api.md。
type Handlers struct {
	Cfg      *config.Config
	Settings *services.ForumSettingsService
	Board    *services.BoardService
	Post     *services.PostService
	OIDC     *services.OIDCService
}

func (h *Handlers) currentUserID(c *gin.Context) uint {
	if v, ok := c.Get(auth.CtxUserID); ok {
		return v.(uint)
	}
	return 0
}

// APIHealth 探活
func (h *Handlers) APIHealth(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

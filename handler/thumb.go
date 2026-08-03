package handler

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"git.iioio.com/freefire/jiang13-forum/service"
)

// ServeImageThumb 帖子图片缩略图（按需生成并缓存）
// GET /media/thumb/posts/xxx.webp → 最长边 1280 的 WebP 预览
func (h *Handlers) ServeImageThumb(c *gin.Context) {
	rel := strings.TrimPrefix(c.Param("filepath"), "/")
	uploadsRoot := filepath.Join(h.Cfg.DataDir, "uploads")
	thumbPath, err := service.EnsureUploadThumb(uploadsRoot, rel)
	if err != nil {
		// 生成失败时回退原图，避免正文裂图
		orig := filepath.Join(uploadsRoot, filepath.FromSlash(rel))
		if st, e := os.Stat(orig); e == nil && !st.IsDir() {
			c.Header("Cache-Control", "public, max-age=3600")
			c.File(orig)
			return
		}
		c.Status(http.StatusNotFound)
		return
	}
	c.Header("Cache-Control", "public, max-age=604800, immutable")
	c.File(thumbPath)
}

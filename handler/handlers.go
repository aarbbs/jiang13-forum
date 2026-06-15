package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"git.iioio.com/freefire/jiang13-forum/config"
	"git.iioio.com/freefire/jiang13-forum/middleware"
	"git.iioio.com/freefire/jiang13-forum/model"
	"git.iioio.com/freefire/jiang13-forum/service"
)

// Handlers 聚合所有 HTTP 处理器
type Handlers struct {
	Cfg      *config.Config
	Auth     *service.AuthService
	User     *service.UserService
	Board    *service.BoardService
	Post     *service.PostService
	Comment  *service.CommentService
	Backup   *service.BackupService
	Filter   *service.SensitiveFilter
	Limiter  *service.RateLimiter
	Online   *service.OnlineService
	Settings *service.ForumSettingsService
}

func (h *Handlers) setAuthCookie(c *gin.Context, token string) {
	c.SetCookie(middleware.CookieName, token, int(service.TokenExpire.Seconds()), "/", "", false, true)
}

func (h *Handlers) currentUserID(c *gin.Context) uint {
	if v, ok := c.Get(middleware.CtxUserID); ok {
		return v.(uint)
	}
	return 0
}

func (h *Handlers) isAdmin(c *gin.Context) bool {
	if v, ok := c.Get(middleware.CtxRole); ok {
		return v == model.RoleAdmin
	}
	return false
}

func (h *Handlers) parseGuestCommentIDs(c *gin.Context) []uint {
	raw := c.Query("my_ids")
	if raw == "" {
		return nil
	}
	var ids []uint
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		v, err := strconv.ParseUint(part, 10, 64)
		if err == nil && v > 0 {
			ids = append(ids, uint(v))
		}
	}
	return ids
}

func (h *Handlers) pageData(c *gin.Context, title string, data gin.H) gin.H {
	if data == nil {
		data = gin.H{}
	}
	data["Title"] = title
	data["SiteName"] = "姜十三论坛"
	data["SiteEN"] = "Jiang13 Forum"
	if uid := h.currentUserID(c); uid > 0 {
		data["CurrentUserID"] = uid
		if u, err := h.User.GetByID(uid); err == nil {
			data["CurrentUser"] = u
		}
	}
	data["IsAdmin"] = h.isAdmin(c)
	return data
}

// --- 页面路由 ---

func (h *Handlers) IndexPage(c *gin.Context) {
	boards, _ := h.Board.List()
	posts, _, _ := h.Post.List(service.PostListQuery{Page: 1, Size: 10})
	c.HTML(http.StatusOK, "index.html", h.pageData(c, "首页", gin.H{
		"Boards": boards, "Posts": posts,
	}))
}

func (h *Handlers) LoginPage(c *gin.Context) {
	c.HTML(http.StatusOK, "login.html", h.pageData(c, "登录", nil))
}

func (h *Handlers) RegisterPage(c *gin.Context) {
	c.HTML(http.StatusOK, "register.html", h.pageData(c, "注册", nil))
}

func (h *Handlers) BoardPage(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	board, err := h.Board.GetByID(uint(id))
	if err != nil {
		c.HTML(http.StatusNotFound, "error.html", h.pageData(c, "板块不存在", gin.H{"Message": "板块不存在"}))
		return
	}
	posts, total, _ := h.Post.List(service.PostListQuery{BoardID: uint(id), Page: page, Size: 20})
	c.HTML(http.StatusOK, "board.html", h.pageData(c, board.Name, gin.H{
		"Board": board, "Posts": posts, "Total": total, "Page": page,
	}))
}

func (h *Handlers) PostPage(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	post, err := h.Post.GetByID(uint(id))
	if err != nil {
		c.HTML(http.StatusNotFound, "error.html", h.pageData(c, "帖子不存在", gin.H{"Message": "帖子不存在"}))
		return
	}
	comments, _ := h.Comment.ListByPost(uint(id), h.currentUserID(c), h.isAdmin(c), post.UserID, nil)
	uid := h.currentUserID(c)
	c.HTML(http.StatusOK, "post.html", h.pageData(c, post.Title, gin.H{
		"Post": post, "Comments": comments,
		"Liked": h.Post.IsLiked(uid, uint(id)),
		"Favorited": h.Post.IsFavorited(uid, uint(id)),
	}))
}

func (h *Handlers) PostNewPage(c *gin.Context) {
	boards, _ := h.Board.List()
	c.HTML(http.StatusOK, "post_new.html", h.pageData(c, "发帖", gin.H{"Boards": boards}))
}

func (h *Handlers) PostEditPage(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	post, err := h.Post.FindByID(uint(id))
	if err != nil || (!h.isAdmin(c) && post.UserID != h.currentUserID(c)) {
		c.Redirect(http.StatusFound, "/")
		return
	}
	c.HTML(http.StatusOK, "post_edit.html", h.pageData(c, "编辑帖子", gin.H{"Post": post}))
}

func (h *Handlers) ProfilePage(c *gin.Context) {
	user, _ := h.User.GetByID(h.currentUserID(c))
	c.HTML(http.StatusOK, "profile.html", h.pageData(c, "个人主页", gin.H{"ProfileUser": user}))
}

func (h *Handlers) UserProfilePage(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	user, err := h.User.GetByID(uint(id))
	if err != nil {
		c.HTML(http.StatusNotFound, "error.html", h.pageData(c, "用户不存在", gin.H{"Message": "用户不存在"}))
		return
	}
	c.HTML(http.StatusOK, "user_profile.html", h.pageData(c, user.Nickname, gin.H{"ProfileUser": user}))
}

func (h *Handlers) FavoritesPage(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	favs, total, _ := h.Post.ListFavorites(h.currentUserID(c), page, 20)
	c.HTML(http.StatusOK, "favorites.html", h.pageData(c, "我的收藏", gin.H{
		"Favorites": favs, "Total": total, "Page": page,
	}))
}

// --- API ---

func (h *Handlers) APIRegister(c *gin.Context) {
	var req struct {
		Username string `json:"username" form:"username" binding:"required"`
		Password string `json:"password" form:"password" binding:"required"`
		Nickname string `json:"nickname" form:"nickname"`
	}
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	user, err := h.Auth.Register(req.Username, req.Password, req.Nickname)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	token, _, _ := h.Auth.Login(req.Username, req.Password)
	h.setAuthCookie(c, token)
	c.JSON(http.StatusOK, gin.H{"message": "注册成功", "user_id": user.ID})
}

func (h *Handlers) APILogin(c *gin.Context) {
	var req struct {
		Username string `json:"username" form:"username" binding:"required"`
		Password string `json:"password" form:"password" binding:"required"`
	}
	if err := c.ShouldBind(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}
	token, user, err := h.Auth.Login(req.Username, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	h.setAuthCookie(c, token)
	c.JSON(http.StatusOK, gin.H{"message": "登录成功", "user": gin.H{"id": user.ID, "nickname": user.Nickname}})
}

func (h *Handlers) APILogout(c *gin.Context) {
	c.SetCookie(middleware.CookieName, "", -1, "/", "", false, true)
	c.JSON(http.StatusOK, gin.H{"message": "已退出"})
}

func (h *Handlers) APIUpdateProfile(c *gin.Context) {
	nickname := c.PostForm("nickname")
	if err := h.User.UpdateNickname(h.currentUserID(c), nickname); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, _ := h.User.GetByID(h.currentUserID(c))
	c.JSON(http.StatusOK, gin.H{"message": "昵称已更新", "user": user})
}

func (h *Handlers) APIUpdatePassword(c *gin.Context) {
	oldPass := c.PostForm("old_password")
	newPass := c.PostForm("new_password")
	if err := h.User.UpdatePassword(h.currentUserID(c), oldPass, newPass); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "密码已修改"})
}

func (h *Handlers) APIUploadAvatar(c *gin.Context) {
	file, err := c.FormFile("avatar")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择头像文件"})
		return
	}
	maxBytes := int64(h.Settings.AvatarMaxMB()) * 1024 * 1024
	if file.Size > maxBytes {
		c.JSON(http.StatusBadRequest, gin.H{"error": "头像文件过大"})
		return
	}
	url, err := h.User.UploadAvatar(h.currentUserID(c), file, h.Cfg.UploadDir())
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "头像已更新", "avatar": url})
}

func (h *Handlers) APIUploadPostImage(c *gin.Context) {
	file, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择图片文件"})
		return
	}
	uid := h.currentUserID(c)
	url, err := service.SaveUploadedImage(
		file,
		h.Cfg.PostImageUploadDir(),
		"/uploads/posts",
		fmt.Sprintf("%d", uid),
	)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "图片已上传", "url": url})
}

func (h *Handlers) APICreatePost(c *gin.Context) {
	boardID, _ := strconv.ParseUint(c.PostForm("board_id"), 10, 64)
	title := c.PostForm("title")
	content := c.PostForm("content")
	tags := c.PostForm("tags")
	post, err := h.Post.Create(h.currentUserID(c), uint(boardID), title, content, tags)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "发帖成功", "post_id": post.ID})
}

func (h *Handlers) APIUpdatePost(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	err := h.Post.Update(h.currentUserID(c), uint(id), h.isAdmin(c),
		c.PostForm("title"), c.PostForm("content"), c.PostForm("tags"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "帖子已更新"})
}

func (h *Handlers) APIDeletePost(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.Post.Delete(h.currentUserID(c), uint(id), h.isAdmin(c)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "帖子已删除"})
}

func (h *Handlers) APIToggleLike(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	liked, err := h.Post.ToggleLike(h.currentUserID(c), uint(id))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var post model.Post
	model.DB.First(&post, id)
	c.JSON(http.StatusOK, gin.H{"liked": liked, "like_count": post.LikeCount})
}

func (h *Handlers) APIToggleFavorite(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	faved, err := h.Post.ToggleFavorite(h.currentUserID(c), uint(id))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"favorited": faved})
}

func (h *Handlers) APICreateComment(c *gin.Context) {
	postID, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	content := c.PostForm("content")
	var replyTo *uint
	if rt := c.PostForm("reply_to"); rt != "" {
		v, _ := strconv.ParseUint(rt, 10, 64)
		u := uint(v)
		replyTo = &u
	}
	isPrivate := c.PostForm("is_private") == "1" || c.PostForm("is_private") == "true"
	uid := h.currentUserID(c)

	in := service.CommentCreateInput{
		UserID:    uid,
		PostID:    uint(postID),
		Content:   content,
		ReplyTo:   replyTo,
		IsPrivate: isPrivate,
	}
	if uid == 0 {
		in.GuestNick = c.PostForm("guest_nick")
		in.GuestEmail = c.PostForm("guest_email")
		in.GuestURL = c.PostForm("guest_url")
	}

	comment, err := h.Comment.Create(in)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "评论成功", "floor": comment.Floor, "id": comment.ID})
}

func (h *Handlers) APIDeleteComment(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	if err := h.Comment.Delete(h.currentUserID(c), uint(id), h.isAdmin(c)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "评论已删除"})
}

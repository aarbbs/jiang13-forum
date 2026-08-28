package handler

import (
	"encoding/base64"
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"git.iioio.com/freefire/jiang13-forum/middleware"
	"git.iioio.com/freefire/jiang13-forum/service"
)

// OIDCDiscovery OpenID Provider 元数据
func (h *Handlers) OIDCDiscovery(c *gin.Context) {
	if h.OIDC == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "OIDC 未启用"})
		return
	}
	doc, err := h.OIDC.Discovery()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, doc)
}

// OIDCJWKS JSON Web Key Set
func (h *Handlers) OIDCJWKS(c *gin.Context) {
	if h.OIDC == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "OIDC 未启用"})
		return
	}
	doc, err := h.OIDC.JWKS()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, doc)
}

// OIDCAuthorize 授权端点：已登录则静默发码；未登录跳转论坛登录
func (h *Handlers) OIDCAuthorize(c *gin.Context) {
	if h.OIDC == nil || !h.OIDC.Enabled() {
		c.String(http.StatusServiceUnavailable, "OIDC 未配置，请在管理后台「系统设置 → OIDC / SSO」启用并创建 OAuth 应用")
		return
	}

	req := service.AuthorizeRequest{
		ClientID:            c.Query("client_id"),
		RedirectURI:         c.Query("redirect_uri"),
		ResponseType:        c.Query("response_type"),
		Scope:               c.Query("scope"),
		State:               c.Query("state"),
		Nonce:               c.Query("nonce"),
		CodeChallenge:       c.Query("code_challenge"),
		CodeChallengeMethod: c.Query("code_challenge_method"),
	}

	if err := h.OIDC.ValidateAuthorize(req); err != nil {
		// redirect_uri 未通过校验时不能重定向，避免开放重定向
		if errors.Is(err, service.ErrOIDCInvalidRedirect) || errors.Is(err, service.ErrOIDCInvalidClient) {
			c.String(http.StatusBadRequest, err.Error())
			return
		}
		h.oidcErrorRedirect(c, req.RedirectURI, req.State, "invalid_request", err.Error())
		return
	}

	uid := h.currentUserID(c)
	if uid == 0 {
		from := c.Request.URL.RequestURI()
		c.Redirect(http.StatusFound, "/login?from="+url.QueryEscape(from))
		return
	}

	callback, err := h.OIDC.IssueAuthCode(uid, req)
	if err != nil {
		if errors.Is(err, service.ErrOIDCUserBanned) {
			h.oidcErrorRedirect(c, req.RedirectURI, req.State, "access_denied", "账号已被禁言")
			return
		}
		h.oidcErrorRedirect(c, req.RedirectURI, req.State, "server_error", err.Error())
		return
	}
	c.Redirect(http.StatusFound, callback)
}

func (h *Handlers) oidcErrorRedirect(c *gin.Context, redirectURI, state, code, desc string) {
	if redirectURI == "" {
		c.String(http.StatusBadRequest, desc)
		return
	}
	u, err := url.Parse(redirectURI)
	if err != nil {
		c.String(http.StatusBadRequest, desc)
		return
	}
	q := u.Query()
	q.Set("error", code)
	q.Set("error_description", desc)
	if state != "" {
		q.Set("state", state)
	}
	u.RawQuery = q.Encode()
	c.Redirect(http.StatusFound, u.String())
}

// OIDCToken 令牌端点
func (h *Handlers) OIDCToken(c *gin.Context) {
	if h.OIDC == nil || !h.OIDC.Enabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "temporarily_unavailable", "error_description": "OIDC 未配置"})
		return
	}

	clientID, clientSecret := c.PostForm("client_id"), c.PostForm("client_secret")
	if clientID == "" && clientSecret == "" {
		if id, secret, ok := parseBasicAuth(c.GetHeader("Authorization")); ok {
			clientID, clientSecret = id, secret
		}
	}

	resp, err := h.OIDC.ExchangeCode(service.TokenRequest{
		GrantType:    c.PostForm("grant_type"),
		Code:         c.PostForm("code"),
		RedirectURI:  c.PostForm("redirect_uri"),
		ClientID:     clientID,
		ClientSecret: clientSecret,
		CodeVerifier: c.PostForm("code_verifier"),
	})
	if err != nil {
		status := http.StatusBadRequest
		code := "invalid_grant"
		switch {
		case errors.Is(err, service.ErrOIDCInvalidClient):
			status = http.StatusUnauthorized
			code = "invalid_client"
		case errors.Is(err, service.ErrOIDCInvalidRequest):
			code = "invalid_request"
		case errors.Is(err, service.ErrOIDCPKCEFailed):
			code = "invalid_grant"
		}
		c.JSON(status, gin.H{"error": code, "error_description": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// OIDCUserInfo 用户信息端点
func (h *Handlers) OIDCUserInfo(c *gin.Context) {
	if h.OIDC == nil || !h.OIDC.Enabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "OIDC 未配置"})
		return
	}
	token := extractBearer(c)
	if token == "" {
		c.Header("WWW-Authenticate", `Bearer`)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_token"})
		return
	}
	info, err := h.OIDC.UserInfo(token)
	if err != nil {
		c.Header("WWW-Authenticate", `Bearer error="invalid_token"`)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid_token"})
		return
	}
	c.JSON(http.StatusOK, info)
}

// OIDCLogout RP-Initiated Logout：清除论坛会话并可选跳回客户端
func (h *Handlers) OIDCLogout(c *gin.Context) {
	postLogout := c.Query("post_logout_redirect_uri")
	if postLogout == "" {
		postLogout = c.PostForm("post_logout_redirect_uri")
	}
	state := c.Query("state")
	if state == "" {
		state = c.PostForm("state")
	}

	c.SetCookie(middleware.CookieName, "", -1, "/", "", false, true)

	if h.OIDC == nil {
		c.Redirect(http.StatusFound, "/")
		return
	}
	target, err := h.OIDC.ResolveLogoutRedirect(postLogout, state)
	if err != nil {
		c.String(http.StatusBadRequest, err.Error())
		return
	}
	c.Redirect(http.StatusFound, target)
}

func extractBearer(c *gin.Context) string {
	auth := c.GetHeader("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
	}
	return c.Query("access_token")
}

func parseBasicAuth(header string) (user, pass string, ok bool) {
	const prefix = "Basic "
	if !strings.HasPrefix(header, prefix) {
		return "", "", false
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimSpace(header[len(prefix):]))
	if err != nil {
		return "", "", false
	}
	parts := strings.SplitN(string(raw), ":", 2)
	if len(parts) != 2 {
		return "", "", false
	}
	// client_id / client_secret 可能被 URL 编码
	uid, err1 := url.QueryUnescape(parts[0])
	sec, err2 := url.QueryUnescape(parts[1])
	if err1 != nil || err2 != nil {
		return parts[0], parts[1], true
	}
	return uid, sec, true
}

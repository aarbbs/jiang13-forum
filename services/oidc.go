package services

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"git.iioio.com/freefire/jiang13-forum/config"
	"git.iioio.com/freefire/jiang13-forum/models"
)

const (
	oidcAuthCodeTTL    = 5 * time.Minute
	oidcAccessTokenTTL = time.Hour
	oidcIDTokenTTL     = time.Hour
	oidcRSABits        = 2048
	oidcKeyID          = "jiang13-oidc-1"
)

var (
	ErrOIDCNotConfigured   = errors.New("OIDC 未配置（请在管理后台启用并至少创建一个 OAuth 应用）")
	ErrOIDCInvalidClient   = errors.New("无效的 client_id 或 client_secret")
	ErrOIDCInvalidRedirect = errors.New("redirect_uri 未登记")
	ErrOIDCInvalidRequest  = errors.New("授权请求参数无效")
	ErrOIDCInvalidGrant    = errors.New("授权码无效或已过期")
	ErrOIDCInvalidToken    = errors.New("access_token 无效")
	ErrOIDCUserBanned      = errors.New("账号已被禁言，无法授权")
	ErrOIDCPKCEFailed      = errors.New("PKCE 校验失败")
	ErrOIDCInvalidLogout   = errors.New("post_logout_redirect_uri 未登记")
)

// OIDCService 论坛作为 OpenID Connect Provider
type OIDCService struct {
	cfg      *config.Config
	settings *ForumSettingsService

	mu         sync.RWMutex
	privateKey *rsa.PrivateKey
}

// NewOIDCService 创建并加载/生成 RSA 密钥
func NewOIDCService(cfg *config.Config, settings *ForumSettingsService) (*OIDCService, error) {
	s := &OIDCService{cfg: cfg, settings: settings}
	if err := s.loadOrCreateKey(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *OIDCService) runtime() OIDCConfig {
	if s.settings != nil {
		return s.settings.OIDCConfig()
	}
	return OIDCConfig{}
}

func (s *OIDCService) loadOrCreateKey() error {
	keyPath := filepath.Join(s.cfg.DataDir, ".oidc_rsa.pem")
	if data, err := os.ReadFile(keyPath); err == nil && len(data) > 0 {
		block, _ := pem.Decode(data)
		if block == nil {
			return fmt.Errorf("解析 OIDC RSA 密钥失败")
		}
		key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
		if err != nil {
			parsed, err2 := x509.ParsePKCS8PrivateKey(block.Bytes)
			if err2 != nil {
				return fmt.Errorf("解析 OIDC RSA 密钥失败: %w", err)
			}
			var ok bool
			key, ok = parsed.(*rsa.PrivateKey)
			if !ok {
				return fmt.Errorf("OIDC 密钥不是 RSA")
			}
		}
		s.privateKey = key
		return nil
	}

	key, err := rsa.GenerateKey(rand.Reader, oidcRSABits)
	if err != nil {
		return fmt.Errorf("生成 OIDC RSA 密钥失败: %w", err)
	}
	pemBytes := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})
	if err := os.WriteFile(keyPath, pemBytes, 0600); err != nil {
		return fmt.Errorf("写入 OIDC RSA 密钥失败: %w", err)
	}
	s.privateKey = key
	return nil
}

// Enabled 是否可对外提供 OIDC
func (s *OIDCService) Enabled() bool {
	return s.runtime().Ready
}

// Issuer 返回 OIDC issuer
func (s *OIDCService) Issuer() string {
	return s.runtime().RootURL
}

// Discovery 返回 OpenID Provider Metadata
func (s *OIDCService) Discovery() (map[string]any, error) {
	rt := s.runtime()
	if !rt.Ready {
		return nil, ErrOIDCNotConfigured
	}
	base := rt.RootURL
	return map[string]any{
		"issuer":                                base,
		"authorization_endpoint":                base + "/oauth/authorize",
		"token_endpoint":                        base + "/oauth/token",
		"userinfo_endpoint":                     base + "/oauth/userinfo",
		"jwks_uri":                              base + "/oauth/jwks",
		"end_session_endpoint":                  base + "/oauth/logout",
		"response_types_supported":              []string{"code"},
		"subject_types_supported":               []string{"public"},
		"id_token_signing_alg_values_supported": []string{"RS256"},
		"scopes_supported":                      []string{"openid", "profile", "email", "groups"},
		"token_endpoint_auth_methods_supported": []string{"client_secret_basic", "client_secret_post"},
		"claims_supported": []string{
			"sub", "name", "preferred_username", "email", "email_verified", "picture", "groups",
		},
		"code_challenge_methods_supported": []string{"S256", "plain"},
	}, nil
}

// JWKS 返回 JSON Web Key Set
func (s *OIDCService) JWKS() (map[string]any, error) {
	s.mu.RLock()
	key := s.privateKey
	s.mu.RUnlock()
	if key == nil {
		return nil, ErrOIDCNotConfigured
	}
	pub := key.PublicKey
	return map[string]any{
		"keys": []map[string]string{
			{
				"kty": "RSA",
				"use": "sig",
				"alg": "RS256",
				"kid": oidcKeyID,
				"n":   base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
				"e":   base64.RawURLEncoding.EncodeToString(bigIntBytes(pub.E)),
			},
		},
	}, nil
}

func bigIntBytes(e int) []byte {
	if e == 0 {
		return []byte{0}
	}
	var b []byte
	for v := e; v > 0; v >>= 8 {
		b = append([]byte{byte(v & 0xff)}, b...)
	}
	return b
}

// AuthorizeRequest 授权端点查询参数
type AuthorizeRequest struct {
	ClientID            string
	RedirectURI         string
	ResponseType        string
	Scope               string
	State               string
	Nonce               string
	CodeChallenge       string
	CodeChallengeMethod string
}

// ValidateAuthorize 校验授权请求（不要求已登录）
func (s *OIDCService) ValidateAuthorize(req AuthorizeRequest) error {
	rt := s.runtime()
	if !rt.Ready {
		return ErrOIDCNotConfigured
	}
	client, err := FindEnabledOAuthClient(req.ClientID)
	if err != nil {
		return ErrOIDCInvalidClient
	}
	if req.ResponseType != "code" {
		return ErrOIDCInvalidRequest
	}
	if !redirectAllowed(client.RedirectURIs, req.RedirectURI) {
		return ErrOIDCInvalidRedirect
	}
	if !hasScope(req.Scope, "openid") {
		return ErrOIDCInvalidRequest
	}
	if req.CodeChallenge != "" {
		m := strings.ToUpper(req.CodeChallengeMethod)
		if m == "" {
			m = "PLAIN"
		}
		if m != "S256" && m != "PLAIN" {
			return ErrOIDCInvalidRequest
		}
	}
	return nil
}

func hasScope(scope, want string) bool {
	for _, p := range strings.Fields(scope) {
		if p == want {
			return true
		}
	}
	return false
}

func redirectAllowed(redirectURIsCSV, uri string) bool {
	for _, allowed := range splitRedirectURIs(redirectURIsCSV) {
		if allowed == uri {
			return true
		}
	}
	return false
}

// IssueAuthCode 已登录用户签发授权码，返回带 code/state 的回调 URL
func (s *OIDCService) IssueAuthCode(userID uint, req AuthorizeRequest) (string, error) {
	if err := s.ValidateAuthorize(req); err != nil {
		return "", err
	}
	var user models.User
	if err := models.DB.First(&user, userID).Error; err != nil {
		return "", ErrOIDCInvalidRequest
	}
	if user.Banned {
		return "", ErrOIDCUserBanned
	}

	code, err := randomToken(32)
	if err != nil {
		return "", err
	}
	method := strings.ToUpper(req.CodeChallengeMethod)
	if req.CodeChallenge != "" && method == "" {
		method = "PLAIN"
	}
	rec := &models.OAuthAuthCode{
		Code:                code,
		ClientID:            req.ClientID,
		UserID:              user.ID,
		RedirectURI:         req.RedirectURI,
		Scope:               req.Scope,
		Nonce:               req.Nonce,
		CodeChallenge:       req.CodeChallenge,
		CodeChallengeMethod: method,
		ExpiresAt:           time.Now().Add(oidcAuthCodeTTL),
	}
	if err := models.DB.Create(rec).Error; err != nil {
		return "", err
	}

	u, err := url.Parse(req.RedirectURI)
	if err != nil {
		return "", ErrOIDCInvalidRedirect
	}
	q := u.Query()
	q.Set("code", code)
	if req.State != "" {
		q.Set("state", req.State)
	}
	u.RawQuery = q.Encode()
	return u.String(), nil
}

// TokenRequest 换票请求
type TokenRequest struct {
	GrantType    string
	Code         string
	RedirectURI  string
	ClientID     string
	ClientSecret string
	CodeVerifier string
}

// TokenResponse OAuth token 响应
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	IDToken      string `json:"id_token,omitempty"`
	Scope        string `json:"scope,omitempty"`
	RefreshToken string `json:"refresh_token,omitempty"`
}

// ExchangeCode 授权码换 token
func (s *OIDCService) ExchangeCode(req TokenRequest) (*TokenResponse, error) {
	rt := s.runtime()
	if !rt.Ready {
		return nil, ErrOIDCNotConfigured
	}
	if req.GrantType != "authorization_code" {
		return nil, ErrOIDCInvalidRequest
	}
	client, err := FindEnabledOAuthClient(req.ClientID)
	if err != nil || !VerifyOAuthClientSecret(client, req.ClientSecret) {
		return nil, ErrOIDCInvalidClient
	}

	var rec models.OAuthAuthCode
	if err := models.DB.Where("code = ?", req.Code).First(&rec).Error; err != nil {
		return nil, ErrOIDCInvalidGrant
	}
	if rec.Used || time.Now().After(rec.ExpiresAt) {
		// 重放：作废同用户同客户端未过期码
		if rec.Used {
			_ = models.DB.Model(&models.OAuthAuthCode{}).
				Where("client_id = ? AND user_id = ? AND used = ? AND expires_at > ?",
					rec.ClientID, rec.UserID, false, time.Now()).
				Update("used", true).Error
		}
		return nil, ErrOIDCInvalidGrant
	}
	if rec.ClientID != req.ClientID || rec.RedirectURI != req.RedirectURI {
		return nil, ErrOIDCInvalidGrant
	}
	if err := verifyPKCE(rec.CodeChallenge, rec.CodeChallengeMethod, req.CodeVerifier); err != nil {
		return nil, err
	}

	rec.Used = true
	_ = models.DB.Save(&rec).Error

	var user models.User
	if err := models.DB.First(&user, rec.UserID).Error; err != nil || user.Banned {
		return nil, ErrOIDCInvalidGrant
	}

	access, err := s.signAccessToken(&user, rec.Scope, req.ClientID)
	if err != nil {
		return nil, err
	}
	idToken, err := s.signIDToken(&user, rec.Scope, req.ClientID, rec.Nonce)
	if err != nil {
		return nil, err
	}

	return &TokenResponse{
		AccessToken: access,
		TokenType:   "Bearer",
		ExpiresIn:   int(oidcAccessTokenTTL.Seconds()),
		IDToken:     idToken,
		Scope:       rec.Scope,
	}, nil
}

func verifyPKCE(challenge, method, verifier string) error {
	if challenge == "" {
		return nil
	}
	if verifier == "" {
		return ErrOIDCPKCEFailed
	}
	switch strings.ToUpper(method) {
	case "S256":
		sum := sha256.Sum256([]byte(verifier))
		calc := base64.RawURLEncoding.EncodeToString(sum[:])
		if calc != challenge {
			return ErrOIDCPKCEFailed
		}
	case "PLAIN", "":
		if verifier != challenge {
			return ErrOIDCPKCEFailed
		}
	default:
		return ErrOIDCPKCEFailed
	}
	return nil
}

type oidcAccessClaims struct {
	Scope    string `json:"scope,omitempty"`
	ClientID string `json:"client_id,omitempty"`
	jwt.RegisteredClaims
}

type oidcIDClaims struct {
	Name              string   `json:"name,omitempty"`
	PreferredUsername string   `json:"preferred_username,omitempty"`
	Email             string   `json:"email,omitempty"`
	EmailVerified     bool     `json:"email_verified,omitempty"`
	Picture           string   `json:"picture,omitempty"`
	Groups            []string `json:"groups,omitempty"`
	Nonce             string   `json:"nonce,omitempty"`
	jwt.RegisteredClaims
}

func (s *OIDCService) signAccessToken(user *models.User, scope, clientID string) (string, error) {
	now := time.Now()
	issuer := s.Issuer()
	claims := oidcAccessClaims{
		Scope:    scope,
		ClientID: clientID,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    issuer,
			Subject:   strconv.FormatUint(uint64(user.ID), 10),
			Audience:  []string{clientID},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(oidcAccessTokenTTL)),
		},
	}
	t := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	t.Header["kid"] = oidcKeyID
	s.mu.RLock()
	defer s.mu.RUnlock()
	return t.SignedString(s.privateKey)
}

func (s *OIDCService) signIDToken(user *models.User, scope, clientID, nonce string) (string, error) {
	now := time.Now()
	issuer := s.Issuer()
	claims := oidcIDClaims{
		Nonce:  nonce,
		Groups: s.userGroups(user),
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    issuer,
			Subject:   strconv.FormatUint(uint64(user.ID), 10),
			Audience:  []string{clientID},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(oidcIDTokenTTL)),
		},
	}
	if hasScope(scope, "profile") || scope == "" || hasScope(scope, "openid") {
		claims.Name = user.Nickname
		if claims.Name == "" {
			claims.Name = user.Username
		}
		claims.PreferredUsername = user.Username
		claims.Picture = s.absoluteURL(user.Avatar)
	}
	if hasScope(scope, "email") || hasScope(scope, "openid") {
		claims.Email = user.Email
		claims.EmailVerified = user.Email != ""
	}
	t := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	t.Header["kid"] = oidcKeyID
	s.mu.RLock()
	defer s.mu.RUnlock()
	return t.SignedString(s.privateKey)
}

func (s *OIDCService) userGroups(user *models.User) []string {
	rt := s.runtime()
	groups := make([]string, 0, 2)
	if rt.UserGroup != "" {
		groups = append(groups, rt.UserGroup)
	}
	if user.Role == models.RoleAdmin && rt.AdminGroup != "" {
		groups = append(groups, rt.AdminGroup)
	}
	return groups
}

// UserInfo 根据 access_token 返回用户声明
func (s *OIDCService) UserInfo(accessToken string) (map[string]any, error) {
	claims, err := s.parseAccessToken(accessToken)
	if err != nil {
		return nil, err
	}
	uid, err := strconv.ParseUint(claims.Subject, 10, 64)
	if err != nil {
		return nil, ErrOIDCInvalidToken
	}
	var user models.User
	if err := models.DB.First(&user, uint(uid)).Error; err != nil || user.Banned {
		return nil, ErrOIDCInvalidToken
	}
	rt := s.runtime()
	out := map[string]any{
		"sub": strconv.FormatUint(uint64(user.ID), 10),
	}
	if hasScope(claims.Scope, "profile") || claims.Scope == "" {
		name := user.Nickname
		if name == "" {
			name = user.Username
		}
		out["name"] = name
		out["preferred_username"] = user.Username
		if pic := s.absoluteURL(user.Avatar); pic != "" {
			out["picture"] = pic
		}
	}
	if hasScope(claims.Scope, "email") || hasScope(claims.Scope, "openid") {
		if user.Email != "" {
			out["email"] = user.Email
			out["email_verified"] = true
		}
	}
	if _, ok := out["preferred_username"]; !ok {
		out["preferred_username"] = user.Username
		out["name"] = user.Nickname
		if out["name"] == "" {
			out["name"] = user.Username
		}
	}
	groups := s.userGroups(&user)
	if len(groups) > 0 {
		claim := rt.GroupClaim
		if claim == "" {
			claim = "groups"
		}
		out[claim] = groups
		if claim != "groups" {
			out["groups"] = groups
		}
	}
	return out, nil
}

// ResolveLogoutRedirect 校验并返回登出后跳转地址（空表示回首页）
func (s *OIDCService) ResolveLogoutRedirect(postLogoutRedirectURI, state string) (string, error) {
	uri := strings.TrimSpace(postLogoutRedirectURI)
	if uri == "" {
		return "/", nil
	}
	var clients []models.OAuthClient
	if err := models.DB.Where("enabled = ?", true).Find(&clients).Error; err != nil {
		return "", err
	}
	allowed := false
	for _, c := range clients {
		if redirectAllowed(c.RedirectURIs, uri) {
			allowed = true
			break
		}
		// 允许同 host 下任意已登记前缀的登出回调（Gitea 常用 / 根路径）
		for _, reg := range splitRedirectURIs(c.RedirectURIs) {
			if sameOrigin(reg, uri) {
				allowed = true
				break
			}
		}
		if allowed {
			break
		}
	}
	if !allowed {
		return "", ErrOIDCInvalidLogout
	}
	u, err := url.Parse(uri)
	if err != nil {
		return "", ErrOIDCInvalidLogout
	}
	if state != "" {
		q := u.Query()
		q.Set("state", state)
		u.RawQuery = q.Encode()
	}
	return u.String(), nil
}

func sameOrigin(a, b string) bool {
	ua, err1 := url.Parse(a)
	ub, err2 := url.Parse(b)
	if err1 != nil || err2 != nil {
		return false
	}
	return strings.EqualFold(ua.Scheme, ub.Scheme) && strings.EqualFold(ua.Host, ub.Host)
}

func (s *OIDCService) parseAccessToken(tokenStr string) (*oidcAccessClaims, error) {
	s.mu.RLock()
	key := s.privateKey
	s.mu.RUnlock()
	if key == nil {
		return nil, ErrOIDCNotConfigured
	}
	tok, err := jwt.ParseWithClaims(tokenStr, &oidcAccessClaims{}, func(t *jwt.Token) (any, error) {
		if t.Method != jwt.SigningMethodRS256 {
			return nil, ErrOIDCInvalidToken
		}
		return &key.PublicKey, nil
	})
	if err != nil || !tok.Valid {
		return nil, ErrOIDCInvalidToken
	}
	claims, ok := tok.Claims.(*oidcAccessClaims)
	if !ok {
		return nil, ErrOIDCInvalidToken
	}
	if claims.Issuer != s.Issuer() {
		return nil, ErrOIDCInvalidToken
	}
	return claims, nil
}

func (s *OIDCService) absoluteURL(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		return path
	}
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	base := s.Issuer()
	if base == "" {
		return path
	}
	return base + path
}

func randomToken(nBytes int) (string, error) {
	b := make([]byte, nBytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

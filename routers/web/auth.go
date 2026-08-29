package web

import (
	"html/template"
	"net/http"
	"strings"

	"git.iioio.com/freefire/jiang13-forum/modules/webctx"
	"git.iioio.com/freefire/jiang13-forum/services"
	"github.com/gin-gonic/gin"
)

type loginData struct {
	PageChrome
	Username string
	Redirect string
}

type registerData struct {
	PageChrome
	Username         string
	Nickname         string
	Email            string
	MailReady        bool
	RequireEmailCode bool
	CaptchaID        string
	CaptchaSVG       template.HTML
}

type registerForm struct {
	Username string
	Nickname string
	Email    string
}

// LoginGet 登录页
func (d Deps) LoginGet(c *gin.Context) {
	ctx := d.ctx(c)
	if ctx.IsSigned() {
		ctx.Redirect("/")
		return
	}
	chrome := d.chrome(ctx, "登录 · "+d.Settings.SiteBranding().Name, "", "")
	if c.Query("banned") == "1" {
		chrome.Error = "账号已被禁言"
	}
	ctx.HTML(http.StatusOK, "auth/login", loginData{
		PageChrome: chrome,
		Redirect:   c.Query("redirect"),
	})
}

// LoginPost 登录提交
func (d Deps) LoginPost(c *gin.Context) {
	ctx := d.ctx(c)
	if !ctx.CheckCSRF() {
		d.renderLogin(ctx, "无效请求，请重试", c.PostForm("username"), c.PostForm("redirect"))
		return
	}
	if d.Limiter != nil && !d.Limiter.Allow("login", c.ClientIP()) {
		d.renderLogin(ctx, "操作过于频繁，请稍后再试", c.PostForm("username"), c.PostForm("redirect"))
		return
	}
	user := strings.TrimSpace(c.PostForm("username"))
	pass := c.PostForm("password")
	redir := strings.TrimSpace(c.PostForm("redirect"))
	if redir == "" || !strings.HasPrefix(redir, "/") || strings.HasPrefix(redir, "//") {
		redir = "/"
	}
	token, _, err := d.Auth.Login(user, pass, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		msg := "用户名或密码错误"
		if err == services.ErrUserBanned {
			msg = "账号已被禁言"
		}
		d.renderLogin(ctx, msg, user, redir)
		return
	}
	ctx.SetLoginCookie(token)
	ctx.Redirect(redir)
}

func (d Deps) renderLogin(ctx *webctx.Context, errMsg, username, redir string) {
	chrome := d.chrome(ctx, "登录 · "+d.Settings.SiteBranding().Name, "", "")
	chrome.Error = errMsg
	ctx.HTML(http.StatusOK, "auth/login", loginData{
		PageChrome: chrome,
		Username:   username,
		Redirect:   redir,
	})
}

// LogoutPost 退出
func (d Deps) LogoutPost(c *gin.Context) {
	ctx := d.ctx(c)
	if ctx.CheckCSRF() {
		ctx.ClearLoginCookie()
	}
	ctx.Redirect("/")
}

// RegisterGet 注册页
func (d Deps) RegisterGet(c *gin.Context) {
	ctx := d.ctx(c)
	if ctx.IsSigned() {
		ctx.Redirect("/")
		return
	}
	d.renderRegister(ctx, "", registerForm{})
}

// RegisterSendCode POST 发送注册邮箱验证码
func (d Deps) RegisterSendCode(c *gin.Context) {
	ctx := d.ctx(c)
	if ctx.IsSigned() {
		ctx.Redirect("/")
		return
	}
	form := registerFormFrom(c)
	if !ctx.CheckCSRF() {
		d.renderRegister(ctx, "无效请求，请重试", form)
		return
	}
	if d.Limiter != nil && !d.Limiter.Allow("register", c.ClientIP()) {
		d.renderRegister(ctx, "操作过于频繁，请稍后再试", form)
		return
	}
	if d.EmailCode == nil || !d.Settings.MailReady() {
		d.renderRegister(ctx, "邮件服务未配置，无需验证码即可注册", form)
		return
	}
	if err := d.EmailCode.SendRegisterCode(form.Email); err != nil {
		d.renderRegister(ctx, err.Error(), form)
		return
	}
	chrome := d.chrome(ctx, "注册 · "+d.Settings.SiteBranding().Name, "", "")
	chrome.Flash = "验证码已发送，请查收邮箱"
	d.renderRegisterWithChrome(ctx, chrome, "", form)
}

// RegisterPost 注册提交
func (d Deps) RegisterPost(c *gin.Context) {
	ctx := d.ctx(c)
	if ctx.IsSigned() {
		ctx.Redirect("/")
		return
	}
	form := registerFormFrom(c)
	if !ctx.CheckCSRF() {
		d.renderRegister(ctx, "无效请求，请重试", form)
		return
	}
	if d.Limiter != nil && !d.Limiter.Allow("register", c.ClientIP()) {
		d.renderRegister(ctx, "操作过于频繁，请稍后再试", form)
		return
	}
	captchaID := strings.TrimSpace(c.PostForm("captcha_id"))
	captchaAns := strings.TrimSpace(c.PostForm("captcha"))
	if d.Captcha == nil || !d.Captcha.Verify(captchaID, captchaAns) {
		d.renderRegister(ctx, "验证码错误或已过期", form)
		return
	}
	mailReady := d.Settings.MailReady()
	if mailReady {
		code := strings.TrimSpace(c.PostForm("email_code"))
		if d.EmailCode == nil || !d.EmailCode.Verify(form.Email, code) {
			d.renderRegister(ctx, services.ErrEmailCodeInvalid.Error(), form)
			return
		}
	}
	pass := c.PostForm("password")
	pass2 := c.PostForm("password2")
	if pass != pass2 {
		d.renderRegister(ctx, "两次密码不一致", form)
		return
	}
	user, err := d.Auth.Register(form.Username, pass, form.Nickname, form.Email)
	if err != nil {
		d.renderRegister(ctx, err.Error(), form)
		return
	}
	sid, err := d.Auth.CreateSessionForUser(user, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		ctx.SetFlash("注册成功，请登录")
		ctx.Redirect("/login")
		return
	}
	ctx.SetLoginCookie(sid)
	ctx.SetFlash("注册成功，欢迎加入")
	ctx.Redirect("/")
}

func registerFormFrom(c *gin.Context) registerForm {
	return registerForm{
		Username: strings.TrimSpace(c.PostForm("username")),
		Nickname: strings.TrimSpace(c.PostForm("nickname")),
		Email:    strings.TrimSpace(c.PostForm("email")),
	}
}

func (d Deps) renderRegister(ctx *webctx.Context, errMsg string, form registerForm) {
	chrome := d.chrome(ctx, "注册 · "+d.Settings.SiteBranding().Name, "", "")
	d.renderRegisterWithChrome(ctx, chrome, errMsg, form)
}

func (d Deps) renderRegisterWithChrome(ctx *webctx.Context, chrome PageChrome, errMsg string, form registerForm) {
	chrome.Error = errMsg
	mailReady := d.Settings.MailReady()
	data := registerData{
		PageChrome:       chrome,
		Username:         form.Username,
		Nickname:         form.Nickname,
		Email:            form.Email,
		MailReady:        mailReady,
		RequireEmailCode: mailReady,
	}
	if d.Captcha != nil {
		if id, svg, err := d.Captcha.Generate(); err == nil {
			data.CaptchaID = id
			data.CaptchaSVG = template.HTML(svg)
		}
	}
	ctx.HTML(http.StatusOK, "auth/register", data)
}

type forgotPasswordData struct {
	PageChrome
	Email     string
	MailReady bool
}

// ForgotPasswordGet 忘记密码页
func (d Deps) ForgotPasswordGet(c *gin.Context) {
	ctx := d.ctx(c)
	if ctx.IsSigned() {
		ctx.Redirect("/")
		return
	}
	d.renderForgotPassword(ctx, "", "")
}

// ForgotPasswordSendCode 发送重置验证码
func (d Deps) ForgotPasswordSendCode(c *gin.Context) {
	ctx := d.ctx(c)
	if ctx.IsSigned() {
		ctx.Redirect("/")
		return
	}
	email := strings.TrimSpace(c.PostForm("email"))
	if !ctx.CheckCSRF() {
		d.renderForgotPassword(ctx, "无效请求，请重试", email)
		return
	}
	if d.Limiter != nil && !d.Limiter.Allow("login", c.ClientIP()) {
		d.renderForgotPassword(ctx, "操作过于频繁，请稍后再试", email)
		return
	}
	if d.EmailCode == nil || !d.Settings.MailReady() {
		d.renderForgotPassword(ctx, services.ErrMailNotConfigured.Error(), email)
		return
	}
	if err := d.EmailCode.SendResetCode(email); err != nil {
		d.renderForgotPassword(ctx, err.Error(), email)
		return
	}
	chrome := d.chrome(ctx, "忘记密码 · "+d.Settings.SiteBranding().Name, "", "")
	chrome.Flash = "若该邮箱已注册，验证码将发送到邮箱"
	d.renderForgotPasswordWithChrome(ctx, chrome, "", email)
}

// ForgotPasswordPost 提交重置
func (d Deps) ForgotPasswordPost(c *gin.Context) {
	ctx := d.ctx(c)
	if ctx.IsSigned() {
		ctx.Redirect("/")
		return
	}
	email := strings.TrimSpace(c.PostForm("email"))
	if !ctx.CheckCSRF() {
		d.renderForgotPassword(ctx, "无效请求，请重试", email)
		return
	}
	if d.Limiter != nil && !d.Limiter.Allow("login", c.ClientIP()) {
		d.renderForgotPassword(ctx, "操作过于频繁，请稍后再试", email)
		return
	}
	if !d.Settings.MailReady() || d.EmailCode == nil {
		d.renderForgotPassword(ctx, services.ErrMailNotConfigured.Error(), email)
		return
	}
	code := strings.TrimSpace(c.PostForm("email_code"))
	if !d.EmailCode.VerifyPurpose(services.EmailCodePurposeReset, email, code) {
		d.renderForgotPassword(ctx, services.ErrEmailCodeInvalid.Error(), email)
		return
	}
	pass := c.PostForm("new_password")
	pass2 := c.PostForm("new_password2")
	if pass != pass2 {
		d.renderForgotPassword(ctx, "两次输入的新密码不一致", email)
		return
	}
	if err := d.User.ResetPasswordByEmail(email, pass); err != nil {
		d.renderForgotPassword(ctx, err.Error(), email)
		return
	}
	ctx.SetFlash("密码已重置，请使用新密码登录")
	ctx.Redirect("/login")
}

func (d Deps) renderForgotPassword(ctx *webctx.Context, errMsg, email string) {
	chrome := d.chrome(ctx, "忘记密码 · "+d.Settings.SiteBranding().Name, "", "")
	d.renderForgotPasswordWithChrome(ctx, chrome, errMsg, email)
}

func (d Deps) renderForgotPasswordWithChrome(ctx *webctx.Context, chrome PageChrome, errMsg, email string) {
	chrome.Error = errMsg
	ctx.HTML(http.StatusOK, "auth/forgot_password", forgotPasswordData{
		PageChrome: chrome,
		Email:      email,
		MailReady:  d.Settings.MailReady(),
	})
}

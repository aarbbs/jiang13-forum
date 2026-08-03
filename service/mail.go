package service

import (
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"
)

// MailConfig 邮件 SMTP 配置
type MailConfig struct {
	Enabled     bool   `json:"enabled"`
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Username    string `json:"username"`
	Password    string `json:"password,omitempty"` // 更新时传入；回显时为空
	From        string `json:"from"`
	FromName    string `json:"from_name"`
	Encryption  string `json:"encryption"`
	HasPassword bool   `json:"has_password"`
}

// MailService 基于 SMTP 发信
type MailService struct {
	settings *ForumSettingsService
}

func NewMailService(settings *ForumSettingsService) *MailService {
	return &MailService{settings: settings}
}

// Send 发送纯文本邮件
func (m *MailService) Send(to, subject, body string) error {
	return m.SendHTML(to, subject, body, "")
}

// SendHTML 发送邮件；htmlBody 非空时使用 multipart/alternative
func (m *MailService) SendHTML(to, subject, textBody, htmlBody string) error {
	cfg := m.settings.MailConfig()
	if !m.settings.MailReady() {
		return ErrMailNotConfigured
	}

	from := strings.TrimSpace(cfg.From)
	fromHeader := from
	if name := strings.TrimSpace(cfg.FromName); name != "" {
		fromHeader = fmt.Sprintf("%s <%s>", encodeMailHeader(name), from)
	}

	var msg string
	if strings.TrimSpace(htmlBody) == "" {
		msg = strings.Join([]string{
			"From: " + fromHeader,
			"To: " + to,
			"Subject: " + encodeMailHeader(subject),
			"MIME-Version: 1.0",
			"Content-Type: text/plain; charset=UTF-8",
			"Content-Transfer-Encoding: 8bit",
			"",
			textBody,
		}, "\r\n")
	} else {
		boundary := fmt.Sprintf("j13bound_%d", time.Now().UnixNano())
		msg = strings.Join([]string{
			"From: " + fromHeader,
			"To: " + to,
			"Subject: " + encodeMailHeader(subject),
			"MIME-Version: 1.0",
			"Content-Type: multipart/alternative; boundary=\"" + boundary + "\"",
			"",
			"--" + boundary,
			"Content-Type: text/plain; charset=UTF-8",
			"Content-Transfer-Encoding: 8bit",
			"",
			textBody,
			"",
			"--" + boundary,
			"Content-Type: text/html; charset=UTF-8",
			"Content-Transfer-Encoding: 8bit",
			"",
			htmlBody,
			"",
			"--" + boundary + "--",
			"",
		}, "\r\n")
	}

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	auth := smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)

	switch normalizeEncryption(cfg.Encryption) {
	case "ssl":
		return sendSMTPWithTLS(addr, cfg.Host, auth, from, []string{to}, []byte(msg), true)
	case "starttls":
		return sendSMTPStartTLS(addr, cfg.Host, auth, from, []string{to}, []byte(msg))
	default:
		return smtp.SendMail(addr, auth, from, []string{to}, []byte(msg))
	}
}

func normalizeEncryption(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "ssl", "tls":
		return "ssl"
	case "starttls":
		return "starttls"
	default:
		return "none"
	}
}

func sendSMTPWithTLS(addr, host string, auth smtp.Auth, from string, to []string, msg []byte, implicitTLS bool) error {
	tlsCfg := &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}
	conn, err := tls.DialWithDialer(&net.Dialer{Timeout: 15 * time.Second}, "tcp", addr, tlsCfg)
	if err != nil {
		return fmt.Errorf("连接邮件服务器失败: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer client.Close()

	if auth != nil {
		if ok, _ := client.Extension("AUTH"); ok {
			if err := client.Auth(auth); err != nil {
				return fmt.Errorf("邮件认证失败: %w", err)
			}
		}
	}
	if err := client.Mail(from); err != nil {
		return err
	}
	for _, rcpt := range to {
		if err := client.Rcpt(rcpt); err != nil {
			return err
		}
	}
	w, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(msg); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	_ = implicitTLS
	return client.Quit()
}

func sendSMTPStartTLS(addr, host string, auth smtp.Auth, from string, to []string, msg []byte) error {
	conn, err := net.DialTimeout("tcp", addr, 15*time.Second)
	if err != nil {
		return fmt.Errorf("连接邮件服务器失败: %w", err)
	}
	client, err := smtp.NewClient(conn, host)
	if err != nil {
		_ = conn.Close()
		return err
	}
	defer client.Close()

	if ok, _ := client.Extension("STARTTLS"); ok {
		tlsCfg := &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}
		if err := client.StartTLS(tlsCfg); err != nil {
			return fmt.Errorf("STARTTLS 失败: %w", err)
		}
	}
	if auth != nil {
		if ok, _ := client.Extension("AUTH"); ok {
			if err := client.Auth(auth); err != nil {
				return fmt.Errorf("邮件认证失败: %w", err)
			}
		}
	}
	if err := client.Mail(from); err != nil {
		return err
	}
	for _, rcpt := range to {
		if err := client.Rcpt(rcpt); err != nil {
			return err
		}
	}
	w, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(msg); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	return client.Quit()
}

// encodeMailHeader 简单编码含非 ASCII 的邮件头
func encodeMailHeader(s string) string {
	for _, r := range s {
		if r > 127 {
			return "=?UTF-8?B?" + base64.StdEncoding.EncodeToString([]byte(s)) + "?="
		}
	}
	return s
}

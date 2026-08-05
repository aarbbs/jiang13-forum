package service

import (
	"fmt"
	"html"
	"strings"
)

// BuildRegisterCodeMail 生成注册验证码邮件（纯文本 + HTML）
// 预览文案刻意不把验证码与「10分钟」紧邻，避免邮箱摘要显示成 8 位数字。
func BuildRegisterCodeMail(siteName, code string, ttlMinutes int) (subject, textBody, htmlBody string) {
	siteName = strings.TrimSpace(siteName)
	if siteName == "" {
		siteName = "姜十三论坛"
	}
	if ttlMinutes <= 0 {
		ttlMinutes = 10
	}

	subject = fmt.Sprintf("【%s】注册验证码", siteName)

	// 纯文本：验证码单独成段，数字间加空格，有效期另起一段
	spaced := strings.Join(strings.Split(code, ""), " ")
	textBody = fmt.Sprintf(
		"你好，\n\n你正在注册 %s。请在注册页填写以下验证码：\n\n%s\n\n（共 %d 位数字）\n\n有效期：%d 分钟。\n如非本人操作，请忽略本邮件。\n\n— %s\n",
		siteName, spaced, len(code), ttlMinutes, siteName,
	)

	safeSite := html.EscapeString(siteName)
	safeCode := html.EscapeString(code)
	// 预览摘要：不含验证码数字，避免与有效期粘连
	preheader := html.EscapeString(fmt.Sprintf("完成 %s 注册：请填写邮件中的验证码，有效期 %d 分钟。", siteName, ttlMinutes))

	htmlBody = fmt.Sprintf(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>%s</title>
</head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;color:#1f2937;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">%s</div>
  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr>
            <td style="padding:20px 28px;background:linear-gradient(135deg,#18a058,#138f4c);color:#ffffff;">
              <div style="font-size:18px;font-weight:700;letter-spacing:0.02em;">%s</div>
              <div style="margin-top:4px;font-size:13px;opacity:0.92;">注册邮箱验证</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">你好，</p>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#4b5563;">你正在注册 <strong style="color:#111827;">%s</strong>。请在注册页面输入下方验证码：</p>
              <div style="margin:0 0 8px;text-align:center;font-size:12px;color:#6b7280;letter-spacing:0.08em;">验 证 码</div>
              <div style="margin:0 auto 8px;max-width:280px;padding:16px 12px;text-align:center;background:#edfbf3;border:1px solid rgba(24,160,88,0.28);border-radius:10px;font-size:28px;font-weight:700;letter-spacing:0.35em;color:#138f4c;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">
                %s
              </div>
              <p style="margin:0 0 20px;text-align:center;font-size:12px;color:#9ca3af;">共 %d 位数字，请完整输入</p>
              <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f8fafc;border-radius:8px;">
                <tr>
                  <td style="padding:12px 14px;font-size:13px;line-height:1.6;color:#4b5563;">
                    <strong style="color:#111827;">有效期</strong>：%d 分钟<br />
                    超时请返回注册页重新获取验证码。
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:12px;line-height:1.6;color:#9ca3af;">如非本人操作，请忽略本邮件。请勿将验证码告知他人。</p>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 28px;border-top:1px solid #f1f5f9;font-size:12px;color:#9ca3af;text-align:center;">
              此邮件由 %s 自动发送，请勿直接回复
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
		html.EscapeString(subject),
		preheader,
		safeSite,
		safeSite,
		safeCode,
		len(code),
		ttlMinutes,
		safeSite,
	)
	return subject, textBody, htmlBody
}

// BuildReplyMail 生成「收到新回复」提醒邮件
// displayFloor 为页面可见顶层楼号；底部展示帖子主题，不展示路径 URL。
func BuildReplyMail(siteName, authorName, postTitle string, displayFloor int, isNested bool, excerpt, link string) (subject, textBody, htmlBody string) {
	siteName = strings.TrimSpace(siteName)
	if siteName == "" {
		siteName = "姜十三论坛"
	}
	authorName = strings.TrimSpace(authorName)
	if authorName == "" {
		authorName = "有人"
	}
	postTitle = strings.TrimSpace(postTitle)
	if postTitle == "" {
		postTitle = "未知帖子"
	}

	subject = fmt.Sprintf("【%s】收到新回复", siteName)
	bodyLine := FormatReplyContent(authorName, postTitle, displayFloor, isNested)

	textBody = fmt.Sprintf("你好，\n\n%s\n", bodyLine)
	if excerpt != "" {
		textBody += "\n摘要：\n" + excerpt + "\n"
	}
	textBody += fmt.Sprintf("\n帖子：《%s》\n", postTitle)
	if link != "" {
		textBody += "链接：" + link + "\n"
	}
	textBody += fmt.Sprintf("\n— %s\n", siteName)

	safeSite := html.EscapeString(siteName)
	safeBody := html.EscapeString(bodyLine)
	safeTitle := html.EscapeString(postTitle)
	safeExcerpt := html.EscapeString(excerpt)
	safeLink := html.EscapeString(link)
	preheader := html.EscapeString(fmt.Sprintf("%s 回复了你在《%s》中的内容", authorName, postTitle))

	linkBlock := ""
	if link != "" {
		linkBlock = fmt.Sprintf(`
              <p style="margin:0 0 12px;text-align:center;">
                <a href="%s" style="display:inline-block;padding:10px 18px;background:#18a058;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">查看讨论</a>
              </p>`, safeLink)
	}
	excerptBlock := ""
	if excerpt != "" {
		excerptBlock = fmt.Sprintf(`
              <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#f8fafc;border-radius:8px;">
                <tr>
                  <td style="padding:12px 14px;font-size:13px;line-height:1.6;color:#4b5563;">%s</td>
                </tr>
              </table>`, safeExcerpt)
	}

	htmlBody = fmt.Sprintf(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>%s</title>
</head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;color:#1f2937;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">%s</div>
  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr>
            <td style="padding:20px 28px;background:linear-gradient(135deg,#18a058,#138f4c);color:#ffffff;">
              <div style="font-size:18px;font-weight:700;letter-spacing:0.02em;">%s</div>
              <div style="margin-top:4px;font-size:13px;opacity:0.92;">回复提醒</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">你好，</p>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#4b5563;">%s</p>
              %s
              %s
            </td>
          </tr>
          <tr>
            <td style="padding:14px 28px;border-top:1px solid #f1f5f9;font-size:12px;color:#9ca3af;text-align:center;">
              帖子：《%s》<br />
              <span style="display:inline-block;margin-top:6px;">此邮件由 %s 自动发送，请勿直接回复</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
		html.EscapeString(subject),
		preheader,
		safeSite,
		safeBody,
		excerptBlock,
		linkBlock,
		safeTitle,
		safeSite,
	)
	return subject, textBody, htmlBody
}

// BuildModerationMail 生成「待审核」提醒邮件；kindLabel 为「帖子」或「评论」
// displayFloor 为可见顶层楼号；评论场景 isNested 区分顶层/子回复文案。
func BuildModerationMail(siteName, kindLabel, authorName, postTitle string, postID uint, displayFloor int, isNested bool, adminLink string) (subject, textBody, htmlBody string) {
	siteName = strings.TrimSpace(siteName)
	if siteName == "" {
		siteName = "姜十三论坛"
	}
	kindLabel = strings.TrimSpace(kindLabel)
	if kindLabel == "" {
		kindLabel = "内容"
	}
	authorName = strings.TrimSpace(authorName)
	if authorName == "" {
		authorName = "用户"
	}
	postTitle = strings.TrimSpace(postTitle)
	if postTitle == "" {
		postTitle = "未知帖子"
	}

	subject = fmt.Sprintf("【%s】新的待审核%s", siteName, kindLabel)

	var detail string
	switch {
	case kindLabel == "评论" && isNested && displayFloor > 0:
		detail = fmt.Sprintf("用户 %s 在《%s》#%d 楼下提交了待审核回复", authorName, postTitle, displayFloor)
	case kindLabel == "评论" && displayFloor > 0:
		detail = fmt.Sprintf("用户 %s 在《%s》提交了待审核 #%d 楼评论", authorName, postTitle, displayFloor)
	default:
		detail = fmt.Sprintf("用户 %s 提交了待审核%s《%s》（#%d）", authorName, kindLabel, postTitle, postID)
	}

	textBody = fmt.Sprintf("你好，\n\n%s。\n请尽快前往管理后台处理。\n", detail)
	textBody += fmt.Sprintf("\n帖子：《%s》\n", postTitle)
	if adminLink != "" {
		textBody += "链接：" + adminLink + "\n"
	}
	textBody += fmt.Sprintf("\n— %s\n", siteName)

	safeSite := html.EscapeString(siteName)
	safeKind := html.EscapeString(kindLabel)
	safeDetail := html.EscapeString(detail)
	safeTitle := html.EscapeString(postTitle)
	safeLink := html.EscapeString(adminLink)
	preheader := html.EscapeString(fmt.Sprintf("有新的待审核%s需要处理", kindLabel))

	linkBlock := ""
	if adminLink != "" {
		linkBlock = fmt.Sprintf(`
              <p style="margin:0 0 12px;text-align:center;">
                <a href="%s" style="display:inline-block;padding:10px 18px;background:#18a058;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">前往审核</a>
              </p>`, safeLink)
	}

	htmlBody = fmt.Sprintf(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>%s</title>
</head>
<body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;color:#1f2937;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">%s</div>
  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr>
            <td style="padding:20px 28px;background:linear-gradient(135deg,#18a058,#138f4c);color:#ffffff;">
              <div style="font-size:18px;font-weight:700;letter-spacing:0.02em;">%s</div>
              <div style="margin-top:4px;font-size:13px;opacity:0.92;">待审核提醒</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">你好，</p>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#4b5563;">%s。</p>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#4b5563;">请尽快前往管理后台处理该%s。</p>
              %s
            </td>
          </tr>
          <tr>
            <td style="padding:14px 28px;border-top:1px solid #f1f5f9;font-size:12px;color:#9ca3af;text-align:center;">
              帖子：《%s》<br />
              <span style="display:inline-block;margin-top:6px;">此邮件由 %s 自动发送，请勿直接回复</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
		html.EscapeString(subject),
		preheader,
		safeSite,
		safeDetail,
		safeKind,
		linkBlock,
		safeTitle,
		safeSite,
	)
	return subject, textBody, htmlBody
}

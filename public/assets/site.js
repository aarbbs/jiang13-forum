// 姜十三论坛 SSR 渐进增强
document.documentElement.dataset.j13Ssr = "1";

(function themeToggle() {
  var KEY = "j13-theme";
  var LABELS = { system: "跟随系统", light: "浅色", dark: "暗色" };
  var ORDER = ["system", "light", "dark"];

  function normalizePref(raw) {
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
    return "system";
  }

  function apply(pref) {
    pref = normalizePref(pref);
    var root = document.documentElement;
    if (pref === "system") {
      root.removeAttribute("data-theme");
      root.style.removeProperty("color-scheme");
    } else {
      root.setAttribute("data-theme", pref);
      root.style.colorScheme = pref;
    }
    root.setAttribute("data-theme-pref", pref);
    try {
      localStorage.setItem(KEY, pref);
    } catch (e) {}
    var btn = document.getElementById("j13-theme-toggle");
    if (btn) {
      btn.textContent = LABELS[pref] || LABELS.system;
      btn.setAttribute("aria-label", "主题：" + (LABELS[pref] || ""));
      btn.title = "当前：" + (LABELS[pref] || "") + "（点击切换）";
    }
  }

  function currentPref() {
    try {
      return normalizePref(localStorage.getItem(KEY) || "system");
    } catch (e) {
      return "system";
    }
  }

  apply(currentPref());

  var btn = document.getElementById("j13-theme-toggle");
  if (btn) {
    btn.addEventListener("click", function () {
      var cur = currentPref();
      var idx = ORDER.indexOf(cur);
      var next = ORDER[(idx + 1) % ORDER.length];
      apply(next);
    });
  }
})();

(function mdEditors() {
  function insertAtCursor(textarea, text) {
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || start;
    textarea.value =
      textarea.value.slice(0, start) + text + textarea.value.slice(end);
    const pos = start + text.length;
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
  }

  function wrapSelection(textarea, before, after, fallback) {
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || start;
    let selected = textarea.value.slice(start, end);
    if (!selected) selected = fallback || "";
    const block = before + selected + after;
    textarea.value =
      textarea.value.slice(0, start) + block + textarea.value.slice(end);
    textarea.focus();
    if (fallback && !textarea.value.slice(start, end)) {
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    } else {
      textarea.setSelectionRange(start + block.length, start + block.length);
    }
  }

  function prefixLines(textarea, prefix) {
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || start;
    const value = textarea.value;
    let lineStart = value.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = value.indexOf("\n", end);
    if (lineEnd < 0) lineEnd = value.length;
    const chunk = value.slice(lineStart, lineEnd);
    const next = chunk
      .split("\n")
      .map((ln) => (ln.trim() ? prefix + ln.replace(/^\s+/, "") : prefix.trimEnd()))
      .join("\n");
    textarea.value = value.slice(0, lineStart) + next + value.slice(lineEnd);
    textarea.focus();
    textarea.setSelectionRange(lineStart, lineStart + next.length);
  }

  function wrapGate(textarea, openTag, closeTag, statusEl) {
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || start;
    let selected = textarea.value.slice(start, end);
    if (!selected.trim()) selected = "在此填写隐藏内容";
    let inner = selected;
    if (!/^\s*</.test(inner)) {
      inner = "<p>" + selected.replace(/\n/g, "<br>\n") + "</p>";
    }
    const block = openTag + inner + closeTag;
    textarea.value =
      textarea.value.slice(0, start) + block + textarea.value.slice(end);
    textarea.focus();
    textarea.setSelectionRange(start + block.length, start + block.length);
    if (statusEl) statusEl.textContent = "已插入门控块";
  }

  function initEditor(root) {
    const textarea = root.querySelector("[data-md-input]");
    if (!textarea) return;
    const statusEl = root.querySelector("[data-md-status]");
    const previewEl = root.querySelector("[data-md-preview]");
    const csrf = root.getAttribute("data-csrf") || "";
    const uploadURL = root.getAttribute("data-upload") || "/compose/upload";
    const previewURL = root.getAttribute("data-preview") || "/compose/preview";
    const unsaved = root.getAttribute("data-unsaved") === "1";
    let dirty = false;
    let previewOn = false;

    function setStatus(msg) {
      if (statusEl) statusEl.textContent = msg || "";
    }

    root.querySelectorAll("[data-md-cmd]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const cmd = btn.getAttribute("data-md-cmd");
        if (cmd === "preview") {
          previewOn = !previewOn;
          if (previewOn) {
            setStatus("预览中…");
            try {
              const fd = new FormData();
              fd.append("content", textarea.value);
              fd.append("_csrf", csrf);
              const res = await fetch(previewURL, {
                method: "POST",
                headers: { "X-CSRF-Token": csrf },
                body: fd,
                credentials: "same-origin",
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok) throw new Error(data.error || "预览失败");
              previewEl.innerHTML = data.html || "<p class=\"j13-muted\">（空）</p>";
              previewEl.hidden = false;
              textarea.hidden = true;
              btn.classList.add("is-active");
              setStatus("预览模式（再点返回编辑）");
            } catch (e) {
              previewOn = false;
              setStatus(e.message || "预览失败");
            }
          } else {
            previewEl.hidden = true;
            previewEl.innerHTML = "";
            textarea.hidden = false;
            btn.classList.remove("is-active");
            textarea.focus();
            setStatus("");
          }
          return;
        }
        if (previewOn) return;
        switch (cmd) {
          case "bold":
            wrapSelection(textarea, "**", "**", "粗体");
            break;
          case "italic":
            wrapSelection(textarea, "*", "*", "斜体");
            break;
          case "strike":
            wrapSelection(textarea, "~~", "~~", "删除线");
            break;
          case "code":
            wrapSelection(textarea, "`", "`", "code");
            break;
          case "link": {
            const url = window.prompt("链接地址", "https://");
            if (!url) return;
            wrapSelection(textarea, "[", "](" + url + ")", "链接文字");
            break;
          }
          case "h2":
            prefixLines(textarea, "## ");
            break;
          case "h3":
            prefixLines(textarea, "### ");
            break;
          case "ul":
            prefixLines(textarea, "- ");
            break;
          case "ol":
            prefixLines(textarea, "1. ");
            break;
          case "quote":
            prefixLines(textarea, "> ");
            break;
          case "fence":
            wrapSelection(textarea, "```\n", "\n```", "code");
            break;
          case "gate-login":
            wrapGate(textarea, '<members-only data-gate="login">', "</members-only>", statusEl);
            break;
          case "gate-reply":
            wrapGate(textarea, '<reply-only data-gate="reply">', "</reply-only>", statusEl);
            break;
          case "gate-points": {
            let cost = window.prompt("积分价格（1–9999）", "10");
            if (cost == null) return;
            const n = parseInt(String(cost).trim(), 10);
            if (!n || n < 1 || n > 9999) {
              setStatus("价格须为 1–9999 的整数");
              return;
            }
            wrapGate(
              textarea,
              '<points-only data-gate="points" data-cost="' + n + '">',
              "</points-only>",
              statusEl
            );
            break;
          }
        }
        dirty = true;
      });
    });

    const fileInput = root.querySelector("[data-md-upload]");
    if (fileInput) {
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        if (!file || previewOn) return;
        setStatus("上传中…");
        const fd = new FormData();
        fd.append("image", file);
        fd.append("_csrf", csrf);
        try {
          const res = await fetch(uploadURL, {
            method: "POST",
            headers: { "X-CSRF-Token": csrf },
            body: fd,
            credentials: "same-origin",
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "上传失败");
          if (!data.url) throw new Error("未返回图片地址");
          insertAtCursor(textarea, "\n\n![](" + data.url + ")\n\n");
          dirty = true;
          setStatus("已插入图片");
        } catch (e) {
          setStatus(e.message || "上传失败");
        }
      });
    }

    textarea.addEventListener("keydown", (e) => {
      if (e.key !== "Tab" || previewOn) return;
      e.preventDefault();
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || start;
      if (e.shiftKey) {
        const value = textarea.value;
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const line = value.slice(lineStart, end);
        const next = line.replace(/^( {1,2}|\t)/gm, "");
        textarea.value = value.slice(0, lineStart) + next + value.slice(end);
        textarea.setSelectionRange(lineStart, lineStart + next.length);
      } else {
        insertAtCursor(textarea, "  ");
      }
      dirty = true;
    });

    textarea.addEventListener("input", () => {
      dirty = true;
    });

    if (unsaved) {
      const form = root.closest("form");
      window.addEventListener("beforeunload", (e) => {
        if (!dirty) return;
        e.preventDefault();
        e.returnValue = "";
      });
      if (form) {
        form.addEventListener("submit", () => {
          dirty = false;
        });
      }
    }
  }

  document.querySelectorAll("[data-j13-md-editor]").forEach(initEditor);
})();

(function postContentGates() {
  const article = document.querySelector(".j13-post[data-post-id]");
  if (!article) return;

  const postId = article.getAttribute("data-post-id");
  const csrf = article.getAttribute("data-csrf") || "";
  const loggedIn = article.getAttribute("data-logged-in") === "1";
  const path = window.location.pathname + window.location.hash;

  article.querySelectorAll('[data-locked="true"]').forEach((el) => {
    const gate = el.getAttribute("data-gate") || "";
    const shell = el.querySelector("[data-gate-shell]");
    if (!shell) return;

    if (gate === "login" && !loggedIn) {
      const a = document.createElement("a");
      a.href = "/login?redirect=" + encodeURIComponent(path || "/");
      a.textContent = "登录查看";
      const p = document.createElement("p");
      p.appendChild(a);
      shell.appendChild(p);
    }
    if (gate === "reply" && loggedIn) {
      const a = document.createElement("a");
      a.href = "#comments";
      a.textContent = "去评论解锁";
      const p = document.createElement("p");
      p.appendChild(a);
      shell.appendChild(p);
    }
    if (gate === "points") {
      const key = el.getAttribute("data-block-key") || "";
      const cost = el.getAttribute("data-cost") || "";
      if (!loggedIn) {
        const a = document.createElement("a");
        a.href = "/login?redirect=" + encodeURIComponent(path || "/");
        a.textContent = "登录后解锁";
        const p = document.createElement("p");
        p.appendChild(a);
        shell.appendChild(p);
        return;
      }
      if (!key) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "j13-gate__unlock";
      btn.textContent = "花费 " + cost + " 积分解锁";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "解锁中…";
        try {
          const res = await fetch("/post/" + postId + "/unlock", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-CSRF-Token": csrf,
            },
            credentials: "same-origin",
            body: JSON.stringify({ block_key: key }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "解锁失败");
          const inner = data.unlock && data.unlock.inner_html;
          if (typeof inner !== "string") throw new Error("未返回内容");
          el.setAttribute("data-locked", "false");
          el.innerHTML = inner;
        } catch (e) {
          btn.disabled = false;
          btn.textContent = "花费 " + cost + " 积分解锁";
          alert(e.message || "解锁失败");
        }
      });
      const p = document.createElement("p");
      p.appendChild(btn);
      shell.appendChild(p);
    }
  });
})();

// 友链申请：选择文件后先上传并回填 LOGO URL
(function () {
  const form = document.querySelector("form[data-logo-upload]");
  if (!form) return;
  const fileInput = form.querySelector("#fl-logo-file");
  const urlInput = form.querySelector("#fl-logo-url");
  const csrfInput = form.querySelector('input[name="_csrf"]');
  if (!fileInput || !urlInput || !csrfInput) return;
  const uploadURL = form.getAttribute("data-logo-upload") || "/links/logo";
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("logo", file);
    fd.append("_csrf", csrfInput.value);
    try {
      const res = await fetch(uploadURL, { method: "POST", body: fd, credentials: "same-origin" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "上传失败");
      if (data.url) urlInput.value = data.url;
    } catch (e) {
      alert(e.message || "上传失败");
      fileInput.value = "";
    }
  });
})();

// 评论回复：点击「回复」填入 reply_to
(function () {
  const form = document.getElementById("comment-form");
  if (!form) return;
  const replyInput = document.getElementById("comment-reply-to");
  const hint = document.getElementById("comment-reply-hint");
  const clearBtn = document.getElementById("comment-reply-clear");
  const content = document.getElementById("comment-content");
  function clearReply() {
    if (replyInput) replyInput.value = "";
    if (hint) {
      hint.hidden = true;
      hint.textContent = "";
    }
    if (clearBtn) clearBtn.hidden = true;
  }
  function setReply(id, floor, author) {
    if (!replyInput) return;
    replyInput.value = id;
    if (hint) {
      hint.hidden = false;
      hint.textContent = "回复 #" + floor + (author ? " " + author : "");
    }
    if (clearBtn) clearBtn.hidden = false;
    if (content) content.focus();
    form.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  document.querySelectorAll(".j13-comment__reply-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setReply(
        btn.getAttribute("data-reply-to") || "",
        btn.getAttribute("data-reply-floor") || "",
        btn.getAttribute("data-reply-author") || ""
      );
    });
  });
  if (clearBtn) clearBtn.addEventListener("click", clearReply);
})();

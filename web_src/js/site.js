// 姜十三论坛 SSR 渐进增强
document.documentElement.dataset.j13Ssr = "1";

(function composeUploadAndGates() {
  const form = document.getElementById("compose-form");
  const textarea = document.getElementById("compose-content");
  if (!form || !textarea) return;

  const csrf = form.getAttribute("data-csrf") || "";
  const uploadURL = form.getAttribute("data-upload") || "/compose/upload";
  const fileInput = document.getElementById("compose-image");
  const statusEl = document.getElementById("compose-upload-status");

  function insertAtCursor(text) {
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || start;
    textarea.value =
      textarea.value.slice(0, start) + text + textarea.value.slice(end);
    const pos = start + text.length;
    textarea.focus();
    textarea.setSelectionRange(pos, pos);
  }

  function wrapSelection(openTag, closeTag, fallbackInner) {
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || start;
    let selected = textarea.value.slice(start, end);
    if (!selected.trim()) {
      selected = fallbackInner || "在此填写隐藏内容";
    }
    // 若选区尚非段落，包一层 p 便于消毒后结构稳定
    let inner = selected;
    if (!/^\s*</.test(inner)) {
      inner = "<p>" + selected.replace(/\n/g, "<br>\n") + "</p>";
    }
    const block = openTag + inner + closeTag;
    textarea.value =
      textarea.value.slice(0, start) + block + textarea.value.slice(end);
    textarea.focus();
    const pos = start + block.length;
    textarea.setSelectionRange(pos, pos);
    if (statusEl) statusEl.textContent = "已插入门控块";
  }

  if (fileInput) {
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      fileInput.value = "";
      if (!file) return;
      if (statusEl) statusEl.textContent = "上传中…";
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
        const url = data.url;
        if (!url) throw new Error("未返回图片地址");
        insertAtCursor(`\n\n![](${url})\n\n`);
        if (statusEl) statusEl.textContent = "已插入图片";
      } catch (e) {
        if (statusEl) statusEl.textContent = e.message || "上传失败";
      }
    });
  }

  document.getElementById("compose-gate-login")?.addEventListener("click", () => {
    wrapSelection(
      '<members-only data-gate="login">',
      "</members-only>"
    );
  });
  document.getElementById("compose-gate-reply")?.addEventListener("click", () => {
    wrapSelection(
      '<reply-only data-gate="reply">',
      "</reply-only>"
    );
  });
  document.getElementById("compose-gate-points")?.addEventListener("click", () => {
    let cost = window.prompt("积分价格（1–9999）", "10");
    if (cost == null) return;
    cost = String(cost).trim();
    const n = parseInt(cost, 10);
    if (!n || n < 1 || n > 9999) {
      if (statusEl) statusEl.textContent = "价格须为 1–9999 的整数";
      return;
    }
    wrapSelection(
      `<points-only data-gate="points" data-cost="${n}">`,
      "</points-only>"
    );
  });
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

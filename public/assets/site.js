// 姜十三论坛 SSR 渐进增强
document.documentElement.dataset.j13Ssr = "1";

(function () {
  const form = document.getElementById("compose-form");
  const fileInput = document.getElementById("compose-image");
  const textarea = document.getElementById("compose-content");
  const statusEl = document.getElementById("compose-upload-status");
  if (!form || !fileInput || !textarea) return;

  const csrf = form.getAttribute("data-csrf") || "";
  const uploadURL = form.getAttribute("data-upload") || "/compose/upload";

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
      if (!res.ok) {
        throw new Error(data.error || "上传失败");
      }
      const url = data.url;
      if (!url) throw new Error("未返回图片地址");
      const md = `\n\n![](${url})\n\n`;
      const start = textarea.selectionStart || textarea.value.length;
      const end = textarea.selectionEnd || start;
      textarea.value =
        textarea.value.slice(0, start) + md + textarea.value.slice(end);
      textarea.focus();
      if (statusEl) statusEl.textContent = "已插入图片";
    } catch (e) {
      if (statusEl) statusEl.textContent = e.message || "上传失败";
    }
  });
})();

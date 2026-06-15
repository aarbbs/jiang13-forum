// 姜十三论坛前端通用脚本
function apiPost(url, data, isForm) {
  const opts = { method: 'POST', credentials: 'same-origin' };
  if (isForm) {
    opts.body = new FormData(data instanceof HTMLFormElement ? data : undefined);
    if (!(data instanceof HTMLFormElement)) {
      const fd = new FormData();
      for (const k in data) fd.append(k, data[k]);
      opts.body = fd;
    }
  } else {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(data);
  }
  return fetch(url, opts).then(r => r.json());
}

function showToast(msg, type) {
  const el = document.getElementById('toast');
  if (!el) { alert(msg); return; }
  el.className = 'toast align-items-center text-bg-' + (type || 'success') + ' border-0 show';
  el.querySelector('.toast-body').textContent = msg;
  new bootstrap.Toast(el).show();
}

function confirmAction(msg, callback) {
  if (confirm(msg)) callback();
}

// 姜十三论坛 - 管理后台通用脚本

async function adminFetch(url, opts) {
  opts = opts || {};
  var res = await fetch(url, Object.assign({ credentials: 'same-origin' }, opts));
  var data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('服务器响应异常，请重新登录后再试');
  }
  if (!res.ok) {
    throw new Error(data.error || '请求失败');
  }
  return data;
}

function showToast(msg, type) {
  var el = document.getElementById('adminToast');
  if (!el) {
    alert(msg);
    return;
  }
  el.className = 'toast align-items-center text-bg-' + (type || 'success') + ' border-0 show';
  el.querySelector('.toast-body').textContent = msg;
  bootstrap.Toast.getOrCreateInstance(el, { delay: 2800 }).show();
}

function adminConfirm(msg, fn) {
  if (confirm(msg)) fn();
}

function setBtnLoading(btn, loading) {
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.dataset.originalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
  } else if (btn.dataset.originalHtml) {
    btn.innerHTML = btn.dataset.originalHtml;
  }
}

function adminLogout() {
  adminFetch('/admin/api/logout', { method: 'POST' })
    .then(function () { location.href = '/admin/login'; })
    .catch(function (e) { showToast(e.message, 'danger'); });
}

function postForm(url, method, fields) {
  var fd = new FormData();
  Object.keys(fields).forEach(function (k) { fd.append(k, fields[k]); });
  return adminFetch(url, { method: method, body: fd });
}

function reloadSoon() {
  setTimeout(function () { location.reload(); }, 600);
}

// 兼容旧模板
function apiPost(url, data, isForm) {
  var opts = { method: 'POST', credentials: 'same-origin' };
  if (isForm) {
    opts.body = new FormData(data instanceof HTMLFormElement ? data : undefined);
    if (!(data instanceof HTMLFormElement)) {
      var fd = new FormData();
      for (var k in data) fd.append(k, data[k]);
      opts.body = fd;
    }
  } else {
    opts.headers = { 'Content-Type': 'application/json' };
    opts.body = JSON.stringify(data);
  }
  return fetch(url, opts).then(function (r) { return r.json(); });
}

function confirmAction(msg, callback) {
  adminConfirm(msg, callback);
}

// ═══════════════════════════════════════════════════════════
// UI UTILS — dikongsi semua page (toast, confirm modal, esc, dll)
// ═══════════════════════════════════════════════════════════
export function $(id) { return document.getElementById(id); }
export function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
export function escJs(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"'); }
export function escRx(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
export function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function loadingCard() { return `<div class="card"><div class="state-box"><div class="spinner"></div><div class="s-sub">Memuatkan data...</div></div></div>`; }
export function setBanner(el, type, icon, msg) {
  const c = { pending: 'banner-pending', confirmed: 'banner-confirmed', error: 'banner-error' };
  el.className = `status-banner ${c[type] || 'banner-pending'} fade-in`;
  el.innerHTML = `<i class="fas ${icon}"></i><span>${msg}</span>`;
}

let toastTimer = null;
export function toast(msg, type = 'info') {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast ' + (type === 'error' ? 'error' : type === 'success' ? 'success' : '');
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

export function showConfirm({ title, msg, okLabel = 'OK', okType = 'primary', onOk }) {
  $('confirm-title').textContent = title;
  $('confirm-msg').textContent = msg;
  const okBtn = $('confirm-ok-btn'), cancelBtn = $('confirm-cancel-btn');
  const newOk = okBtn.cloneNode(true), newCancel = cancelBtn.cloneNode(true);
  newOk.textContent = okLabel;
  newOk.className = 'confirm-btn confirm-btn-ok ' + (okType === 'warn' ? 'warn' : okType === 'primary' ? 'primary' : '');
  okBtn.parentNode.replaceChild(newOk, okBtn);
  cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
  function close() { $('confirmModal').classList.add('hidden'); }
  newCancel.addEventListener('click', close);
  newOk.addEventListener('click', () => { close(); onOk(); });
  $('confirmModal').classList.remove('hidden');
}

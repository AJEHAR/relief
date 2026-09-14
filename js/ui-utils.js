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

// ── Skeleton generators — bentuk mengikut kandungan sebenar (kad berkumpulan,
// jadual, grid) supaya peralihan ke data sebenar tak "melompat" ── 
export function skeletonGroupedList(groups = 2, rowsPerGroup = 3) {
  let html = '';
  for (let g = 0; g < groups; g++) {
    html += `<div class="sk-card">
      <div class="sk-grp-head">
        <div class="sk-bar sk-circle" style="width:34px;height:34px;"></div>
        <div style="flex:1;"><div class="sk-bar" style="width:55%;height:13px;margin-bottom:6px;"></div><div class="sk-bar" style="width:35%;height:10px;"></div></div>
      </div>`;
    for (let r = 0; r < rowsPerGroup; r++) {
      html += `<div class="sk-grow">
        <div class="sk-bar sk-circle" style="width:34px;height:34px;"></div>
        <div style="flex:1;">
          <div class="sk-bar" style="width:40%;height:10px;margin-bottom:6px;"></div>
          <div class="sk-bar" style="width:65%;height:11px;margin-bottom:6px;"></div>
          <div class="sk-bar" style="width:50%;height:13px;"></div>
        </div>
      </div>`;
    }
    html += `</div>`;
  }
  return html;
}

export function skeletonTable(rows = 5) {
  let html = '';
  for (let i = 0; i < rows; i++) {
    html += `<div class="sk-table-row">
      <div class="sk-bar" style="width:34px;height:22px;flex-shrink:0;"></div>
      <div class="sk-bar" style="width:70px;height:12px;flex-shrink:0;"></div>
      <div class="sk-bar" style="width:60px;height:18px;flex-shrink:0;"></div>
      <div class="sk-bar" style="flex:1;height:12px;"></div>
      <div class="sk-bar" style="width:90px;height:12px;flex-shrink:0;"></div>
    </div>`;
  }
  return `<div class="sk-card">${html}</div>`;
}

export function skeletonGrid(rows = 6, cols = 6) {
  let html = `<div class="sk-grid-wrap">`;
  for (let r = 0; r < rows; r++) {
    html += `<div class="sk-grid-row"><div class="sk-bar" style="width:90px;height:44px;flex-shrink:0;"></div>`;
    for (let c = 0; c < cols; c++) html += `<div class="sk-bar" style="width:58px;height:44px;flex-shrink:0;"></div>`;
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

export function skeletonTimetableRows(rows = 6) {
  let html = '';
  for (let i = 0; i < rows; i++) {
    html += `<div class="sk-grow" style="padding:11px 16px;">
      <div class="sk-bar sk-circle" style="width:34px;height:34px;"></div>
      <div style="flex:1;">
        <div class="sk-bar" style="width:30%;height:12px;margin-bottom:6px;"></div>
        <div class="sk-bar" style="width:60%;height:15px;"></div>
      </div>
    </div>`;
  }
  return `<div class="sk-card">${html}</div>`;
}

/** Skeleton ringkas — senarai baris kecil (cth: Guru Tambahan, Pengurusan Pengguna) */
export function skeletonRows(rows = 3) {
  let html = '';
  for (let i = 0; i < rows; i++) {
    html += `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
      <div class="sk-bar sk-circle" style="width:28px;height:28px;"></div>
      <div style="flex:1;"><div class="sk-bar" style="width:45%;height:11px;"></div></div>
      <div class="sk-bar" style="width:60px;height:20px;"></div>
    </div>`;
  }
  return html;
}
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
  const iconEl = $('confirm-icon');
  if (iconEl) {
    iconEl.className = 'confirm-icon' + (okType === 'warn' ? ' warn' : okType === 'primary' ? ' primary' : '');
    const iconClass = okType === 'warn' ? 'fa-trash-alt' : okType === 'primary' ? 'fa-check' : 'fa-question';
    iconEl.innerHTML = `<i class="fas ${iconClass}"></i>`;
  }
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

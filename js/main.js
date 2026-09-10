// ═══════════════════════════════════════════════════════════
// MAIN — pengurusan tab, role gating, & semua wiring UI
// ═══════════════════════════════════════════════════════════
import { authState, onAuthChange, loginWithGoogle, logout, setMyTeacherId, isAdmin, isLoggedIn } from './auth.js';
import * as db from './db.js';
import { getReliefFromAssignment } from './board-engine.js';
import { processASCXML } from './xml-import.js';
import { exportHtmlToPdf } from './pdf-export.js';

// ── State global ──
let currentTab = 'induk';
let teachersList = [];
let classList = [];
let guruBoard = null;      // hasil db.getGuruPageData() — utk Induk/Saya/Kelas
let currentBoard = null;   // hasil db.getDailyBoard() — utk Papan (admin)
let selT = null;           // guru terpilih (tab Saya)
let selKelas = null;
let currentAssignSlot = null;
let overrideOn = false;
let pendingLogoBase64 = undefined;
let ddActive = -1;

// ── Util ──
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function escJs(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"'); }
function escRx(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function getDate() { return $('datePicker').value; }
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

let toastTimer = null;
function toast(msg, type = 'info') {
  const el = $('toast');
  el.textContent = msg;
  el.className = 'toast ' + (type === 'error' ? 'error' : type === 'success' ? 'success' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

function showConfirm({ title, msg, okLabel = 'OK', okType = 'primary', onOk }) {
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

function setBanner(el, type, icon, msg) {
  const c = { pending: 'banner-pending', confirmed: 'banner-confirmed', error: 'banner-error' };
  el.className = `status-banner ${c[type] || 'banner-pending'} fade-in`;
  el.innerHTML = `<i class="fas ${icon}"></i><span>${msg}</span>`;
}
function loadingCard() { return `<div class="card"><div class="state-box"><div class="spinner"></div><div class="s-sub">Memuatkan data...</div></div></div>`; }

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
async function initApp() {
  $('datePicker').value = todayStr();
  onAuthChange(renderAuthUI);
  await Promise.all([loadStaticLists()]);
  await switchTab('induk');
  registerSW();
}

async function loadStaticLists() {
  try {
    teachersList = await db.getTeacherList();
    classList = await db.getClassList();
    const sel = $('kelas-select');
    sel.innerHTML = '<option value="">— Pilih Kelas —</option>' + classList.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  } catch (e) { console.error(e); }
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}

// ═══════════════════════════════════════════════════════════
// AUTH UI
// ═══════════════════════════════════════════════════════════
function renderAuthUI(state) {
  const loginBtn = $('btn-login'), chip = $('user-chip');
  if (state.user) {
    loginBtn.classList.add('hidden');
    chip.classList.remove('hidden');
    $('user-photo').src = state.profile?.photoURL || state.user.photoURL || '';
    $('user-name').textContent = state.profile?.name || state.user.displayName || state.user.email;
    $('user-role').textContent = state.profile?.role === 'admin' ? 'Admin' : (state.profile?.role === 'pending' ? 'Belum Disahkan' : 'Guru');
  } else {
    loginBtn.classList.remove('hidden');
    chip.classList.add('hidden');
  }

  // Tab visibility ikut role
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const need = btn.dataset.need;
    let ok = true;
    if (need === 'login') ok = isLoggedIn();
    if (need === 'admin') ok = isAdmin();
    btn.classList.toggle('hidden', !ok);
  });

  // Kalau tab semasa jadi tak boleh akses, pulang ke induk
  const activeBtn = document.querySelector(`.tab-btn[data-tab="${currentTab}"]`);
  if (activeBtn && activeBtn.classList.contains('hidden')) {
    switchTab('induk');
  }

  // Refresh Saya tab jika status login berubah semasa tab tu aktif
  if (currentTab === 'saya') renderSayaGate();
  if (currentTab === 'admin' && isAdmin()) loadUserMgmt();
}

// ═══════════════════════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════════════════════
async function switchTab(tab) {
  const need = document.querySelector(`.tab-btn[data-tab="${tab}"]`)?.dataset.need;
  if (need === 'login' && !isLoggedIn()) tab = 'induk';
  if (need === 'admin' && !isAdmin()) tab = 'induk';

  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  ['induk', 'saya', 'kelas', 'papan', 'sejarah', 'admin'].forEach(t => {
    $('view-' + t).classList.toggle('hidden', t !== tab);
  });

  if (tab === 'induk') await loadInduk();
  else if (tab === 'saya') await renderSayaGate();
  else if (tab === 'kelas') await renderKelasGate();
  else if (tab === 'papan') await loadPapan();
  else if (tab === 'sejarah') await loadHistory();
  else if (tab === 'admin') { await loadExtraTeachersAdmin(); await loadAdminLogoPreview(); await loadUserMgmt(); }
}

async function onDateChange() {
  if (currentTab === 'induk') await loadInduk();
  else if (currentTab === 'saya') await renderSayaGate();
  else if (currentTab === 'kelas') await renderKelasGate();
  else if (currentTab === 'papan') await loadPapan();
  else if (currentTab === 'sejarah') await loadHistory();
}

// ═══════════════════════════════════════════════════════════
// TAB: JADUAL INDUK (awam)
// ═══════════════════════════════════════════════════════════
async function loadInduk() {
  $('induk-content').innerHTML = loadingCard();
  try {
    const res = await db.getGuruPageData(getDate());
    guruBoard = res.board;
    renderInduk();
  } catch (e) { $('induk-content').innerHTML = `<div class="card"><div class="state-box"><div class="s-title">Ralat</div><div class="s-sub">${esc(e.message)}</div></div></div>`; }
}

function renderInduk() {
  const bn = $('induk-banner'), ct = $('induk-content');
  const board = guruBoard;
  if (!board || !board.success) { ct.innerHTML = ''; bn.className = 'hidden'; return; }

  if (!board.published) setBanner(bn, 'pending', 'fa-clock', 'Jadual guru ganti belum disahkan oleh pentadbir. Data di bawah mungkin berubah.');
  else setBanner(bn, 'confirmed', 'fa-check-circle', 'Jadual telah disahkan. Data adalah muktamad.');

  const rd = board.reliefDuties || {};
  const all = [];
  Object.entries(rd).forEach(([rn, ds]) => ds.forEach(d => all.push({ ...d, reliefName: rn })));
  all.sort((a, b) => {
    const ai = parseInt(a.period, 10), bi = parseInt(b.period, 10);
    return (!isNaN(ai) && !isNaN(bi)) ? ai - bi : String(a.period).localeCompare(String(b.period));
  });

  if (all.length === 0) {
    ct.innerHTML = `<div class="card"><div class="state-box"><div class="s-icon">📋</div><div class="s-title">Tiada Tugasan Guru Ganti</div><div class="s-sub">Tiada sebarang tugasan bagi tarikh ini.</div></div></div>`;
    return;
  }

  const rCount = Object.keys(rd).length, cSet = new Set(all.map(d => d.className));
  let h = `<div class="summary-row">
      <div class="sum-chip"><div class="sum-num">${all.length}</div><div class="sum-lbl"><i class="fas fa-tasks" style="color:var(--teal);margin-right:3px;"></i>Jumlah Slot</div></div>
      <div class="sum-chip"><div class="sum-num">${rCount}</div><div class="sum-lbl"><i class="fas fa-user-check" style="color:var(--success);margin-right:3px;"></i>Guru Bertugas</div></div>
      <div class="sum-chip"><div class="sum-num">${cSet.size}</div><div class="sum-lbl"><i class="fas fa-door-open" style="color:var(--navy);margin-right:3px;"></i>Kelas Terlibat</div></div>
    </div>
    <div class="card fade-in">
      <div class="card-head"><div class="card-head-icon" style="background:linear-gradient(135deg,#7c3aed,#6d28d9);"><i class="fas fa-list-alt"></i></div>
        <div><div class="card-head-title">Senarai Lengkap Guru Ganti</div><div class="card-head-sub">${esc(board.dayName || '')} · ${all.length} tugasan · ${rCount} guru</div></div></div>
      <div class="table-wrap"><table class="m-table"><thead><tr><th>Waktu</th><th>Masa</th><th>Kelas</th><th>Subjek</th><th>Guru Ganti</th><th>Menggantikan</th><th>Catatan</th></tr></thead><tbody>`;
  all.forEach(d => {
    h += `<tr>
      <td><span class="p-pill">${esc(d.period)}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--muted);white-space:nowrap;">${esc(d.time)}</td>
      <td><span class="c-pill">${esc(d.className)}</span></td>
      <td style="font-weight:700;font-size:.82rem;">${esc(d.subject) || '—'}</td>
      <td><div class="r-name"><i class="fas fa-check-circle" style="font-size:.72rem;"></i>${esc(d.reliefName)}</div></td>
      <td><div class="a-name"><i class="fas fa-user-slash" style="font-size:.65rem;"></i>${esc(d.absentTeacher) || '—'}</div></td>
      <td style="min-width:130px;">${d.note ? `<div class="note-chip"><i class="fas fa-sticky-note"></i>${esc(d.note)}</div>` : '<span style="color:#cbd5e1;font-size:.7rem;">—</span>'}</td>
    </tr>`;
  });
  h += `</tbody></table></div></div>`;
  ct.innerHTML = h;
}

// ═══════════════════════════════════════════════════════════
// TAB: JADUAL SAYA (login)
// ═══════════════════════════════════════════════════════════
async function renderSayaGate() {
  if (!isLoggedIn()) {
    $('saya-lock').classList.remove('hidden');
    $('saya-pickname').classList.add('hidden');
    $('t-banner').classList.add('hidden');
    $('saya-banner').classList.add('hidden');
    $('saya-content').innerHTML = '';
    return;
  }
  $('saya-lock').classList.add('hidden');

  const boundId = authState.profile?.teacherId;
  if (boundId) {
    const t = teachersList.find(x => x.id === boundId);
    if (t) {
      selT = t;
      $('saya-pickname').classList.add('hidden');
      $('t-banner').classList.remove('hidden');
      $('t-name').textContent = t.name;
      $('t-sub').textContent = t.short ? t.short + ' · Guru' : 'Guru';
      await loadGuruBoardAndRender('saya');
      return;
    }
  }
  // Belum ada pautan nama — tunjuk carian
  $('saya-pickname').classList.remove('hidden');
  $('t-banner').classList.add('hidden');
  $('saya-banner').classList.add('hidden');
  $('saya-content').innerHTML = '';
  renderDD('');
}

async function loadGuruBoardAndRender(which) {
  $((which === 'saya' ? 'saya-content' : 'kelas-content')).innerHTML = loadingCard();
  try {
    const res = await db.getGuruPageData(getDate());
    guruBoard = res.board;
    if (which === 'saya') renderSaya(); else renderKelas();
  } catch (e) { toast('Ralat memuat data: ' + e.message, 'error'); }
}

function renderSaya() {
  const bn = $('saya-banner'), ct = $('saya-content');
  const board = guruBoard;
  if (!board || !board.success) { ct.innerHTML = ''; bn.className = 'hidden'; return; }
  if (!board.published) setBanner(bn, 'pending', 'fa-clock', 'Jadual guru ganti belum disahkan oleh pentadbir. Data di bawah mungkin berubah.');
  else setBanner(bn, 'confirmed', 'fa-check-circle', 'Jadual telah disahkan. Data adalah muktamad.');
  bn.classList.remove('hidden');
  if (!selT) { ct.innerHTML = ''; return; }
  renderPersonalTimetable(ct, board);
}

function renderPersonalTimetable(ct, board) {
  const periods = board.periods || [];
  const reliefDuties = board.reliefDuties || {};
  const myRelief = reliefDuties[selT.name] || [];
  let mySlots = {};
  if (board.teacherMap && board.teacherMap[selT.id]) mySlots = board.teacherMap[selT.id];
  const reliefByPeriod = {};
  myRelief.forEach(d => { reliefByPeriod[String(d.period)] = d; });

  let cTeach = 0, cRelief = 0, cOverride = 0, cFree = 0, rows = '';
  periods.forEach(p => {
    if (p.isRehat) {
      rows += `<div class="pt-row row-rehat"><div class="pt-period-col"><span class="period-rehat-lbl">☕<br>Rehat</span></div>
        <div class="pt-content-col" style="justify-content:center;"><span class="slot-chip chip-rehat"><i class="fas fa-coffee" style="font-size:.6rem;"></i> ${esc(p.start)} — ${esc(p.end)}</span></div></div>`;
      return;
    }
    const pid = String(p.id);
    const normals = mySlots[pid] || [];
    const hasClass = normals.length > 0;
    const hasRelief = !!reliefByPeriod[pid];
    const relief = reliefByPeriod[pid] || {};
    let rowClass, chipHtml, mainHtml;

    if (hasClass && hasRelief) {
      rowClass = 'row-override'; cOverride++;
      chipHtml = `<span class="slot-chip chip-override"><i class="fas fa-exclamation-triangle" style="font-size:.6rem;"></i> Mengajar + Ganti</span>`;
      const classLines = normals.map(n => `<div class="slot-main-text">${esc(n.className)}</div><div class="slot-sub-text">${esc(n.subject) || '—'}</div>`).join('');
      mainHtml = `${classLines}<div class="slot-override-alert"><i class="fas fa-user-slash" style="font-size:.7rem;flex-shrink:0;"></i>
        <span>Ganti: <strong>${esc(relief.className)}</strong> · ${esc(relief.subject) || '—'} <span style="opacity:.7;">(menggantikan ${esc(relief.absentTeacher) || '?'})</span></span></div>
        ${relief.note ? `<div class="note-box"><i class="fas fa-sticky-note"></i>${esc(relief.note)}</div>` : ''}`;
    } else if (hasClass && !hasRelief) {
      rowClass = 'row-normal'; cTeach++;
      chipHtml = `<span class="slot-chip chip-normal"><i class="fas fa-chalkboard" style="font-size:.6rem;"></i> Mengajar</span>`;
      if (normals.length === 1) {
        mainHtml = `<div class="slot-main-text">${esc(normals[0].className)}</div><div class="slot-sub-text">${esc(normals[0].subject) || '—'}</div>`;
      } else {
        mainHtml = normals.map((n, i) => `<div style="${i > 0 ? 'margin-top:6px;padding-top:6px;border-top:1px dashed #e2e8f0;' : ''}">
          <div class="slot-main-text">${esc(n.className)}</div><div class="slot-sub-text">${esc(n.subject) || '—'}</div></div>`).join('');
      }
    } else if (!hasClass && hasRelief) {
      rowClass = 'row-relief'; cRelief++;
      chipHtml = `<span class="slot-chip chip-relief"><i class="fas fa-user-check" style="font-size:.6rem;"></i> Guru Ganti</span>`;
      mainHtml = `<div class="slot-main-text">${esc(relief.className)}</div><div class="slot-sub-text">${esc(relief.subject) || '—'}</div>
        <div class="slot-relief-text"><i class="fas fa-user-slash" style="font-size:.65rem;"></i> Menggantikan ${esc(relief.absentTeacher) || '?'}</div>
        ${relief.note ? `<div class="note-box"><i class="fas fa-sticky-note"></i>${esc(relief.note)}</div>` : ''}`;
    } else {
      rowClass = 'row-free'; cFree++;
      chipHtml = `<span class="slot-chip chip-free"><i class="fas fa-check" style="font-size:.6rem;"></i> Lapang</span>`;
      mainHtml = `<div class="slot-sub-text" style="color:#cbd5e1;font-style:italic;">Tiada kelas</div>`;
    }
    rows += `<div class="pt-row ${rowClass}"><div class="pt-period-col"><span class="period-num">${esc(pid)}</span><span class="period-time">${esc(p.start)}<br>${esc(p.end)}</span></div>
      <div class="pt-content-col">${chipHtml}${mainHtml}</div></div>`;
  });

  ct.innerHTML = `<div class="personal-table-wrap fade-in">
    <div class="pt-header"><div class="pt-header-icon"><i class="fas fa-calendar-day"></i></div>
      <div><div class="pt-header-title">Jadual Hari Ini</div><div class="pt-header-sub">${esc(board.dayName || '')} · ${esc(selT.name)}</div></div></div>
    <div class="pt-legend">
      <div class="leg"><span class="leg-dot l-normal"></span> Kelas Biasa</div>
      <div class="leg"><span class="leg-dot l-relief"></span> Guru Ganti</div>
      <div class="leg"><span class="leg-dot l-override"></span> Mengajar + Ganti</div>
      <div class="leg"><span class="leg-dot l-free"></span> Lapang</div>
      <div class="leg"><span class="leg-dot l-rehat"></span> Rehat</div>
    </div>
    ${rows}
    <div class="pt-summary">
      <div class="pt-sum-item"><div class="pt-sum-num" style="color:#3b82f6;">${cTeach}</div><div class="pt-sum-lbl">Kelas Biasa</div></div>
      <div class="pt-sum-item"><div class="pt-sum-num" style="color:var(--success);">${cRelief}</div><div class="pt-sum-lbl">Guru Ganti</div></div>
      ${cOverride > 0 ? `<div class="pt-sum-item"><div class="pt-sum-num" style="color:#ea580c;">${cOverride}</div><div class="pt-sum-lbl">Override</div></div>` : ''}
      <div class="pt-sum-item"><div class="pt-sum-num" style="color:#94a3b8;">${cFree}</div><div class="pt-sum-lbl">Lapang</div></div>
    </div></div>`;
}

function changeTeacher() {
  selT = null;
  $('saya-pickname').classList.remove('hidden');
  $('t-banner').classList.add('hidden');
  $('tsearch').value = '';
  $('saya-content').innerHTML = '';
  renderDD('');
  setTimeout(() => $('tsearch').focus(), 80);
}

// ── Carian nama guru (first-time binding) ──
function getFiltered(q) {
  const ql = q.trim().toLowerCase();
  const base = ql ? teachersList.filter(t => t.name.toLowerCase().includes(ql) || (t.short || '').toLowerCase().includes(ql)) : teachersList;
  return [...base].sort((a, b) => a.name.localeCompare(b.name));
}
function getInitials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0);
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
function renderDD(q) {
  const f = getFiltered(q), dd = $('ddwrap');
  if (!teachersList.length) { dd.innerHTML = `<div class="dd-empty"><i class="fas fa-spinner fa-spin"></i>Memuatkan senarai guru...</div>`; return; }
  if (!f.length) { dd.innerHTML = `<div class="dd-empty"><i class="fas fa-search"></i>Tiada guru dijumpai untuk &ldquo;${esc(q)}&rdquo;</div>`; return; }
  const ql = q.trim().toLowerCase();
  dd.innerHTML = f.slice(0, 50).map((t, i) => {
    const hl = ql ? t.name.replace(new RegExp('(' + escRx(ql) + ')', 'gi'), '<em>$1</em>') : t.name;
    return `<div class="dd-item" data-idx="${i}" onmousedown="ReliefApp.selectT('${escJs(t.id)}')">
      <div class="dd-item-avatar">${esc(getInitials(t.name))}</div>
      <span class="dd-item-name">${hl}</span>${t.short ? `<span class="dd-item-short">${esc(t.short)}</span>` : ''}
    </div>`;
  }).join('');
  ddActive = -1;
}
function onSearchInput() { const v = $('tsearch').value; renderDD(v); openDD(); }
function onSearchFocus() { renderDD($('tsearch').value); openDD(); }
function openDD() { $('ddwrap').classList.add('open'); }
function closeDD() { $('ddwrap').classList.remove('open'); }
function clearSearch() { $('tsearch').value = ''; renderDD(''); openDD(); $('tsearch').focus(); }
document.addEventListener('click', e => { if ($('search-outer') && !$('search-outer').contains(e.target)) closeDD(); });

async function selectT(id) {
  const t = teachersList.find(x => x.id === id); if (!t) return;
  selT = t; closeDD();
  await setMyTeacherId(id);
  $('saya-pickname').classList.add('hidden');
  $('t-banner').classList.remove('hidden');
  $('t-name').textContent = t.name;
  $('t-sub').textContent = t.short ? t.short + ' · Guru' : 'Guru';
  await loadGuruBoardAndRender('saya');
  toast(`Nama anda ditetapkan sebagai ${t.name}.`, 'success');
}

// ═══════════════════════════════════════════════════════════
// TAB: JADUAL KELAS (login)
// ═══════════════════════════════════════════════════════════
async function renderKelasGate() {
  if (!isLoggedIn()) {
    $('kelas-lock').classList.remove('hidden');
    $('kelas-body').classList.add('hidden');
    return;
  }
  $('kelas-lock').classList.add('hidden');
  $('kelas-body').classList.remove('hidden');
  await loadGuruBoardAndRender('kelas');
}

function onKelasChange() { selKelas = $('kelas-select').value || null; if (guruBoard) renderKelas(); }

function renderKelas() {
  const bn = $('kelas-banner'), ct = $('kelas-content');
  const board = guruBoard;
  if (!board || !board.success) { ct.innerHTML = ''; bn.className = 'hidden'; return; }
  if (!board.published) setBanner(bn, 'pending', 'fa-clock', 'Jadual guru ganti belum disahkan oleh pentadbir. Data di bawah mungkin berubah.');
  else setBanner(bn, 'confirmed', 'fa-check-circle', 'Jadual telah disahkan. Data adalah muktamad.');
  bn.classList.remove('hidden');
  if (!selKelas) { ct.innerHTML = `<div class="card"><div class="state-box"><div class="s-icon">🏫</div><div class="s-title">Pilih Kelas</div><div class="s-sub">Sila pilih nama kelas dari senarai di atas.</div></div></div>`; return; }
  renderClassTimetable(ct, board);
}

function renderClassTimetable(ct, board) {
  const periods = board.periods || [];
  const rd = board.reliefDuties || {};
  const classSchedule = {};
  if (board.teacherMap) {
    Object.entries(board.teacherMap).forEach(([tid, data]) => {
      Object.keys(data).forEach(pid => {
        if (pid === 'name' || pid === 'id') return;
        (data[pid] || []).forEach(slot => {
          if (slot.className === selKelas) {
            if (!classSchedule[pid]) classSchedule[pid] = [];
            classSchedule[pid].push({ teacherId: tid, teacherName: data.name, subject: slot.subject || '' });
          }
        });
      });
    });
  }
  const classRelief = {};
  Object.entries(rd).forEach(([rn, duties]) => {
    duties.forEach(d => { if (d.className === selKelas) classRelief[String(d.period)] = { reliefName: rn, absentTeacher: d.absentTeacher || '', subject: d.subject || '', note: d.note || '' }; });
  });

  let cNormal = 0, cGanti = 0, cFree = 0, rows = '';
  periods.forEach(p => {
    if (p.isRehat) {
      rows += `<div class="pt-row row-rehat"><div class="pt-period-col"><span class="period-rehat-lbl">☕<br>Rehat</span></div>
        <div class="pt-content-col" style="justify-content:center;"><span class="slot-chip chip-rehat"><i class="fas fa-coffee" style="font-size:.6rem;"></i> ${esc(p.start)} — ${esc(p.end)}</span></div></div>`;
      return;
    }
    const pid = String(p.id);
    const scheds = classSchedule[pid] || [];
    const relief = classRelief[pid];
    let rowClass, chipHtml, mainHtml;
    if (scheds.length > 0 && relief) {
      cGanti++; rowClass = 'row-relief';
      chipHtml = `<span class="slot-chip chip-kelas-ganti"><i class="fas fa-user-check" style="font-size:.6rem;"></i> Guru Ganti</span>`;
      mainHtml = `<div class="slot-main-text">${esc(relief.subject || scheds[0].subject)}</div>
        <div class="slot-ganti-text"><i class="fas fa-user-check" style="font-size:.65rem;"></i>${esc(relief.reliefName)}</div>
        <div style="font-size:.68rem;color:var(--muted);margin-top:2px;display:flex;align-items:center;gap:4px;">
          <i class="fas fa-user-slash" style="font-size:.6rem;color:var(--danger);"></i>
          <span>${scheds.map(s => esc(s.teacherName)).join(', ')} <span style="opacity:.6;">(tidak hadir)</span></span></div>
        ${relief.note ? `<div class="note-box"><i class="fas fa-sticky-note"></i>${esc(relief.note)}</div>` : ''}`;
    } else if (scheds.length > 0 && !relief) {
      cNormal++; rowClass = 'row-normal';
      chipHtml = `<span class="slot-chip chip-normal"><i class="fas fa-chalkboard" style="font-size:.6rem;"></i> Kelas Biasa</span>`;
      if (scheds.length === 1) {
        mainHtml = `<div class="slot-main-text">${esc(scheds[0].subject) || '—'}</div><div class="slot-sub-text"><i class="fas fa-user" style="font-size:.6rem;margin-right:4px;"></i>${esc(scheds[0].teacherName)}</div>`;
      } else {
        mainHtml = `<div class="slot-main-text">${esc(scheds[0].subject) || '—'}</div><div class="slot-sub-text"><i class="fas fa-users" style="font-size:.6rem;margin-right:4px;"></i>${scheds.map(s => esc(s.teacherName)).join(' · ')}
          <span style="background:#e0f2fe;color:#0369a1;border-radius:5px;padding:1px 6px;font-size:.6rem;margin-left:4px;font-weight:800;">Team</span></div>`;
      }
    } else {
      cFree++; rowClass = 'row-free';
      chipHtml = `<span class="slot-chip chip-free"><i class="fas fa-minus" style="font-size:.6rem;"></i> Tiada Kelas</span>`;
      mainHtml = `<div class="slot-sub-text" style="color:#cbd5e1;font-style:italic;">Tiada sesi pada waktu ini</div>`;
    }
    rows += `<div class="pt-row ${rowClass}"><div class="pt-period-col"><span class="period-num">${esc(pid)}</span><span class="period-time">${esc(p.start)}<br>${esc(p.end)}</span></div>
      <div class="pt-content-col">${chipHtml}${mainHtml}</div></div>`;
  });

  ct.innerHTML = `<div class="k-banner fade-in"><div class="k-av"><i class="fas fa-door-open"></i></div>
    <div style="min-width:0;flex:1;"><div class="k-name">${esc(selKelas)}</div><div class="k-sub">Jadual Kelas Hari Ini · ${esc(board.dayName || '')}</div></div></div>
    <div class="personal-table-wrap fade-in">
      <div class="pt-header" style="background:linear-gradient(135deg,#5b21b6,#7c3aed);"><div class="pt-header-icon"><i class="fas fa-calendar-day"></i></div>
        <div><div class="pt-header-title">Jadual ${esc(selKelas)}</div><div class="pt-header-sub">${esc(board.dayName || '')} · ${cGanti} slot guru ganti</div></div></div>
      <div class="pt-legend">
        <div class="leg"><span class="leg-dot l-normal"></span> Kelas Biasa</div>
        <div class="leg"><span class="leg-dot l-ganti"></span> Guru Ganti</div>
        <div class="leg"><span class="leg-dot l-free"></span> Tiada Kelas</div>
        <div class="leg"><span class="leg-dot l-rehat"></span> Rehat</div>
      </div>
      ${rows}
      <div class="pt-summary">
        <div class="pt-sum-item"><div class="pt-sum-num" style="color:#3b82f6;">${cNormal}</div><div class="pt-sum-lbl">Kelas Biasa</div></div>
        <div class="pt-sum-item"><div class="pt-sum-num" style="color:#7c3aed;">${cGanti}</div><div class="pt-sum-lbl">Guru Ganti</div></div>
        <div class="pt-sum-item"><div class="pt-sum-num" style="color:#94a3b8;">${cFree}</div><div class="pt-sum-lbl">Tiada Kelas</div></div>
      </div></div>`;
}

// ═══════════════════════════════════════════════════════════
// TAB: PAPAN HARIAN (admin)
// ═══════════════════════════════════════════════════════════
async function loadPapan() {
  $('papan-loading').classList.remove('hidden');
  $('papan-content').classList.add('hidden');
  try {
    currentBoard = await db.getDailyBoard(getDate());
    populateAbsentSelect();
    renderAbsentPanel();
    renderAssignCards();
    renderBoardStatus();
    $('papan-loading').classList.add('hidden');
    $('papan-content').classList.remove('hidden');
  } catch (e) {
    $('papan-loading').classList.add('hidden');
    toast('Ralat memuat papan: ' + e.message, 'error');
  }
}

function populateAbsentSelect() {
  const sel = $('absent-teacher-select');
  const absentSet = new Set(currentBoard.absentIds || []);
  const avail = teachersList.filter(t => !absentSet.has(t.id)).sort((a, b) => a.name.localeCompare(b.name));
  sel.innerHTML = '<option value="">— Pilih Guru —</option>' + avail.map(t => `<option value="${esc(t.id)}">${esc(t.name)}${t.short ? ' (' + esc(t.short) + ')' : ''}</option>`).join('');
}

function renderBoardStatus() {
  const chip = $('board-status-chip');
  const confirmed = currentBoard.status === 'confirmed';
  chip.innerHTML = `<span class="status-chip ${confirmed ? 'confirmed' : 'draft'}"><i class="fas ${confirmed ? 'fa-check-circle' : 'fa-pen'}"></i> ${confirmed ? 'Disahkan' : 'Draf'}</span>`;
}

function renderAbsentPanel() {
  const wrap = $('absent-tags-container');
  const ids = currentBoard.absentIds || [];
  if (!ids.length) { wrap.innerHTML = `<div style="color:var(--muted);font-size:.8rem;padding:8px 0;">Tiada guru ditanda tidak hadir.</div>`; return; }
  wrap.innerHTML = ids.map(id => {
    const t = teachersList.find(x => x.id === id) || { name: id };
    const reason = (currentBoard.absentReasons || {})[id] || '—';
    return `<span class="absent-tag" style="display:inline-flex;align-items:center;gap:6px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:20px;padding:6px 10px;font-size:.75rem;font-weight:700;margin:0 6px 6px 0;">
      <i class="fas fa-user-slash" style="font-size:.65rem;"></i> ${esc(t.name)} <span style="font-weight:500;opacity:.75;">(${esc(reason)})</span>
      <button onclick="ReliefApp.removeAbsent('${escJs(id)}')" style="background:none;border:none;color:#b91c1c;cursor:pointer;padding:0 2px;"><i class="fas fa-times"></i></button>
    </span>`;
  }).join('');
}

async function addAbsent() {
  const id = $('absent-teacher-select').value;
  const reason = $('absent-reason-select').value;
  if (!id) return toast('Sila pilih guru.', 'error');
  if (!reason) return toast('Sila pilih sebab ketidakhadiran.', 'error');
  const res = await db.addAbsentTeacher({ date: getDate(), teacherId: id, reason });
  if (!res.success) return toast(res.message, 'error');
  currentBoard = res;
  populateAbsentSelect();
  renderAbsentPanel();
  renderAssignCards();
  $('absent-reason-select').value = '';
  toast('Guru ditanda tidak hadir.', 'success');
}

function removeAbsent(teacherId) {
  const t = teachersList.find(x => x.id === teacherId);
  showConfirm({
    title: 'Buang Tanda Tidak Hadir', msg: `Buang ${t ? t.name : teacherId} dari senarai tidak hadir? Tugasan guru ganti berkaitan akan turut dipadam.`,
    okLabel: 'Buang', okType: 'warn',
    onOk: async () => {
      const res = await db.removeAbsentTeacher({ date: getDate(), teacherId });
      if (!res.success) return toast(res.message, 'error');
      currentBoard = res;
      populateAbsentSelect(); renderAbsentPanel(); renderAssignCards();
      toast('Ditanggalkan.', 'success');
    }
  });
}

function renderAssignCards() {
  const wrap = $('assign-list-wrap');
  const ids = currentBoard.absentIds || [];
  if (!ids.length) { wrap.innerHTML = ''; return; }

  let html = '';
  ids.forEach(tid => {
    const t = teachersList.find(x => x.id === tid) || { name: tid };
    const slotsByPeriod = currentBoard.teacherMap?.[tid] || {};
    const periodIds = Object.keys(slotsByPeriod).filter(k => k !== 'name' && k !== 'id');
    if (!periodIds.length) return;
    html += `<div class="card admin-section"><div class="card-head"><div class="card-head-icon" style="background:linear-gradient(135deg,#dc2626,#b91c1c);"><i class="fas fa-user-slash"></i></div>
      <div><div class="card-head-title">${esc(t.name)}</div><div class="card-head-sub">${periodIds.length} slot perlu guru ganti</div></div></div><div class="card-body">`;
    periodIds.sort((a, b) => { const ai = parseInt(a, 10), bi = parseInt(b, 10); return (!isNaN(ai) && !isNaN(bi)) ? ai - bi : a.localeCompare(b); })
      .forEach(pid => {
        (slotsByPeriod[pid] || []).forEach(slot => {
          const period = (currentBoard.periods || []).find(p => p.id === pid) || {};
          html += `<div class="assign-period-card">
            <div class="assign-period-head">
              <div><strong>Wkt ${esc(pid)}</strong> · ${esc(period.start || '')}–${esc(period.end || '')} · <span class="c-pill">${esc(slot.className)}</span> · ${esc(slot.subject) || '—'}</div>
            </div>
            ${slot.reliefTeacher
              ? `<div class="assign-period-relief"><span><i class="fas fa-check-circle"></i> ${esc(slot.reliefTeacher)}${slot.note ? ' · 📝 ' + esc(slot.note) : ''}</span>
                  <button class="btn-ghost btn-sm" onclick="ReliefApp.openAssignModal('${escJs(slot.assignKey)}')"><i class="fas fa-edit"></i></button></div>`
              : `<div class="assign-period-empty" onclick="ReliefApp.openAssignModal('${escJs(slot.assignKey)}')"><i class="fas fa-plus"></i> Tetapkan Guru Ganti</div>`}
          </div>`;
        });
      });
    html += `</div></div>`;
  });
  wrap.innerHTML = html || `<div class="card"><div class="state-box"><div class="s-sub">Tiada slot memerlukan guru ganti.</div></div></div>`;
}

// ── Assign modal ──
function openAssignModal(assignKey) {
  const [teacherId, periodId, className] = assignKey.split('|');
  currentAssignSlot = { assignKey, teacherId, periodId, className };
  overrideOn = false;
  $('override-toggle').checked = false;
  const existing = currentBoard.assignments?.[assignKey];
  const { note } = getReliefFromAssignment(existing);
  $('assign-note').value = note || '';
  $('assign-search').value = '';
  $('assign-modal-title').textContent = `Guru Ganti — ${className} · Wkt ${periodId}`;
  renderAssignList();
  $('assignModal').classList.remove('hidden');
}
function closeAssignModal() { $('assignModal').classList.add('hidden'); currentAssignSlot = null; }
function toggleOverride() { overrideOn = $('override-toggle').checked; renderAssignList(); }

function renderAssignList() {
  if (!currentAssignSlot) return;
  const { periodId, assignKey } = currentAssignSlot;
  const q = ($('assign-search').value || '').trim().toLowerCase();
  const availList = currentBoard.periodAvailMap?.[periodId] || [];
  const currentRelief = getReliefFromAssignment(currentBoard.assignments?.[assignKey]).relief;

  const reliefBusySet = new Set();
  Object.entries(currentBoard.assignments || {}).forEach(([key, val]) => {
    const name = getReliefFromAssignment(val).relief;
    if (!name) return;
    if (key.split('|')[1] === periodId && key !== assignKey) reliefBusySet.add(name);
  });

  let pool = overrideOn ? teachersList.map(t => availList.find(a => a.id === t.id) || { ...t, freeSlots: '—', busyPeriods: '—', reliefCount: 0 }) : availList.filter(t => !reliefBusySet.has(t.name));
  if (q) pool = pool.filter(t => t.name.toLowerCase().includes(q));
  pool = [...pool].sort((a, b) => (b.freeSlots === '—' ? -1 : b.freeSlots) - (a.freeSlots === '—' ? -1 : a.freeSlots));

  $('assign-available-list').innerHTML = pool.length ? pool.map(t => {
    const isSelected = currentRelief === t.name;
    const isBusyRelief = reliefBusySet.has(t.name);
    const isAbsent = (currentBoard.absentIds || []).includes(t.id);
    const clickable = overrideOn ? true : (!isAbsent && !isBusyRelief);
    return `<div class="assign-teacher-card ${isSelected ? 'selected' : ''}" style="${!clickable ? 'opacity:.5;' : 'cursor:pointer;'}" ${clickable ? `onclick="ReliefApp.selectTeacher('${escJs(t.name)}')"` : ''}>
      <div style="flex:1;min-width:0;">
        <div class="assign-teacher-name">${esc(t.name)}</div>
        <div class="assign-teacher-stats">
          <span class="assign-stat-chip assign-stat-free">${t.freeSlots ?? '—'} bebas</span>
          <span class="assign-stat-chip assign-stat-busy">${t.busyPeriods ?? '—'} mengajar</span>
          ${t.reliefCount ? `<span class="assign-stat-chip assign-stat-relief">${t.reliefCount}× relief</span>` : ''}
          ${isAbsent ? `<span class="assign-stat-chip assign-stat-busy">✗ Tidak Hadir</span>` : ''}
          ${isBusyRelief ? `<span class="assign-stat-chip assign-stat-busy">📌 Relief lain</span>` : ''}
        </div>
      </div>
      ${clickable ? `<button class="btn-assign ${isSelected ? 'selected' : ''}" onclick="event.stopPropagation();ReliefApp.selectTeacher('${escJs(t.name)}')">${isSelected ? '<i class="fas fa-check"></i>' : '<i class="fas fa-hand-pointer"></i>'}</button>` : ''}
    </div>`;
  }).join('') : `<div style="text-align:center;padding:20px;color:var(--muted);font-size:.85rem;">Tiada guru sepadan.</div>`;
}

async function selectTeacher(teacherName) {
  if (!currentAssignSlot) return;
  const note = $('assign-note').value.trim();
  const res = await db.updateAssignment({ date: getDate(), assignKey: currentAssignSlot.assignKey, reliefTeacher: teacherName, note });
  if (!res.success) return toast('Gagal simpan: ' + res.message, 'error');
  currentBoard = res;
  renderAssignCards(); closeAssignModal(); renderBoardStatus();
  toast(`${teacherName} dipilih sebagai guru ganti.`, 'success');
}
async function clearAssignment() {
  if (!currentAssignSlot) return;
  const res = await db.updateAssignment({ date: getDate(), assignKey: currentAssignSlot.assignKey, reliefTeacher: '', note: '' });
  if (!res.success) return toast('Gagal: ' + res.message, 'error');
  currentBoard = res;
  renderAssignCards(); closeAssignModal();
}
async function saveNoteOnly() {
  if (!currentAssignSlot) return;
  const note = $('assign-note').value.trim();
  const existing = getReliefFromAssignment(currentBoard.assignments?.[currentAssignSlot.assignKey]).relief;
  const res = await db.updateAssignment({ date: getDate(), assignKey: currentAssignSlot.assignKey, reliefTeacher: existing, note });
  if (!res.success) return toast('Gagal: ' + res.message, 'error');
  currentBoard = res;
  renderAssignCards(); closeAssignModal();
  toast('Catatan disimpan.', 'success');
}

function confirmBoard() {
  showConfirm({
    title: 'Sahkan Tapak Harian', msg: 'Selepas disahkan, jadual akan dipaparkan sebagai muktamad di Jadual Induk & jadual guru. Teruskan?',
    okLabel: 'Sahkan', okType: 'primary',
    onOk: async () => {
      const res = await db.confirmDailyBoard({ date: getDate() });
      if (!res.success) return toast(res.message, 'error');
      toast(res.message, 'success');
      await loadPapan();
    }
  });
}

async function generatePdf() {
  if (!currentBoard) return;
  const ids = currentBoard.absentIds || [];
  let rows = '';
  ids.forEach(tid => {
    const t = teachersList.find(x => x.id === tid) || { name: tid };
    const slotsByPeriod = currentBoard.teacherMap?.[tid] || {};
    Object.keys(slotsByPeriod).filter(k => k !== 'name' && k !== 'id').forEach(pid => {
      (slotsByPeriod[pid] || []).forEach(slot => {
        const period = (currentBoard.periods || []).find(p => p.id === pid) || {};
        rows += `<tr><td>${esc(pid)}</td><td>${esc(period.start || '')}–${esc(period.end || '')}</td><td>${esc(slot.className)}</td><td>${esc(slot.subject) || '—'}</td>
          <td>${esc(t.name)}</td><td class="${slot.reliefTeacher ? 'green' : 'red'}">${esc(slot.reliefTeacher) || 'BELUM DITETAPKAN'}</td><td>${esc(slot.note) || ''}</td></tr>`;
      });
    });
  });
  const html = `<div class="pdf-title">Jadual Guru Ganti — ${esc(currentBoard.dayName || '')}</div>
    <div class="pdf-sub">${esc(getDate())}</div>
    <table><thead><tr><th>Waktu</th><th>Masa</th><th>Kelas</th><th>Subjek</th><th>Tidak Hadir</th><th>Guru Ganti</th><th>Catatan</th></tr></thead><tbody>${rows}</tbody></table>`;
  await exportHtmlToPdf(html, `Jadual_Guru_Ganti_${getDate()}`);
}

// ═══════════════════════════════════════════════════════════
// TAB: SEJARAH (admin)
// ═══════════════════════════════════════════════════════════
async function loadHistory() {
  $('history-container').innerHTML = loadingCard();
  try {
    const records = await db.getReliefByDate(getDate());
    renderHistory(records);
  } catch (e) { $('history-container').innerHTML = `<div class="card"><div class="state-box"><div class="s-sub">${esc(e.message)}</div></div></div>`; }
}
function renderHistory(records) {
  const ct = $('history-container');
  if (!records.length) { ct.innerHTML = `<div class="card"><div class="state-box"><div class="s-icon">🗂️</div><div class="s-title">Tiada Rekod</div><div class="s-sub">Tiada rekod guru ganti disahkan untuk tarikh ini.</div></div></div>`; return; }
  let h = `<div class="card"><div class="table-wrap"><table class="m-table"><thead><tr><th>Waktu</th><th>Masa</th><th>Kelas</th><th>Subjek</th><th>Tidak Hadir</th><th>Guru Ganti</th><th>Catatan</th></tr></thead><tbody>`;
  records.forEach(r => {
    h += `<tr><td>${esc(r.period)}</td><td>${esc(r.time)}</td><td>${esc(r.className)}</td><td>${esc(r.subject)}</td><td>${esc(r.absentTeacher)}</td><td>${esc(r.reliefTeacher)}</td><td>${esc(r.note) || '—'}</td></tr>`;
  });
  h += `</tbody></table></div></div>`;
  ct.innerHTML = h;
}
async function printArchive() {
  const records = await db.getReliefByDate(getDate());
  if (!records.length) return toast('Tiada rekod untuk dieksport.', 'error');
  let rows = records.map(r => `<tr><td>${esc(r.period)}</td><td>${esc(r.time)}</td><td>${esc(r.className)}</td><td>${esc(r.subject)}</td><td>${esc(r.absentTeacher)}</td><td class="green">${esc(r.reliefTeacher)}</td><td>${esc(r.note) || ''}</td></tr>`).join('');
  const html = `<div class="pdf-title">Arkib Guru Ganti</div><div class="pdf-sub">${esc(getDate())}</div>
    <table><thead><tr><th>Waktu</th><th>Masa</th><th>Kelas</th><th>Subjek</th><th>Tidak Hadir</th><th>Guru Ganti</th><th>Catatan</th></tr></thead><tbody>${rows}</tbody></table>`;
  await exportHtmlToPdf(html, `Arkib_Guru_Ganti_${getDate()}`);
}

// ═══════════════════════════════════════════════════════════
// TAB: ADMIN
// ═══════════════════════════════════════════════════════════
$('xmlFile') && $('xmlFile').addEventListener('change', async function (e) {
  const file = e.target.files[0];
  if (!file) return;
  $('setup-msg').textContent = '';
  $('setup-loading').classList.remove('hidden');
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const res = await processASCXML(ev.target.result, (msg) => { $('setup-loading-msg').textContent = msg; });
    $('setup-loading').classList.add('hidden');
    $('setup-msg').innerHTML = res.success
      ? `<span style="color:var(--success);">${esc(res.message)}</span>`
      : `<span style="color:var(--danger);">${esc(res.message)}</span>`;
    if (res.success) { await loadStaticLists(); }
    $('xmlFile').value = '';
  };
  reader.onerror = () => { $('setup-loading').classList.add('hidden'); $('setup-msg').innerHTML = `<span style="color:var(--danger);">Gagal membaca fail.</span>`; };
  reader.readAsText(file);
});

async function loadExtraTeachersAdmin() {
  const wrap = $('extra-teacher-list');
  wrap.innerHTML = 'Memuatkan...';
  const list = await db.getExtraTeachers();
  if (!list.length) { wrap.innerHTML = `<div style="color:var(--muted);font-size:.8rem;padding:8px 0;">Tiada guru tambahan.</div>`; return; }
  wrap.innerHTML = list.map(t => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
    <div><strong>${esc(t.name)}</strong> ${t.short ? '<span style="color:var(--muted);font-size:.75rem;">(' + esc(t.short) + ')</span>' : ''}</div>
    <button class="btn-ghost btn-sm" style="color:#dc2626;" onclick="ReliefApp.deleteExtraTeacherAction('${escJs(t.id)}')"><i class="fas fa-trash"></i></button></div>`).join('');
}
async function addExtraTeacherAction() {
  const name = $('extraTeacherName').value.trim();
  const short = $('extraTeacherShort').value.trim();
  const res = await db.addExtraTeacher({ name, short });
  if (!res.success) return toast(res.message, 'error');
  $('extraTeacherName').value = ''; $('extraTeacherShort').value = '';
  await loadStaticLists();
  await loadExtraTeachersAdmin();
  toast('Guru ditambah.', 'success');
}
function deleteExtraTeacherAction(id) {
  showConfirm({
    title: 'Padam Guru', msg: 'Padam guru tambahan ini?', okLabel: 'Padam', okType: 'warn',
    onOk: async () => {
      const res = await db.deleteExtraTeacher(id);
      if (!res.success) return toast(res.message, 'error');
      await loadStaticLists(); await loadExtraTeachersAdmin();
      toast('Dipadam.', 'success');
    }
  });
}

async function loadAdminLogoPreview() {
  const b64 = await db.getLogo();
  if (b64) { $('logo-preview-img').src = b64; $('logo-preview-img').style.display = 'block'; $('logo-preview-empty').style.display = 'none'; }
  else { $('logo-preview-img').style.display = 'none'; $('logo-preview-empty').style.display = 'block'; }
}
function previewLogo(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    pendingLogoBase64 = e.target.result;
    $('logo-preview-img').src = pendingLogoBase64; $('logo-preview-img').style.display = 'block'; $('logo-preview-empty').style.display = 'none';
    $('btn-save-logo').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}
async function saveLogoAction() {
  if (pendingLogoBase64 === undefined) return;
  const res = await db.saveLogo(pendingLogoBase64);
  if (!res.success) return toast(res.message, 'error');
  $('btn-save-logo').classList.add('hidden');
  toast('Logo disimpan.', 'success');
}
function removeLogoAction() {
  showConfirm({
    title: 'Padam Logo', msg: 'Padam logo sekolah?', okLabel: 'Padam', okType: 'warn',
    onOk: async () => { await db.saveLogo(null); pendingLogoBase64 = undefined; await loadAdminLogoPreview(); toast('Logo dipadam.', 'success'); }
  });
}

async function loadUserMgmt() {
  const wrap = $('user-mgmt-list');
  if (!isAdmin()) return;
  wrap.innerHTML = 'Memuatkan...';
  const users = await db.listUsers();
  if (!users.length) { wrap.innerHTML = `<div style="color:var(--muted);font-size:.8rem;">Tiada pengguna log masuk lagi.</div>`; return; }
  users.sort((a, b) => (a.role === 'pending' ? -1 : 1) - (b.role === 'pending' ? -1 : 1));
  wrap.innerHTML = users.map(u => `<div class="user-row">
    <img src="${esc(u.photoURL || '')}" onerror="this.style.visibility='hidden'">
    <div class="u-meta"><div style="font-weight:700;font-size:.82rem;">${esc(u.name || u.email)}</div><div class="u-email">${esc(u.email)}</div></div>
    <select onchange="ReliefApp.setUserRoleAction('${escJs(u.uid)}', this.value)">
      <option value="pending" ${u.role === 'pending' ? 'selected' : ''}>Belum Disahkan</option>
      <option value="guru" ${u.role === 'guru' ? 'selected' : ''}>Guru</option>
      <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
    </select></div>`).join('');
}
async function setUserRoleAction(uid, role) {
  await db.setUserRole(uid, role);
  toast('Role dikemaskini.', 'success');
  if (uid === authState.user?.uid) location.reload();
}

// ═══════════════════════════════════════════════════════════
// EXPORT ke window (untuk onclick inline dalam index.html)
// ═══════════════════════════════════════════════════════════
window.ReliefApp = {
  login: loginWithGoogle, logout,
  switchTab, onDateChange,
  selectT, changeTeacher, onSearchInput, onSearchFocus, clearSearch,
  onKelasChange,
  addAbsent, removeAbsent,
  openAssignModal, closeAssignModal, renderAssignList, toggleOverride,
  selectTeacher, clearAssignment, saveNoteOnly,
  confirmBoard, generatePdf, printArchive,
  addExtraTeacherAction, deleteExtraTeacherAction,
  previewLogo, saveLogoAction, removeLogoAction,
  setUserRoleAction,
  pickReason: () => {}, openReasonModal: () => {}, closeReasonModal: () => {} // reserved
};

initApp();

import { initNav, gatePage } from './nav.js';
import { authState, setMyTeacherId } from './auth.js';
import * as db from './db.js';
import { loadStaticLists } from './shared-data.js';
import { $, esc, escJs, escRx, todayStr, loadingCard, setBanner, toast } from './ui-utils.js';

initNav('ruang-guru');

let teachersList = [], classList = [];
let guruBoard = null;
let selT = null, selKelas = null;
let currentSub = 'saya';
let ddActive = -1;

function getDate() { return $('datePicker').value; }

function switchSub(sub) {
  currentSub = sub;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.sub === sub));
  $('sub-saya').classList.toggle('hidden', sub !== 'saya');
  $('sub-kelas').classList.toggle('hidden', sub !== 'kelas');
  if (sub === 'saya') renderSayaGate();
  else renderKelasGate();
}

async function onDateChange() {
  if (currentSub === 'saya') await renderSayaGate();
  else await renderKelasGate();
}

async function loadGuruBoardAndRender(which) {
  $(which === 'saya' ? 'saya-content' : 'kelas-content').innerHTML = loadingCard();
  try {
    const res = await db.getGuruPageData(getDate());
    guruBoard = res.board;
    if (which === 'saya') renderSaya(); else renderKelas();
  } catch (e) { toast('Ralat memuat data: ' + e.message, 'error'); }
}

// ═══ JADUAL SAYA ═══
async function renderSayaGate() {
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
  $('saya-pickname').classList.remove('hidden');
  $('t-banner').classList.add('hidden');
  $('saya-banner').classList.add('hidden');
  $('saya-content').innerHTML = '';
  renderDD('');
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
    return `<div class="dd-item" data-idx="${i}" onmousedown="RGPage.selectT('${escJs(t.id)}')">
      <div class="dd-item-avatar">${esc(getInitials(t.name))}</div>
      <span class="dd-item-name">${hl}</span>${t.short ? `<span class="dd-item-short">${esc(t.short)}</span>` : ''}
    </div>`;
  }).join('');
  ddActive = -1;
}
function openDD() { $('ddwrap').classList.add('open'); }
function closeDD() { $('ddwrap').classList.remove('open'); }
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

// ═══ KELAS ═══
async function renderKelasGate() {
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

gatePage('login', async () => {
  const lists = await loadStaticLists();
  teachersList = lists.teachersList; classList = lists.classList;
  $('kelas-select').innerHTML = '<option value="">— Pilih Kelas —</option>' + classList.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

  $('datePicker').value = todayStr();
  $('datePicker').addEventListener('change', onDateChange);
  $('btn-refresh').addEventListener('click', onDateChange);
  $('kelas-select').addEventListener('change', onKelasChange);
  $('btn-change-teacher').addEventListener('click', changeTeacher);
  $('btn-clear-search').addEventListener('click', () => { $('tsearch').value = ''; renderDD(''); openDD(); $('tsearch').focus(); });
  $('tsearch').addEventListener('input', () => { renderDD($('tsearch').value); openDD(); });
  $('tsearch').addEventListener('focus', () => { renderDD($('tsearch').value); openDD(); });

  switchSub('saya');
});

window.RGPage = { switchSub, selectT };

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

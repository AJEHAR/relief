import { initNav, gatePage } from './nav.js';
import { onAuthChange, isLoggedIn } from './auth.js';
import * as db from './db.js';
import { openPrintWindow, writePrintWindow } from './pdf-export.js';
import { $, esc, todayStr, loadingCard, setBanner, toast } from './ui-utils.js';

initNav();

let guruBoard = null;

function getDate() { return $('datePicker').value; }

function printInduk() {
  if (!guruBoard) return;
  const win = openPrintWindow();
  const rd = guruBoard.reliefDuties || {};
  const all = [];
  Object.entries(rd).forEach(([rn, ds]) => ds.forEach(d => all.push({ ...d, reliefName: rn })));
  all.sort((a, b) => {
    const ai = parseInt(a.period, 10), bi = parseInt(b.period, 10);
    return (!isNaN(ai) && !isNaN(bi)) ? ai - bi : String(a.period).localeCompare(String(b.period));
  });
  const rows = all.map(d => `<tr><td>${esc(d.period)}</td><td>${esc(d.time)}</td><td>${esc(d.className)}</td><td>${esc(d.subject) || '—'}</td>
    <td class="green">${esc(d.reliefName)}</td><td>${esc(d.absentTeacher) || '—'}</td><td>${esc(d.note) || ''}</td></tr>`).join('');
  const html = `<div class="pdf-title">Jadual Guru Ganti — ${esc(guruBoard.dayName || '')}</div>
    <div class="pdf-sub">${esc(getDate())}${!guruBoard.published ? ' · (Draf, belum disahkan)' : ''}</div>
    <table><thead><tr><th>Waktu</th><th>Masa</th><th>Kelas</th><th>Subjek</th><th>Guru Ganti</th><th>Tidak Hadir</th><th>Catatan</th></tr></thead><tbody>${rows}</tbody></table>`;
  writePrintWindow(win, html, `Jadual Guru Ganti ${getDate()}`);
}

async function loadInduk() {
  $('induk-content').innerHTML = loadingCard();
  try {
    const res = await db.getGuruPageData(getDate());
    guruBoard = res.board;
    renderInduk();
  } catch (e) {
    $('induk-content').innerHTML = `<div class="card"><div class="state-box"><div class="s-title">Ralat</div><div class="s-sub">${esc(e.message)}</div></div></div>`;
    toast('Gagal memuat data: ' + e.message, 'error');
  }
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
      <div class="rl-list">`;
  all.forEach(d => {
    h += `<div class="rl-row">
      <div class="rl-period"><span class="rl-wkt">${esc(d.period)}</span><span class="rl-time">${esc(d.time).replace(' - ', '<br>')}</span></div>
      <div class="rl-main">
        <div class="rl-line1"><span class="c-pill">${esc(d.className)}</span><span class="rl-subj">${esc(d.subject) || '—'}</span></div>
        <div class="rl-line2">
          <i class="fas fa-check-circle" style="color:var(--success);font-size:.65rem;"></i><span class="rl-relief">${esc(d.reliefName)}</span>
          <span class="rl-arrow">ganti</span><i class="fas fa-user-slash" style="color:var(--danger);font-size:.6rem;"></i><span class="rl-absent">${esc(d.absentTeacher) || '—'}</span>
        </div>
        ${d.note ? `<div class="rl-note"><i class="fas fa-sticky-note"></i>${esc(d.note)}</div>` : ''}
      </div>
    </div>`;
  });
  h += `</div></div>`;
  ct.innerHTML = h;
}

gatePage('public', async () => {
  $('datePicker').value = todayStr();
  $('datePicker').addEventListener('change', loadInduk);
  $('btn-refresh').addEventListener('click', loadInduk);
  $('btn-gen-pdf-induk').addEventListener('click', printInduk);
  onAuthChange((state) => { if (state.ready) $('btn-gen-pdf-induk').classList.toggle('hidden', !isLoggedIn()); });
  await loadInduk();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

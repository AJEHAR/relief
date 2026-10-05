import { initNav, gatePage } from './nav.js';
import { onAuthChange, isLoggedIn } from './auth.js';
import * as db from './db.js';
import { openPrintWindow, writePrintWindow } from './pdf-export.js';
import { $, esc, todayStr, setBanner, toast, skeletonGroupedList, reasonClass, buildPdfFilename } from './ui-utils.js';

initNav();

let guruBoard = null;

function getDate() { return $('datePicker').value; }

const REASON_PRINT_COLOR = { 'Urusan Rasmi': '#1d4ed8', 'Cuti': '#047857', 'Keluar Waktu Bekerja': '#c2410c' };

async function printInduk() {
  if (!guruBoard) return;
  const win = openPrintWindow();
  const rd = guruBoard.reliefDuties || {};
  const all = [];
  Object.entries(rd).forEach(([rn, ds]) => ds.forEach(d => all.push({ ...d, reliefName: rn })));

  // Kumpulkan ikut guru TIDAK HADIR — sama logik dgn paparan skrin
  const byAbsent = {};
  all.forEach(d => {
    const key = d.absentTeacher || 'Tiada Nama';
    if (!byAbsent[key]) byAbsent[key] = { reason: d.absentReason || '', slots: [] };
    byAbsent[key].slots.push(d);
  });
  Object.values(byAbsent).forEach(g => g.slots.sort((a, b) => {
    const ai = parseInt(a.period, 10), bi = parseInt(b.period, 10);
    return (!isNaN(ai) && !isNaN(bi)) ? ai - bi : String(a.period).localeCompare(String(b.period));
  }));
  const absentNames = Object.keys(byAbsent).sort((a, b) => a.localeCompare(b));

  const groups = absentNames.map(name => {
    const g = byAbsent[name];
    const color = REASON_PRINT_COLOR[g.reason] || '#334155';
    const rows = g.slots.map(d => `<tr><td>${esc(d.period)}</td><td>${esc(d.time)}</td><td>${esc(d.className)}</td><td>${esc(d.subject) || '—'}</td>
      <td class="green">${esc(d.reliefName)}</td><td>${esc(d.note) || ''}</td></tr>`).join('');
    return `<div class="pdf-group">
      <div class="pdf-group-head" style="color:${color};border-color:${color};">
        ${esc(name)}${g.reason ? ` <span class="pdf-group-reason" style="background:${color};">${esc(g.reason)}</span>` : ''}
        <span class="pdf-group-count">· ${g.slots.length} slot</span>
      </div>
      <table><thead><tr><th>Waktu</th><th>Masa</th><th>Kelas</th><th>Subjek</th><th>Guru Ganti</th><th>Catatan</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  }).join('');

  const html = `<div class="pdf-title">Jadual Guru Ganti — ${esc(guruBoard.dayName || '')}</div>
    <div class="pdf-sub">${esc(getDate())}${!guruBoard.published ? ' · (Draf, belum disahkan)' : ''}</div>
    ${groups}`;
  const branding = await db.getBranding();
  const filename = buildPdfFilename(guruBoard.dayName, getDate(), branding.subtitle);
  await writePrintWindow(win, html, filename);
}

async function loadInduk() {
  $('induk-content').innerHTML = skeletonGroupedList(2, 3);
  try {
    const res = await db.getGuruPageData(getDate());
    guruBoard = res.board;
    renderInduk();
  } catch (e) {
    $('induk-content').innerHTML = `<div class="card"><div class="state-box"><div class="s-title">Ralat</div><div class="s-sub">${esc(e.message)}</div></div></div>`;
    toast('Gagal memuat data: ' + e.message, 'error');
  }
}

function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (!parts[0]) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
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

  if (all.length === 0) {
    ct.innerHTML = `<div class="card"><div class="state-box"><div class="s-icon">📋</div><div class="s-title">Tiada Tugasan Guru Ganti</div><div class="s-sub">Tiada sebarang tugasan bagi tarikh ini.</div></div></div>`;
    return;
  }

  // Kumpulkan ikut guru TIDAK HADIR
  const byAbsent = {};
  all.forEach(d => {
    const key = d.absentTeacher || 'Tiada Nama';
    if (!byAbsent[key]) byAbsent[key] = { reason: d.absentReason || '', slots: [] };
    byAbsent[key].slots.push(d);
  });
  Object.values(byAbsent).forEach(g => g.slots.sort((a, b) => {
    const ai = parseInt(a.period, 10), bi = parseInt(b.period, 10);
    return (!isNaN(ai) && !isNaN(bi)) ? ai - bi : String(a.period).localeCompare(String(b.period));
  }));
  const absentNames = Object.keys(byAbsent).sort((a, b) => a.localeCompare(b));

  const rCount = Object.keys(rd).length, cSet = new Set(all.map(d => d.className));
  let h = `<div class="summary-row">
      <div class="sum-chip"><div class="sum-num">${all.length}</div><div class="sum-lbl"><i class="fas fa-tasks" style="color:var(--teal);margin-right:3px;"></i>Jumlah Slot</div></div>
      <div class="sum-chip"><div class="sum-num">${rCount}</div><div class="sum-lbl"><i class="fas fa-user-check" style="color:var(--success);margin-right:3px;"></i>Guru Terlibat</div></div>
      <div class="sum-chip"><div class="sum-num">${cSet.size}</div><div class="sum-lbl"><i class="fas fa-door-open" style="color:var(--navy);margin-right:3px;"></i>Kelas Terlibat</div></div>
    </div>
    <div class="card fade-in">
      <div class="card-head"><div class="card-head-icon" style="background:linear-gradient(135deg,#7c3aed,#6d28d9);"><i class="fas fa-list-alt"></i></div>
        <div><div class="card-head-title">Senarai Lengkap Guru Ganti</div><div class="card-head-sub">${esc(board.dayName || '')} · ${all.length} tugasan · ${rCount} guru</div></div></div>`;

  // ── Dikumpulkan ikut guru tidak hadir — SAMA untuk desktop & mobile ──
  h += `<div class="jg-grouped-view"><div class="grp-list">`;
  absentNames.forEach(name => {
    const g = byAbsent[name];
    h += `<div class="grp-card"><div class="grp-head"><div class="grp-av">${esc(getInitials(name))}</div>
      <div style="flex:1;min-width:0;"><div class="grp-name">${esc(name)}</div><div class="grp-meta">${g.reason ? `<span class="reason-chip ${reasonClass(g.reason)}">${esc(g.reason)}</span> · ` : ''}${g.slots.length} slot</div></div></div>`;
    g.slots.forEach(d => {
      const [tStart, tEnd] = String(d.time || '').split(' - ');
      h += `<div class="grow">
        <div class="gnum-col"><div class="gnum">${esc(d.period)}</div><div class="gtime">${esc(tStart || '')}<br>${esc(tEnd || '')}</div></div>
        <div style="flex:1;min-width:0;">
          <div class="l-class">${esc(d.className)}</div>
          <div class="l-subj"><i class="fas fa-book"></i>${esc(d.subject) || '—'}</div>
          <div class="l-name">${esc(d.reliefName)}</div>
          ${d.note ? `<div class="grow-note"><i class="fas fa-sticky-note"></i>${esc(d.note)}</div>` : ''}
        </div>
      </div>`;
    });
    h += `</div>`;
  });
  h += `</div></div>`;

  h += `</div>`;
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

import { initNav, gatePage } from './nav.js';
import * as db from './db.js';
import { $, esc, todayStr, loadingCard, setBanner, toast } from './ui-utils.js';

initNav();

let guruBoard = null;

function getDate() { return $('datePicker').value; }

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

gatePage('public', async () => {
  $('datePicker').value = todayStr();
  $('datePicker').addEventListener('change', loadInduk);
  $('btn-refresh').addEventListener('click', loadInduk);
  await loadInduk();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

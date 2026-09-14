import { initNav, gatePage, initialSub } from './nav.js';
import * as db from './db.js';
import { loadStaticLists } from './shared-data.js';
import { getReliefFromAssignment } from './board-engine.js';
import { openPrintWindow, writePrintWindow } from './pdf-export.js';
import { $, esc, escJs, todayStr, toast, showConfirm, skeletonGroupedList, skeletonTable, skeletonGrid, skeletonRows } from './ui-utils.js';

initNav();

let teachersList = [];
let currentBoard = null;
let currentAssignSlot = null;
let overrideOn = false;
let currentSub = 'papan';

function getDate() { return $('datePicker').value; }
function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (!parts[0]) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function switchSub(sub) {
  currentSub = sub;
  ['papan', 'senarai', 'sejarah', 'masa'].forEach(s => $('sub-' + s).classList.toggle('hidden', s !== sub));
  if (sub === 'papan') loadPapan();
  else if (sub === 'senarai') { renderSenaraiXml(); loadExtraTeachersAdmin(); }
  else if (sub === 'sejarah') loadHistory();
  else if (sub === 'masa') loadSlotList();
}

async function onDateChange() {
  if (currentSub === 'papan') await loadPapan();
  else if (currentSub === 'sejarah') await loadHistory();
}

// ═══════════════════════════════════════════════════════════
// PAPAN
// ═══════════════════════════════════════════════════════════
async function loadPapan() {
  $('papan-loading').innerHTML = skeletonGrid(7, 6);
  $('papan-loading').classList.remove('hidden');
  $('papan-content').classList.add('hidden');
  try {
    currentBoard = await db.getDailyBoard(getDate());
    populateAbsentSelect();
    renderAbsentPanel();
    renderTimetableGrid();
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
  if (!ids.length) { wrap.innerHTML = `<div style="color:var(--muted);font-size:.8rem;padding:8px 0;">Tiada rekod keberadaan buat masa ini.</div>`; return; }
  wrap.innerHTML = ids.map(id => {
    const t = teachersList.find(x => x.id === id) || { name: id };
    const reason = (currentBoard.absentReasons || {})[id] || '—';
    return `<span class="absent-tag" style="display:inline-flex;align-items:center;gap:6px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:20px;padding:6px 10px;font-size:.75rem;font-weight:700;margin:0 6px 6px 0;">
      <i class="fas fa-user-slash" style="font-size:.65rem;"></i> ${esc(t.name)} <span style="font-weight:500;opacity:.75;">(${esc(reason)})</span>
      <button data-remove-id="${esc(id)}" class="btn-remove-absent" style="background:none;border:none;color:#b91c1c;cursor:pointer;padding:0 2px;"><i class="fas fa-times"></i></button>
    </span>`;
  }).join('');
  wrap.querySelectorAll('.btn-remove-absent').forEach(btn => btn.addEventListener('click', () => removeAbsent(btn.dataset.removeId)));
}

async function addAbsent() {
  const id = $('absent-teacher-select').value;
  const reason = $('absent-reason-select').value;
  if (!id) return toast('Sila pilih guru.', 'error');
  if (!reason) return toast('Sila pilih sebab ketidakhadiran.', 'error');
  const res = await db.addAbsentTeacher({ date: getDate(), teacherId: id, reason });
  if (!res.success) return toast(res.message, 'error');
  currentBoard = res;
  populateAbsentSelect(); renderAbsentPanel(); renderTimetableGrid();
  $('absent-reason-select').value = '';
  toast('Keberadaan guru telah dikemas kini.', 'success');
}

function removeAbsent(teacherId) {
  const t = teachersList.find(x => x.id === teacherId);
  showConfirm({
    title: 'Padam Rekod Keberadaan', msg: `Padam rekod keberadaan bagi ${t ? t.name : teacherId}? Tugasan guru ganti berkaitan akan turut dipadam.`,
    okLabel: 'Buang', okType: 'warn',
    onOk: async () => {
      const res = await db.removeAbsentTeacher({ date: getDate(), teacherId });
      if (!res.success) return toast(res.message, 'error');
      currentBoard = res;
      populateAbsentSelect(); renderAbsentPanel(); renderTimetableGrid();
      toast('Ditanggalkan.', 'success');
    }
  });
}

function renderTimetableGrid() {
  const container = $('timetable-container');
  const statBar = $('slot-stat-bar');
  const board = currentBoard;
  const periods = board.periods || [];
  const classes = board.classes || [];

  if (!periods.length || !classes.length) {
    container.innerHTML = `<div class="state-box" style="border-radius:0;border:none;">
      <div class="state-icon"><i class="fas fa-table"></i></div>
      <div class="state-title">Jadual Tiada Data</div>
      <div class="state-sub">Tiada data jadual untuk hari ini. Sila muat naik jadual XML dahulu (tab Admin).</div>
    </div>`;
    statBar.style.display = 'none';
    return;
  }

  const guruMap = {};
  if (board.teacherMap) {
    Object.entries(board.teacherMap).forEach(([tid, data]) => {
      const slots = {};
      periods.forEach(p => {
        if (p.isRehat) return;
        const slotArr = data[p.id];
        if (slotArr && slotArr.length) slots[p.id] = slotArr;
      });
      if (Object.keys(slots).length > 0) guruMap[tid] = { name: data.name, id: tid, slots };
    });
  }

  const absentSet = new Set(board.absentIds || []);
  const guruList = Object.values(guruMap).sort((a, b) => {
    const aA = absentSet.has(a.id), bA = absentSet.has(b.id);
    if (aA && !bA) return -1;
    if (!aA && bA) return 1;
    return a.name.localeCompare(b.name);
  });

  let statPending = 0, statDone = 0, statNormal = 0;
  guruList.forEach(g => {
    periods.forEach(p => {
      if (p.isRehat) return;
      (g.slots[p.id] || []).forEach(cell => {
        if (!absentSet.has(g.id)) { statNormal++; return; }
        if (!cell.reliefTeacher) statPending++; else statDone++;
      });
    });
  });
  $('stat-pending').textContent = statPending + ' slot belum isi';
  $('stat-done').textContent = statDone + ' slot dah isi';
  $('stat-normal').textContent = statNormal + ' slot biasa';
  statBar.style.display = 'flex';

  const reliefDutyMap = {};
  const reliefDutyClassMap = {}; // reliefName -> periodId -> className (elak scan berulang setiap sel)
  Object.entries(board.assignments || {}).forEach(([key, val]) => {
    const reliefName = getReliefFromAssignment(val).relief;
    if (!reliefName) return;
    const periodId = key.split('|')[1];
    const className = key.split('|')[2];
    if (!reliefDutyMap[reliefName]) reliefDutyMap[reliefName] = new Set();
    reliefDutyMap[reliefName].add(periodId);
    if (!reliefDutyClassMap[reliefName]) reliefDutyClassMap[reliefName] = {};
    reliefDutyClassMap[reliefName][periodId] = className;
  });

  let html = '<table class="tt-table"><thead><tr class="tt-head-row">';
  html += `<th class="tt-sticky tt-head-guru">GURU</th>`;
  periods.forEach(p => {
    if (p.isRehat) html += `<th class="tt-head-rehat">☕<div style="font-size:.5rem;margin-top:2px;">${esc(p.label || 'Rehat')}</div></th>`;
    else html += `<th class="tt-head-period"><div class="tt-head-period-num">Wkt ${esc(p.id)}</div><div class="tt-head-period-time">${esc(p.start)}</div><div class="tt-head-period-time">${esc(p.end)}</div></th>`;
  });
  html += '</tr></thead><tbody>';

  guruList.forEach(g => {
    const isAbsent = absentSet.has(g.id);
    const reason = (board.absentReasons || {})[g.id] || '';
    const nameParts = g.name.split(' ');
    const shortName = nameParts.length > 3 ? nameParts.slice(0, 3).join(' ') + '…' : g.name;

    html += `<tr><td class="tt-sticky tt-guru-cell ${isAbsent ? 'tt-guru-absent' : ''}">
      <span class="tt-guru-name">${esc(shortName)}</span>
      ${isAbsent ? `<span class="tt-guru-tag" title="${esc(reason)}">✗ ${esc(reason) || 'Tidak Hadir'}</span>` : ''}
    </td>`;

    periods.forEach(p => {
      if (p.isRehat) { html += `<td class="tt-slot s-rehat"><div class="tt-slot-inner"><div class="tt-rehat-inner"><div class="tt-rehat-text">${esc(p.label || 'Rehat')}</div></div></div></td>`; return; }
      const cells = g.slots[p.id] || [];
      const isOnReliefDuty = reliefDutyMap[g.name]?.has(String(p.id));

      if (!cells.length) {
        if (isOnReliefDuty) {
          const dutyClassName = reliefDutyClassMap[g.name]?.[String(p.id)] || '?';
          html += `<td class="tt-slot s-relief-duty"><div class="tt-slot-inner"><div class="tt-slot-subj">📌 Relief</div><div class="tt-slot-duty-badge"><i class="fas fa-arrow-right" style="font-size:.4rem;"></i>${esc(dutyClassName)}</div></div></td>`;
        } else {
          html += `<td class="tt-slot s-empty"><div class="tt-slot-inner"></div></td>`;
        }
        return;
      }

      const cell = cells[0];
      if (!isAbsent) {
        const isOverride = reliefDutyMap[g.name]?.has(String(p.id));
        if (isOverride) {
          const dutyClass = reliefDutyClassMap[g.name]?.[String(p.id)] || '?';
          html += `<td class="tt-slot s-override"><div class="tt-slot-inner"><div class="tt-slot-subj">${esc(cell.subject)}</div><div class="tt-slot-class">${esc(cell.className)}</div><div class="tt-slot-override-badge">⚠️ +Relief ${esc(dutyClass)}</div></div></td>`;
        } else {
          html += `<td class="tt-slot s-normal"><div class="tt-slot-inner"><div class="tt-slot-subj">${esc(cell.subject)}</div><div class="tt-slot-class">${esc(cell.className)}</div></div></td>`;
        }
        return;
      }

      let slotClass = cell.reliefTeacher ? 's-done' : 's-absent';
      let reliefHtml = '';
      if (cell.reliefTeacher) {
        const rParts = cell.reliefTeacher.split(' ');
        const rShort = rParts.length > 2 ? rParts[0] + ' ' + rParts[1] : cell.reliefTeacher;
        const noteIcon = cell.note ? `<span class="tt-slot-note-icon">📝</span>` : '';
        reliefHtml = `<div class="tt-slot-relief"><i class="fas fa-check" style="font-size:.45rem;"></i>${esc(rShort)}${noteIcon}</div>`;
      } else {
        reliefHtml = `<div class="tt-slot-add"><i class="fas fa-plus" style="font-size:.45rem;"></i>Isi</div>`;
      }
      html += `<td class="tt-slot ${slotClass}" data-assign-key="${escJs(cell.assignKey)}"><div class="tt-slot-inner"><div class="tt-slot-subj">${esc(cell.subject)}</div><div class="tt-slot-class">${esc(cell.className)}</div>${reliefHtml}</div></td>`;
    });
    html += `</tr>`;
  });
  html += '</tbody></table>';
  container.innerHTML = html;
  container.querySelectorAll('.tt-slot[data-assign-key]').forEach(td => td.addEventListener('click', () => openAssignModal(td.dataset.assignKey)));
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
    return `<div class="assign-teacher-card ${isSelected ? 'selected' : ''}" style="${!clickable ? 'opacity:.5;' : 'cursor:pointer;'}" data-select-name="${clickable ? esc(t.name) : ''}">
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
      ${clickable ? `<button class="btn-assign ${isSelected ? 'selected' : ''}" data-select-name="${esc(t.name)}">${isSelected ? '<i class="fas fa-check"></i>' : '<i class="fas fa-hand-pointer"></i>'}</button>` : ''}
    </div>`;
  }).join('') : `<div style="text-align:center;padding:20px;color:var(--muted);font-size:.85rem;">Tiada guru sepadan.</div>`;

  $('assign-available-list').querySelectorAll('[data-select-name]').forEach(el => {
    if (el.dataset.selectName) el.addEventListener('click', (ev) => { ev.stopPropagation(); selectTeacher(el.dataset.selectName); });
  });
}

async function selectTeacher(teacherName) {
  if (!currentAssignSlot) return;
  const note = $('assign-note').value.trim();
  const res = await db.updateAssignment({ date: getDate(), assignKey: currentAssignSlot.assignKey, reliefTeacher: teacherName, note });
  if (!res.success) return toast('Gagal simpan: ' + res.message, 'error');
  currentBoard = res;
  renderTimetableGrid(); closeAssignModal(); renderBoardStatus();
  toast(`${teacherName} dipilih sebagai guru ganti.`, 'success');
}
async function clearAssignment() {
  if (!currentAssignSlot) return;
  const res = await db.updateAssignment({ date: getDate(), assignKey: currentAssignSlot.assignKey, reliefTeacher: '', note: '' });
  if (!res.success) return toast('Gagal: ' + res.message, 'error');
  currentBoard = res;
  renderTimetableGrid(); closeAssignModal();
}
async function saveNoteOnly() {
  if (!currentAssignSlot) return;
  const note = $('assign-note').value.trim();
  const existing = getReliefFromAssignment(currentBoard.assignments?.[currentAssignSlot.assignKey]).relief;
  const res = await db.updateAssignment({ date: getDate(), assignKey: currentAssignSlot.assignKey, reliefTeacher: existing, note });
  if (!res.success) return toast('Gagal: ' + res.message, 'error');
  currentBoard = res;
  renderTimetableGrid(); closeAssignModal();
  toast('Catatan disimpan.', 'success');
}

function confirmBoard() {
  showConfirm({
    title: 'Sahkan Tapak Harian', msg: 'Selepas disahkan, jadual akan dipaparkan sebagai muktamad di Jadual Ganti & Ruang Guru. Teruskan?',
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
  const win = openPrintWindow();
  const wasConfirmed = currentBoard.status === 'confirmed';
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
  await writePrintWindow(win, html, `Jadual Guru Ganti ${getDate()}`);

  // Jana PDF turut auto-sahkan tapak (elak pentadbir lupa tekan "Sahkan Tapak")
  if (!wasConfirmed) {
    const res = await db.confirmDailyBoard({ date: getDate() });
    if (res.success) {
      toast('PDF dijana & tapak turut disahkan automatik.', 'success');
      currentBoard = await db.getDailyBoard(getDate());
      renderBoardStatus();
    }
  }
}

// ═══════════════════════════════════════════════════════════
// SENARAI NAMA GURU
// ═══════════════════════════════════════════════════════════
function renderSenaraiXml() {
  const wrap = $('senarai-xml-list');
  const xmlTeachers = teachersList.filter(t => !String(t.id).startsWith('EXTRA_')).sort((a, b) => a.name.localeCompare(b.name));
  $('senarai-count-sub').textContent = `${xmlTeachers.length} guru dari jadual XML`;
  if (!xmlTeachers.length) { wrap.innerHTML = `<div style="color:var(--muted);font-size:.8rem;">Tiada data — sila muat naik jadual XML dahulu di tab Admin.</div>`; return; }
  wrap.innerHTML = `<div class="table-wrap"><table class="m-table"><thead><tr><th>Nama</th><th>Singkatan</th><th>ID</th></tr></thead><tbody>
    ${xmlTeachers.map(t => `<tr><td style="font-weight:700;">${esc(t.name)}</td><td>${esc(t.short) || '—'}</td><td style="font-family:'JetBrains Mono',monospace;font-size:.7rem;color:var(--muted);">${esc(t.id)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

async function loadExtraTeachersAdmin() {
  const wrap = $('extra-teacher-list');
  wrap.innerHTML = skeletonRows(3);
  const list = await db.getExtraTeachers();
  if (!list.length) { wrap.innerHTML = `<div style="color:var(--muted);font-size:.8rem;padding:8px 0;">Tiada guru tambahan.</div>`; return; }
  wrap.innerHTML = list.map(t => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
    <div><strong>${esc(t.name)}</strong> ${t.short ? '<span style="color:var(--muted);font-size:.75rem;">(' + esc(t.short) + ')</span>' : ''}</div>
    <button class="btn-ghost btn-sm btn-del-extra" data-id="${esc(t.id)}" style="color:#dc2626;"><i class="fas fa-trash"></i></button></div>`).join('');
  wrap.querySelectorAll('.btn-del-extra').forEach(btn => btn.addEventListener('click', () => deleteExtraTeacherAction(btn.dataset.id)));
}
async function addExtraTeacherAction() {
  const name = $('extraTeacherName').value.trim();
  const short = $('extraTeacherShort').value.trim();
  const res = await db.addExtraTeacher({ name, short });
  if (!res.success) return toast(res.message, 'error');
  $('extraTeacherName').value = ''; $('extraTeacherShort').value = '';
  const lists = await loadStaticLists(); teachersList = lists.teachersList;
  renderSenaraiXml(); await loadExtraTeachersAdmin();
  toast('Guru ditambah.', 'success');
}
function deleteExtraTeacherAction(id) {
  showConfirm({
    title: 'Padam Guru', msg: 'Padam guru tambahan ini?', okLabel: 'Padam', okType: 'warn',
    onOk: async () => {
      const res = await db.deleteExtraTeacher(id);
      if (!res.success) return toast(res.message, 'error');
      const lists = await loadStaticLists(); teachersList = lists.teachersList;
      renderSenaraiXml(); await loadExtraTeachersAdmin();
      toast('Dipadam.', 'success');
    }
  });
}

// ═══════════════════════════════════════════════════════════
// SEJARAH
// ═══════════════════════════════════════════════════════════
async function loadHistory() {
  const isDesktop = window.matchMedia('(min-width:900px)').matches;
  $('history-container').innerHTML = isDesktop ? skeletonTable(5) : skeletonGroupedList(2, 2);
  try {
    const records = await db.getReliefByDate(getDate());
    renderHistory(records);
  } catch (e) { $('history-container').innerHTML = `<div class="card"><div class="state-box"><div class="s-sub">${esc(e.message)}</div></div></div>`; }
}
function renderHistory(records) {
  const ct = $('history-container');
  if (!records.length) { ct.innerHTML = `<div class="card"><div class="state-box"><div class="s-icon">🗂️</div><div class="s-title">Tiada Rekod</div><div class="s-sub">Tiada rekod guru ganti disahkan untuk tarikh ini.</div></div></div>`; return; }

  const byAbsent = {};
  records.forEach(r => {
    const key = r.absentTeacher || 'Tiada Nama';
    if (!byAbsent[key]) byAbsent[key] = { reason: r.reason || '', slots: [] };
    byAbsent[key].slots.push(r);
  });
  Object.values(byAbsent).forEach(g => g.slots.sort((a, b) => {
    const ai = parseInt(a.period, 10), bi = parseInt(b.period, 10);
    return (!isNaN(ai) && !isNaN(bi)) ? ai - bi : String(a.period).localeCompare(String(b.period));
  }));
  const absentNames = Object.keys(byAbsent).sort((a, b) => a.localeCompare(b));
  const recordsSorted = [...records].sort((a, b) => {
    const ai = parseInt(a.period, 10), bi = parseInt(b.period, 10);
    return (!isNaN(ai) && !isNaN(bi)) ? ai - bi : String(a.period).localeCompare(String(b.period));
  });

  let h = `<div class="card">`;

  // ── Versi DESKTOP: jadual 7-lajur asal ──
  h += `<div class="desktop-table-view"><div class="table-wrap"><table class="m-table"><thead><tr><th>Waktu</th><th>Masa</th><th>Kelas</th><th>Subjek</th><th>Guru Ganti</th><th>Tidak Hadir</th><th>Catatan</th></tr></thead><tbody>`;
  recordsSorted.forEach(r => {
    h += `<tr>
      <td><span class="p-pill">${esc(r.period)}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:.72rem;color:var(--muted);white-space:nowrap;">${esc(r.time)}</td>
      <td><span class="c-pill">${esc(r.className)}</span></td>
      <td style="font-weight:700;font-size:.82rem;">${esc(r.subject) || '—'}</td>
      <td style="font-weight:800;color:var(--navy);">${esc(r.reliefTeacher)}</td>
      <td style="color:var(--muted);">${esc(r.absentTeacher) || '—'}</td>
      <td style="min-width:130px;">${r.note ? `<div class="note-chip"><i class="fas fa-sticky-note"></i>${esc(r.note)}</div>` : '<span style="color:#cbd5e1;font-size:.7rem;">—</span>'}</td>
    </tr>`;
  });
  h += `</tbody></table></div></div>`;

  // ── Versi MOBILE/TABLET: dikumpulkan ikut guru tidak hadir ──
  h += `<div class="mobile-grouped-view"><div class="grp-list">`;
  absentNames.forEach(name => {
    const g = byAbsent[name];
    h += `<div class="grp-card"><div class="grp-head"><div class="grp-av">${esc(getInitials(name))}</div>
      <div style="flex:1;min-width:0;"><div class="grp-name">${esc(name)}</div><div class="grp-meta">${esc(g.reason) ? esc(g.reason) + ' · ' : ''}${g.slots.length} slot</div></div></div>`;
    g.slots.forEach(r => {
      const [tStart, tEnd] = String(r.time || '').split(' - ');
      h += `<div class="grow">
        <div class="gnum-col"><div class="gnum">${esc(r.period)}</div><div class="gtime">${esc(tStart || '')}<br>${esc(tEnd || '')}</div></div>
        <div style="flex:1;min-width:0;">
          <div class="l-class">${esc(r.className)}</div>
          <div class="l-subj"><i class="fas fa-book"></i>${esc(r.subject) || '—'}</div>
          <div class="l-name">${esc(r.reliefTeacher)}</div>
          ${r.note ? `<div class="grow-note"><i class="fas fa-sticky-note"></i>${esc(r.note)}</div>` : ''}
        </div>
      </div>`;
    });
    h += `</div>`;
  });
  h += `</div></div>`;

  h += `</div>`;
  ct.innerHTML = h;
}
async function printArchive() {
  const win = openPrintWindow();
  const records = await db.getReliefByDate(getDate());
  if (!records.length) { win.close(); return toast('Tiada rekod untuk dieksport.', 'error'); }
  let rows = records.map(r => `<tr><td>${esc(r.period)}</td><td>${esc(r.time)}</td><td>${esc(r.className)}</td><td>${esc(r.subject)}</td><td>${esc(r.absentTeacher)}</td><td class="green">${esc(r.reliefTeacher)}</td><td>${esc(r.note) || ''}</td></tr>`).join('');
  const html = `<div class="pdf-title">Arkib Guru Ganti</div><div class="pdf-sub">${esc(getDate())}</div>
    <table><thead><tr><th>Waktu</th><th>Masa</th><th>Kelas</th><th>Subjek</th><th>Tidak Hadir</th><th>Guru Ganti</th><th>Catatan</th></tr></thead><tbody>${rows}</tbody></table>`;
  await writePrintWindow(win, html, `Arkib Guru Ganti ${getDate()}`);
}

// ═══════════════════════════════════════════════════════════
// LAPORAN MENGIKUT TEMPOH (julat tarikh / tahun)
// ═══════════════════════════════════════════════════════════
function populateYearSelect() {
  const sel = $('range-year-select');
  const thisYear = new Date().getFullYear();
  const years = [thisYear, thisYear - 1, thisYear - 2, thisYear - 3];
  sel.innerHTML = '<option value="">— Pilih Tahun (pantas) —</option>' + years.map(y => `<option value="${y}">Tahun ${y}</option>`).join('');
  sel.addEventListener('change', () => {
    if (!sel.value) return;
    $('range-start').value = `${sel.value}-01-01`;
    $('range-end').value = `${sel.value}-12-31`;
  });
}

async function generateRangeReport() {
  const start = $('range-start').value, end = $('range-end').value;
  if (!start || !end) return toast('Sila pilih tarikh Dari & Hingga (atau pilih Tahun).', 'error');
  if (start > end) return toast('Tarikh "Dari" mesti sebelum "Hingga".', 'error');

  const win = openPrintWindow();
  $('range-report-msg').innerHTML = `<span style="color:var(--muted);"><i class="fas fa-spinner fa-spin"></i> Menjana laporan...</span>`;
  try {
    const records = await db.getReliefByDateRange(start, end);
    if (!records.length) {
      win.close();
      $('range-report-msg').innerHTML = `<span style="color:var(--danger);">Tiada rekod dalam tempoh ini.</span>`;
      return;
    }

    // Kumpulkan ikut tarikh
    const byDate = {};
    records.forEach(r => { if (!byDate[r.date]) byDate[r.date] = []; byDate[r.date].push(r); });
    const dates = Object.keys(byDate).sort();

    let body = '';
    dates.forEach(dateStr => {
      const dayRecords = byDate[dateStr];
      const dayName = dayRecords[0]?.day || '';
      body += `<div style="font-weight:800;font-size:11pt;color:#0f2044;margin:14pt 0 4pt;padding-top:8pt;border-top:1px solid #e2e8f0;">${esc(dateStr)} · ${esc(dayName)} <span style="font-weight:400;color:#6b7c9e;">(${dayRecords.length} tugasan)</span></div>`;
      const rows = dayRecords.map(r => `<tr><td>${esc(r.period)}</td><td>${esc(r.time)}</td><td>${esc(r.className)}</td><td>${esc(r.subject)}</td><td>${esc(r.absentTeacher)}</td><td class="green">${esc(r.reliefTeacher)}</td><td>${esc(r.note) || ''}</td></tr>`).join('');
      body += `<table><thead><tr><th>Waktu</th><th>Masa</th><th>Kelas</th><th>Subjek</th><th>Tidak Hadir</th><th>Guru Ganti</th><th>Catatan</th></tr></thead><tbody>${rows}</tbody></table>`;
    });

    const html = `<div class="pdf-title">Laporan Guru Ganti</div>
      <div class="pdf-sub">${esc(start)} hingga ${esc(end)} · ${records.length} tugasan merentas ${dates.length} hari</div>
      ${body}`;
    await writePrintWindow(win, html, `Laporan_Guru_Ganti_${start}_${end}`);
    $('range-report-msg').innerHTML = `<span style="color:var(--success);">✅ Laporan dijana (${records.length} tugasan, ${dates.length} hari).</span>`;
  } catch (e) {
    win.close();
    $('range-report-msg').innerHTML = `<span style="color:var(--danger);">Ralat: ${esc(e.message)}</span>`;
  }
}
// MASA JADUAL (Rehat & Slot Tersuai)
// ═══════════════════════════════════════════════════════════
const ALL_DAYS = ['Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat'];
let slotList = [];
let editingSlotId = null;

function htmlTimeToDisplay(t) {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  let h = parseInt(hStr, 10);
  const ap = h >= 12 ? 'pm' : 'am';
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return `${h12}.${mStr}${ap}`;
}
function displayTimeToHtml(display) {
  const m = String(display || '').trim().toLowerCase().match(/^(\d{1,2})[.:](\d{2})(am|pm)$/);
  if (!m) return '';
  let h = parseInt(m[1], 10); const min = m[2]; const ap = m[3];
  if (ap === 'pm' && h !== 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return String(h).padStart(2, '0') + ':' + min;
}

async function loadSlotList() {
  slotList = await db.getCustomSlots();
  renderSlotList();
}

function renderSlotList() {
  const wrap = $('slot-list');
  if (!slotList.length) { wrap.innerHTML = `<div style="color:var(--muted);font-size:.8rem;padding:8px 0;">Tiada slot tersuai. Tambah satu di bawah.</div>`; return; }
  wrap.innerHTML = slotList.map(s => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">
      <div style="flex:1;min-width:160px;">
        <div style="font-weight:800;color:var(--navy);font-size:.85rem;">☕ ${esc(s.label)}</div>
        <div style="font-size:.72rem;color:var(--muted);font-family:'JetBrains Mono',monospace;">${esc(s.start)} – ${esc(s.end)}</div>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;max-width:280px;">
        ${ALL_DAYS.map(d => `<span style="font-size:.62rem;font-weight:700;padding:2px 7px;border-radius:10px;background:${(s.days || []).includes(d) ? '#e0f2fe' : '#f1f5f9'};color:${(s.days || []).includes(d) ? '#0369a1' : '#cbd5e1'};">${d.slice(0, 3)}</span>`).join('')}
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn-ghost btn-sm slot-edit-btn" data-id="${esc(s.id)}" title="Edit"><i class="fas fa-edit"></i></button>
        <button class="btn-ghost btn-sm slot-del-btn" data-id="${esc(s.id)}" style="color:#dc2626;" title="Padam"><i class="fas fa-trash"></i></button>
      </div>
    </div>`).join('');
  wrap.querySelectorAll('.slot-edit-btn').forEach(b => b.addEventListener('click', () => startEditSlot(b.dataset.id)));
  wrap.querySelectorAll('.slot-del-btn').forEach(b => b.addEventListener('click', () => deleteSlot(b.dataset.id)));
}

function startEditSlot(id) {
  const s = slotList.find(x => x.id === id);
  if (!s) return;
  editingSlotId = id;
  $('slot-label').value = s.label;
  $('slot-start').value = displayTimeToHtml(s.start);
  $('slot-end').value = displayTimeToHtml(s.end);
  document.querySelectorAll('.slot-day').forEach(cb => { cb.checked = (s.days || []).includes(cb.value); });
  $('slot-form-title').textContent = `Edit Slot — ${s.label}`;
  $('btn-save-slot').innerHTML = '<i class="fas fa-save"></i> Simpan Perubahan';
  $('btn-cancel-slot-edit').classList.remove('hidden');
  $('slot-label').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function resetSlotForm() {
  editingSlotId = null;
  $('slot-label').value = '';
  $('slot-start').value = '';
  $('slot-end').value = '';
  document.querySelectorAll('.slot-day').forEach(cb => { cb.checked = true; });
  $('slot-form-title').textContent = '+ Tambah Slot Baru';
  $('btn-save-slot').innerHTML = '<i class="fas fa-plus"></i> Tambah Slot';
  $('btn-cancel-slot-edit').classList.add('hidden');
}

async function saveSlot() {
  const label = $('slot-label').value.trim();
  const startHtml = $('slot-start').value, endHtml = $('slot-end').value;
  const days = Array.from(document.querySelectorAll('.slot-day:checked')).map(cb => cb.value);
  if (!label) return toast('Sila isi label slot.', 'error');
  if (!startHtml || !endHtml) return toast('Sila isi masa mula & tamat.', 'error');
  if (!days.length) return toast('Sila pilih sekurang-kurangnya 1 hari.', 'error');

  const start = htmlTimeToDisplay(startHtml), end = htmlTimeToDisplay(endHtml);
  if (editingSlotId) {
    const idx = slotList.findIndex(s => s.id === editingSlotId);
    if (idx > -1) slotList[idx] = { ...slotList[idx], label, start, end, days };
  } else {
    slotList.push({ id: 'SLOT_' + Date.now(), label, start, end, days });
  }
  const res = await db.saveCustomSlots(slotList);
  if (!res.success) return toast('Gagal simpan: ' + res.message, 'error');
  toast(editingSlotId ? 'Slot dikemaskini.' : 'Slot ditambah.', 'success');
  resetSlotForm();
  renderSlotList();
}

function deleteSlot(id) {
  const s = slotList.find(x => x.id === id);
  showConfirm({
    title: 'Padam Slot', msg: `Padam slot "${s ? s.label : id}"? Ia akan hilang dari jadual serta-merta.`,
    okLabel: 'Padam', okType: 'warn',
    onOk: async () => {
      slotList = slotList.filter(x => x.id !== id);
      const res = await db.saveCustomSlots(slotList);
      if (!res.success) return toast('Gagal padam: ' + res.message, 'error');
      toast('Slot dipadam.', 'success');
      renderSlotList();
    }
  });
}

// ═══════════════════════════════════════════════════════════
gatePage('admin', async () => {
  const lists = await loadStaticLists();
  teachersList = lists.teachersList;

  $('datePicker').value = todayStr();
  $('datePicker').addEventListener('change', onDateChange);
  $('btn-refresh').addEventListener('click', onDateChange);
  $('btn-add-absent').addEventListener('click', addAbsent);
  $('btn-gen-pdf').addEventListener('click', generatePdf);
  $('btn-confirm-board').addEventListener('click', confirmBoard);
  $('btn-add-extra').addEventListener('click', addExtraTeacherAction);
  $('btn-print-archive').addEventListener('click', printArchive);
  $('btn-gen-range-report').addEventListener('click', generateRangeReport);
  populateYearSelect();
  $('btn-close-assign').addEventListener('click', closeAssignModal);
  $('btn-clear-assign').addEventListener('click', clearAssignment);
  $('btn-save-note').addEventListener('click', saveNoteOnly);
  $('override-toggle').addEventListener('change', toggleOverride);
  $('assign-search').addEventListener('input', renderAssignList);
  $('btn-save-slot').addEventListener('click', saveSlot);
  $('btn-cancel-slot-edit').addEventListener('click', resetSlotForm);

  switchSub(initialSub('papan'));
  window.addEventListener('hashchange', () => switchSub(initialSub('papan')));
});

window.PGGPage = {};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

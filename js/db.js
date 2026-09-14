// ═══════════════════════════════════════════════════════════
// DB — lapisan capaian data Firestore. Setiap fungsi di sini
// bersamaan satu "action" dalam API_ACTIONS Code.gs yang lama.
// ═══════════════════════════════════════════════════════════
import {
  dbFs, doc, getDoc, setDoc, updateDoc, deleteDoc, collection,
  getDocs, query, where, writeBatch, serverTimestamp
} from './firebase-init.js';
import { buildBoardData, buildBoardDataLight, getReliefFromAssignment, getMalayDayName } from './board-engine.js';

const ABSENT_REASONS = ['Urusan Rasmi', 'Cuti', 'Keluar Waktu Bekerja'];
export { ABSENT_REASONS };

// ── Cache — dalam memori (per page) + sessionStorage (merentas navigasi page
// dalam tab sama, elak baca Firestore berulang bila tukar Jadual Ganti ↔
// Ruang Guru ↔ Penyelaras dll — setiap page load ialah reload penuh) ──
const SS_PREFIX = 'rgcache:';
const SS_TTL_MS = 5 * 60 * 1000; // 5 minit — cukup lama utk navigasi, cukup pendek elak data lapuk

function ssGet(key) {
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + key);
    if (!raw) return undefined;
    const { t, v } = JSON.parse(raw);
    if (Date.now() - t > SS_TTL_MS) { sessionStorage.removeItem(SS_PREFIX + key); return undefined; }
    return v;
  } catch (e) { return undefined; }
}
function ssSet(key, v) {
  try { sessionStorage.setItem(SS_PREFIX + key, JSON.stringify({ t: Date.now(), v })); } catch (e) {}
}
function ssClear(key) {
  try { sessionStorage.removeItem(SS_PREFIX + key); } catch (e) {}
}

let _teachersCache = null;
let _masterCache = null;
let _customSlotsCache = null;

export function invalidateCache() {
  _teachersCache = null; _masterCache = null; _customSlotsCache = null;
  ssClear('teachers'); ssClear('master'); ssClear('customSlots');
}

const DEFAULT_CUSTOM_SLOTS = [
  { id: 'REHAT_DEFAULT', label: 'Rehat', start: '10.10am', end: '10.30am', days: ['Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat'] }
];

export async function getCustomSlots() {
  if (_customSlotsCache) return _customSlotsCache;
  const cached = ssGet('customSlots');
  if (cached) { _customSlotsCache = cached; return cached; }
  const snap = await getDoc(doc(dbFs, 'settings', 'customSlots'));
  _customSlotsCache = snap.exists() && Array.isArray(snap.data().slots) ? snap.data().slots : DEFAULT_CUSTOM_SLOTS;
  ssSet('customSlots', _customSlotsCache);
  return _customSlotsCache;
}
export async function saveCustomSlots(slots) {
  try {
    await setDoc(doc(dbFs, 'settings', 'customSlots'), { slots });
    _customSlotsCache = slots;
    ssSet('customSlots', slots);
    return { success: true };
  } catch (e) { return { success: false, message: e.message || String(e) }; }
}

// teachers & masterTimetable disimpan sebagai SATU dokumen besar
// (bukan 1 dokumen per baris) — elak kuota "reads" percuma cepat habis.
// teachers & masterTimetable disimpan sebagai SATU dokumen besar
// (bukan 1 dokumen per baris) — elak kuota "reads" percuma cepat habis.
// Kedua-dua fungsi di bawah AUTO-MIGRATE dari struktur lama (banyak
// dokumen) secara senyap kali pertama dipanggil selepas deploy — tiada
// data hilang (termasuk Guru Tambahan), tiada perlu upload XML semula.
export async function getTeacherList() {
  if (_teachersCache) return _teachersCache;
  const cached = ssGet('teachers');
  if (cached) { _teachersCache = cached; return cached; }
  const snap = await getDoc(doc(dbFs, 'teachers', 'data'));
  if (snap.exists()) {
    const list = (snap.data().list || []).filter(t => t.id && t.name);
    _teachersCache = list; ssSet('teachers', list);
    return list;
  }
  // ── Auto-migrasi: struktur baru belum wujud, cuba struktur lama ──
  const oldSnap = await getDocs(collection(dbFs, 'teachers'));
  const oldList = oldSnap.docs.filter(d => d.id !== 'data').map(d => ({ id: d.id, ...d.data() })).filter(t => t.id && t.name);
  if (oldList.length > 0) {
    try { await setDoc(doc(dbFs, 'teachers', 'data'), { list: oldList }); } catch (e) { /* mungkin bukan admin, biar admin migrate nanti */ }
  }
  _teachersCache = oldList; ssSet('teachers', oldList);
  return oldList;
}
async function saveTeacherList(list) {
  await setDoc(doc(dbFs, 'teachers', 'data'), { list });
  _teachersCache = list;
  ssSet('teachers', list);
}

async function getMasterRows() {
  if (_masterCache) return _masterCache;
  const cached = ssGet('master');
  if (cached) { _masterCache = cached; return cached; }
  const snap = await getDoc(doc(dbFs, 'masterTimetable', 'data'));
  if (snap.exists()) {
    _masterCache = snap.data().rows || [];
    ssSet('master', _masterCache);
    return _masterCache;
  }
  // ── Auto-migrasi: struktur baru belum wujud, cuba struktur lama ──
  const oldSnap = await getDocs(collection(dbFs, 'masterTimetable'));
  const oldRows = oldSnap.docs.filter(d => d.id !== 'data').map(d => d.data());
  if (oldRows.length > 0) {
    try { await setDoc(doc(dbFs, 'masterTimetable', 'data'), { rows: oldRows }); } catch (e) { /* bukan admin, biar admin migrate nanti */ }
  }
  _masterCache = oldRows; ssSet('master', oldRows);
  return oldRows;
}

export async function getClassList() {
  const rows = await getMasterRows();
  const classes = [...new Set(rows.map(r => r.className).filter(Boolean))];
  return classes.sort();
}

// ── Daily Board ──

/** Bina hasil "board" penuh dari input yang DAH DIKETAHUI (tiada bacaan dailyBoard
 * lagi) — guna lepas simpan, elak baca-semula yang tak perlu. */
async function buildBoardResult(dateStr, absentIds, assignments, absentReasons, status, exists) {
  const [teachers, master, customSlots] = await Promise.all([getTeacherList(), getMasterRows(), getCustomSlots()]);
  const boardData = buildBoardData(master, teachers, dateStr, absentIds, assignments, absentReasons, customSlots);
  return { success: true, exists, date: dateStr, absentIds, assignments, absentReasons, status, ...boardData };
}

export async function getDailyBoard(dateStr) {
  const [snap, teachers, master, customSlots] = await Promise.all([
    getDoc(doc(dbFs, 'dailyBoard', dateStr)), getTeacherList(), getMasterRows(), getCustomSlots()
  ]);

  let absentIds = [], assignments = {}, absentReasons = {}, status = 'draft', exists = false;
  if (snap.exists()) {
    const d = snap.data();
    absentIds = d.absentIds || [];
    assignments = d.assignments || {};
    absentReasons = d.absentReasons || {};
    status = d.status || 'draft';
    exists = true;
  }

  const boardData = buildBoardData(master, teachers, dateStr, absentIds, assignments, absentReasons, customSlots);
  return { success: true, exists, date: dateStr, absentIds, assignments, absentReasons, status, ...boardData };
}

export async function saveDailyBoard(payload) {
  try {
    const ref = doc(dbFs, 'dailyBoard', payload.date);
    await setDoc(ref, {
      absentIds: payload.absentIds || [],
      assignments: payload.assignments || {},
      absentReasons: payload.absentReasons || {},
      status: payload.status || 'draft',
      updatedAt: serverTimestamp()
    }, { merge: false });
    return { success: true, message: 'Tapak harian dikemaskini.' };
  } catch (e) {
    return { success: false, message: e.message || String(e) };
  }
}

export async function addAbsentTeacher(payload) {
  try {
    const reason = String(payload.reason || '').trim();
    if (!ABSENT_REASONS.includes(reason)) return { success: false, message: 'Sila pilih sebab ketidakhadiran.' };
    const board = await getDailyBoard(payload.date);
    const ids = board.absentIds || [];
    if (ids.includes(payload.teacherId)) return { success: false, message: 'Keberadaan guru ini telah dikemas kini.' };
    ids.push(payload.teacherId);
    const absentReasons = { ...board.absentReasons, [payload.teacherId]: reason };
    await saveDailyBoard({ date: payload.date, absentIds: ids, assignments: board.assignments, absentReasons, status: 'draft' });
    return await buildBoardResult(payload.date, ids, board.assignments, absentReasons, 'draft', true);
  } catch (e) { return { success: false, message: e.message || String(e) }; }
}

export async function removeAbsentTeacher(payload) {
  try {
    const board = await getDailyBoard(payload.date);
    const ids = (board.absentIds || []).filter(id => id !== payload.teacherId);
    const assignments = { ...board.assignments };
    Object.keys(assignments).forEach(key => { if (key.startsWith(payload.teacherId + '|')) delete assignments[key]; });
    const absentReasons = { ...board.absentReasons };
    delete absentReasons[payload.teacherId];
    await saveDailyBoard({ date: payload.date, absentIds: ids, assignments, absentReasons, status: 'draft' });
    return await buildBoardResult(payload.date, ids, assignments, absentReasons, 'draft', true);
  } catch (e) { return { success: false, message: e.message || String(e) }; }
}

export async function updateAbsentReason(payload) {
  try {
    const reason = String(payload.reason || '').trim();
    if (!ABSENT_REASONS.includes(reason)) return { success: false, message: 'Sila pilih sebab ketidakhadiran.' };
    const board = await getDailyBoard(payload.date);
    if (!(board.absentIds || []).includes(payload.teacherId)) return { success: false, message: 'Guru ini tiada dalam rekod keberadaan.' };
    const absentReasons = { ...board.absentReasons, [payload.teacherId]: reason };
    await saveDailyBoard({ date: payload.date, absentIds: board.absentIds, assignments: board.assignments, absentReasons, status: 'draft' });
    return await buildBoardResult(payload.date, board.absentIds, board.assignments, absentReasons, 'draft', true);
  } catch (e) { return { success: false, message: e.message || String(e) }; }
}

export async function updateAssignment(payload) {
  try {
    const board = await getDailyBoard(payload.date);
    const assignments = { ...board.assignments };
    const reliefTeacher = payload.reliefTeacher || '';
    const note = payload.note || '';
    if (reliefTeacher || note) {
      assignments[payload.assignKey] = { relief: reliefTeacher, note };
    } else {
      delete assignments[payload.assignKey];
    }
    await saveDailyBoard({ date: payload.date, absentIds: board.absentIds, assignments, absentReasons: board.absentReasons, status: 'draft' });
    return await buildBoardResult(payload.date, board.absentIds, assignments, board.absentReasons, 'draft', true);
  } catch (e) { return { success: false, message: e.message || String(e) }; }
}

export async function confirmDailyBoard(payload) {
  try {
    const board = await getDailyBoard(payload.date);
    await saveDailyBoard({ date: payload.date, absentIds: board.absentIds, assignments: board.assignments, absentReasons: board.absentReasons, status: 'confirmed' });
    delete _guruPageCache[payload.date]; // elak paparan guru terlepas status disahkan

    // Padam rekod arkib lama utk tarikh ni, tulis semula
    const q = query(collection(dbFs, 'reliefRecords'), where('date', '==', payload.date));
    const existing = await getDocs(q);
    const delBatch = writeBatch(dbFs);
    existing.docs.forEach(d => delBatch.delete(d.ref));
    await delBatch.commit();

    const ts = Date.now();
    const batchId = 'BATCH_' + ts;
    const dayName = board.dayName || getMalayDayName(new Date(payload.date + 'T00:00:00'));
    const rows = [];

    Object.entries(board.assignments || {}).forEach(([key, val]) => {
      const { relief: reliefTeacher, note } = getReliefFromAssignment(val);
      if (!reliefTeacher) return;
      const [teacherId, periodId, className] = key.split('|');
      const slotArr = (board.teacherMap && board.teacherMap[teacherId] && board.teacherMap[teacherId][periodId]) || [];
      const slot = slotArr.find(s => s.className === className) || slotArr[0];
      if (!slot) return;
      const period = (board.periods || []).find(p => p.id === periodId) || {};
      const time = period.start && period.end ? `${period.start} - ${period.end}` : '';
      const reason = (board.absentReasons || {})[teacherId] || '';
      rows.push({
        batchId, date: payload.date, day: dayName, period: periodId, time,
        className, subject: slot.subject, absentTeacher: slot.teacherName,
        reliefTeacher, timestamp: serverTimestamp(), note, reason
      });
    });

    const writeBatchChunks = [];
    for (let i = 0; i < rows.length; i += 400) writeBatchChunks.push(rows.slice(i, i + 400));
    for (const chunk of writeBatchChunks) {
      const b = writeBatch(dbFs);
      chunk.forEach(row => {
        const ref = doc(collection(dbFs, 'reliefRecords'));
        b.set(ref, row);
      });
      await b.commit();
    }

    return { success: true, message: `Tapak disahkan. ${rows.length} rekod disimpan.` };
  } catch (e) { return { success: false, message: e.message || String(e) }; }
}

export async function getReliefByDate(dateStr) {
  const q = query(collection(dbFs, 'reliefRecords'), where('date', '==', dateStr));
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const row = d.data();
    return {
      period: row.period, time: row.time, className: row.className, subject: row.subject,
      absentTeacher: row.absentTeacher, reliefTeacher: row.reliefTeacher,
      note: row.note || '', reason: row.reason || ''
    };
  });
}

/** Ambil rekod arkib merentas julat tarikh (inklusif) — utk Laporan Mengikut Tempoh. */
export async function getReliefByDateRange(startDate, endDate) {
  const q = query(collection(dbFs, 'reliefRecords'), where('date', '>=', startDate), where('date', '<=', endDate));
  const snap = await getDocs(q);
  const rows = snap.docs.map(d => {
    const row = d.data();
    return {
      date: row.date, day: row.day || '', period: row.period, time: row.time,
      className: row.className, subject: row.subject,
      absentTeacher: row.absentTeacher, reliefTeacher: row.reliefTeacher,
      note: row.note || '', reason: row.reason || ''
    };
  });
  rows.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const ai = parseInt(a.period, 10), bi = parseInt(b.period, 10);
    return (!isNaN(ai) && !isNaN(bi)) ? ai - bi : String(a.period).localeCompare(String(b.period));
  });
  return rows;
}

// ── Guru tambahan ──
export async function getExtraTeachers() {
  const teachers = await getTeacherList();
  return teachers.filter(t => String(t.id).startsWith('EXTRA_'));
}

export async function addExtraTeacher(payload) {
  try {
    const name = (payload.name || '').trim().toUpperCase();
    const short = (payload.short || '').trim().toUpperCase();
    if (!name) return { success: false, message: 'Nama tidak boleh kosong.' };
    const teachers = await getTeacherList();
    if (teachers.some(t => String(t.name).trim().toUpperCase() === name)) {
      return { success: false, message: 'Nama guru ini sudah wujud dalam senarai.' };
    }
    const id = 'EXTRA_' + Date.now();
    const newList = [...teachers, { id, name, short, contact: '', email: '' }];
    await saveTeacherList(newList);
    return { success: true, message: 'Guru berjaya ditambah.', id };
  } catch (e) { return { success: false, message: e.message || String(e) }; }
}

export async function deleteExtraTeacher(id) {
  try {
    if (!String(id).startsWith('EXTRA_')) return { success: false, message: 'Hanya guru tambahan boleh dipadam di sini.' };
    const teachers = await getTeacherList();
    const newList = teachers.filter(t => t.id !== id);
    await saveTeacherList(newList);
    return { success: true };
  } catch (e) { return { success: false, message: e.message || String(e) }; }
}

// ── Logo ──
export async function getLogo() {
  const snap = await getDoc(doc(dbFs, 'settings', 'logo'));
  return snap.exists() ? (snap.data().base64 || null) : null;
}
export async function saveLogo(base64Data) {
  try {
    if (base64Data && base64Data.length > 900000) {
      return { success: false, message: 'Logo terlalu besar. Sila kompres atau gunakan saiz lebih kecil.' };
    }
    await setDoc(doc(dbFs, 'settings', 'logo'), { base64: base64Data || null });
    return { success: true };
  } catch (e) { return { success: false, message: e.message || String(e) }; }
}

// ── Jenama (nama sistem, subtajuk, footer) ──
const DEFAULT_BRANDING = { title: 'SISTEM GURU GANTI', subtitle: 'K-SpeEdS', footerText: 'Sistem Guru Ganti · Hak Cipta Terpelihara' };
let _brandingCache = null;
export async function getBranding() {
  if (_brandingCache) return _brandingCache;
  const cached = ssGet('branding');
  if (cached) { _brandingCache = cached; return cached; }
  const snap = await getDoc(doc(dbFs, 'settings', 'branding'));
  _brandingCache = snap.exists() ? { ...DEFAULT_BRANDING, ...snap.data() } : DEFAULT_BRANDING;
  ssSet('branding', _brandingCache);
  return _brandingCache;
}
export async function saveBranding(branding) {
  try {
    await setDoc(doc(dbFs, 'settings', 'branding'), branding);
    _brandingCache = { ...DEFAULT_BRANDING, ...branding };
    ssSet('branding', _brandingCache);
    return { success: true };
  } catch (e) { return { success: false, message: e.message || String(e) }; }
}

// ── Guru page (Saya / Kelas / Induk) ──
// Cache ringkas (15s) — elak bacaan berganda bila >1 bahagian page sama
// minta data tarikh sama serentak (cth: nav.js checkTodayDuty() + page load).
const _guruPageCache = {};
const GURU_PAGE_TTL_MS = 15000;

export async function getGuruPageData(dateStr) {
  const cached = _guruPageCache[dateStr];
  if (cached && Date.now() - cached.t < GURU_PAGE_TTL_MS) return cached.data;

  const [teachers, master, customSlots, snap] = await Promise.all([
    getTeacherList(), getMasterRows(), getCustomSlots(), getDoc(doc(dbFs, 'dailyBoard', dateStr))
  ]);
  const classList = [...new Set(master.map(r => r.className).filter(Boolean))].sort();

  let absentIds = [], assignments = {}, absentReasons = {}, status = 'draft';
  if (snap.exists()) {
    const d = snap.data();
    absentIds = d.absentIds || []; assignments = d.assignments || {};
    absentReasons = d.absentReasons || {}; status = d.status || 'draft';
  }

  const boardData = buildBoardDataLight(master, dateStr, absentIds, assignments, absentReasons, customSlots);
  const board = { ...boardData, success: true, published: status === 'confirmed', status, date: dateStr, absentReasons };
  const result = { success: true, teachers, classList, board };
  _guruPageCache[dateStr] = { t: Date.now(), data: result };
  return result;
}

// ── Pengurusan Pengguna (Admin) ──
export async function listUsers() {
  const snap = await getDocs(collection(dbFs, 'users'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}
export async function setUserRole(uid, role) {
  try {
    await updateDoc(doc(dbFs, 'users', uid), { role });
    return { success: true };
  } catch (e) { return { success: false, message: e.message || String(e) }; }
}
export async function deleteUserProfile(uid) {
  try {
    await deleteDoc(doc(dbFs, 'users', uid));
    return { success: true };
  } catch (e) { return { success: false, message: e.message || String(e) }; }
}

// ── Reset Data (fasa testing) ──
async function deleteAllDocsIn(colName) {
  const snap = await getDocs(collection(dbFs, colName));
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const b = writeBatch(dbFs);
    docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
    await b.commit();
  }
  return docs.length;
}

export async function resetSection(section) {
  let count = 0;
  if (section === 'teachers') { count = await deleteAllDocsIn('teachers'); invalidateCache(); }
  else if (section === 'masterTimetable') { count = await deleteAllDocsIn('masterTimetable'); invalidateCache(); }
  else if (section === 'dailyBoard') { count = await deleteAllDocsIn('dailyBoard'); }
  else if (section === 'reliefRecords') { count = await deleteAllDocsIn('reliefRecords'); }
  else if (section === 'logo') { await setDoc(doc(dbFs, 'settings', 'logo'), { base64: null }); count = 1; }
  else if (section === 'users') { count = await deleteAllDocsIn('users'); }
  return count;
}

/** Padam SEMUA data operasi (guru, jadual, papan harian, arkib, logo).
 * TIDAK sertakan 'users' (role/pengguna) — sengaja berasingan, lebih sensitif. */
export async function resetAllOperationalData() {
  const sections = ['teachers', 'masterTimetable', 'dailyBoard', 'reliefRecords', 'logo'];
  let total = 0;
  for (const s of sections) total += await resetSection(s);
  return total;
}

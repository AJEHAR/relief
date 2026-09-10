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

// ── Cache ringkas dalam memori (elak baca Firestore berulang) ──
let _teachersCache = null;
let _masterCache = null;

export function invalidateCache() { _teachersCache = null; _masterCache = null; }

export async function getTeacherList() {
  if (_teachersCache) return _teachersCache;
  const snap = await getDocs(collection(dbFs, 'teachers'));
  const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(t => t.id && t.name);
  _teachersCache = list;
  return list;
}

async function getMasterRows() {
  if (_masterCache) return _masterCache;
  const snap = await getDocs(collection(dbFs, 'masterTimetable'));
  _masterCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return _masterCache;
}

export async function getClassList() {
  const rows = await getMasterRows();
  const classes = [...new Set(rows.map(r => r.className).filter(Boolean))];
  return classes.sort();
}

// ── Daily Board ──
export async function getDailyBoard(dateStr) {
  const ref = doc(dbFs, 'dailyBoard', dateStr);
  const snap = await getDoc(ref);
  const teachers = await getTeacherList();
  const master = await getMasterRows();

  let absentIds = [], assignments = {}, absentReasons = {}, status = 'draft', exists = false;
  if (snap.exists()) {
    const d = snap.data();
    absentIds = d.absentIds || [];
    assignments = d.assignments || {};
    absentReasons = d.absentReasons || {};
    status = d.status || 'draft';
    exists = true;
  }

  const boardData = buildBoardData(master, teachers, dateStr, absentIds, assignments, absentReasons);
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
    if (ids.includes(payload.teacherId)) return { success: false, message: 'Guru ini sudah ditanda tidak hadir.' };
    ids.push(payload.teacherId);
    const absentReasons = { ...board.absentReasons, [payload.teacherId]: reason };
    await saveDailyBoard({ date: payload.date, absentIds: ids, assignments: board.assignments, absentReasons, status: 'draft' });
    return { success: true, ...(await getDailyBoard(payload.date)) };
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
    return { success: true, ...(await getDailyBoard(payload.date)) };
  } catch (e) { return { success: false, message: e.message || String(e) }; }
}

export async function updateAbsentReason(payload) {
  try {
    const reason = String(payload.reason || '').trim();
    if (!ABSENT_REASONS.includes(reason)) return { success: false, message: 'Sila pilih sebab ketidakhadiran.' };
    const board = await getDailyBoard(payload.date);
    if (!(board.absentIds || []).includes(payload.teacherId)) return { success: false, message: 'Guru ini tiada dalam senarai tidak hadir.' };
    const absentReasons = { ...board.absentReasons, [payload.teacherId]: reason };
    await saveDailyBoard({ date: payload.date, absentIds: board.absentIds, assignments: board.assignments, absentReasons, status: 'draft' });
    return { success: true, ...(await getDailyBoard(payload.date)) };
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
    return { success: true, ...(await getDailyBoard(payload.date)) };
  } catch (e) { return { success: false, message: e.message || String(e) }; }
}

export async function confirmDailyBoard(payload) {
  try {
    const board = await getDailyBoard(payload.date);
    await saveDailyBoard({ date: payload.date, absentIds: board.absentIds, assignments: board.assignments, absentReasons: board.absentReasons, status: 'confirmed' });

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
    await setDoc(doc(dbFs, 'teachers', id), { name, short, contact: '', email: '' });
    invalidateCache();
    return { success: true, message: 'Guru berjaya ditambah.', id };
  } catch (e) { return { success: false, message: e.message || String(e) }; }
}

export async function deleteExtraTeacher(id) {
  try {
    if (!String(id).startsWith('EXTRA_')) return { success: false, message: 'Hanya guru tambahan boleh dipadam di sini.' };
    await deleteDoc(doc(dbFs, 'teachers', id));
    invalidateCache();
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

// ── Guru page (Saya / Kelas / Induk) ──
export async function getGuruPageData(dateStr) {
  const teachers = await getTeacherList();
  const classList = await getClassList();
  const master = await getMasterRows();
  const snap = await getDoc(doc(dbFs, 'dailyBoard', dateStr));

  let absentIds = [], assignments = {}, absentReasons = {}, status = 'draft';
  if (snap.exists()) {
    const d = snap.data();
    absentIds = d.absentIds || []; assignments = d.assignments || {};
    absentReasons = d.absentReasons || {}; status = d.status || 'draft';
  }

  const boardData = buildBoardDataLight(master, dateStr, absentIds, assignments, absentReasons);
  const board = { ...boardData, success: true, published: status === 'confirmed', status, date: dateStr, absentReasons };
  return { success: true, teachers, classList, board };
}

// ── Pengurusan Pengguna (Admin) ──
export async function listUsers() {
  const snap = await getDocs(collection(dbFs, 'users'));
  return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
}
export async function setUserRole(uid, role) {
  await updateDoc(doc(dbFs, 'users', uid), { role });
}

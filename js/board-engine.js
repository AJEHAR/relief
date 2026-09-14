// ═══════════════════════════════════════════════════════════
// BOARD ENGINE — logik teras dipindah dari Code.gs (Apps Script)
// Beroperasi ke atas array (dari Firestore) bukan Google Sheets.
// Fungsi-fungsi ni SENGAJA ditulis tulen (tiada side-effect, tiada
// panggilan Firestore) supaya senang diuji & disemak.
// ═══════════════════════════════════════════════════════════

export function getMalayDayName(date) {
  return ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'][date.getDay()];
}

export function formatTimeStr(str) {
  if (!str) return '';
  let clean = String(str).replace(':', '').replace('.', '');
  if (clean.length === 3) clean = '0' + clean;
  if (clean.length < 4) return str;
  const h = parseInt(clean.substring(0, 2), 10);
  const m = clean.substring(2, 4);
  return (h % 12 || 12) + '.' + m + (h >= 12 ? 'pm' : 'am');
}

function timeToMins(t) {
  if (!t) return -1;
  const clean = String(t).trim().toLowerCase().replace(/\s+/g, '');
  const m = clean.match(/^(\d{1,2})[.:](\d{2})(am|pm)$/);
  if (!m) return -1;
  let h = parseInt(m[1], 10), min = parseInt(m[2], 10);
  const ap = m[3];
  if (ap === 'pm' && h !== 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + min;
}

/** Format lama (string) & baru ({relief,note}) assignment value */
export function getReliefFromAssignment(val) {
  if (!val) return { relief: '', note: '' };
  if (typeof val === 'string') return { relief: val, note: '' };
  return { relief: String(val.relief || ''), note: String(val.note || '') };
}

function buildPeriods(masterRows, customSlots, dayName) {
  const periodMap = {};
  masterRows.forEach(row => {
    const pid = String(row.period || '').trim();
    if (!pid || pid === 'undefined') return;
    if (!periodMap[pid]) {
      periodMap[pid] = { id: pid, start: row.start, end: row.end };
    }
  });
  let periods = Object.values(periodMap).sort((a, b) => {
    const ai = parseInt(a.id, 10), bi = parseInt(b.id, 10);
    if (!isNaN(ai) && !isNaN(bi)) return ai - bi;
    return String(a.id).localeCompare(String(b.id));
  });

  // Slot tersuai (Rehat, dll) — ditapis ikut hari, disisip ikut kedudukan masa
  const applicable = (customSlots || [])
    .filter(s => !s.days || !s.days.length || s.days.includes(dayName))
    .sort((a, b) => timeToMins(a.start) - timeToMins(b.start));

  applicable.forEach(slot => {
    const slotEndMins = timeToMins(slot.end);
    let insertIdx = periods.length;
    for (let i = 0; i < periods.length; i++) {
      if (timeToMins(periods[i].start) >= slotEndMins) { insertIdx = i; break; }
    }
    periods.splice(insertIdx, 0, { id: slot.id, start: slot.start, end: slot.end, isRehat: true, label: slot.label || 'Rehat', icon: slot.icon || '☕' });
  });

  return periods;
}

/**
 * Versi PENUH (untuk panel Admin) — sama fungsi dgn buildBoardData() Apps Script.
 * masterRows: SEMUA baris masterTimetable (semua hari)
 * teachersList: SEMUA guru (teachers collection)
 */
export function buildBoardData(masterRows, teachersList, dateStr, absentIds, assignments, absentReasons, customSlots) {
  absentReasons = absentReasons || {};
  const dayName = getMalayDayName(new Date(dateStr + 'T00:00:00'));
  const absentSet = new Set((absentIds || []).map(id => String(id).trim()));
  const teachersByName = new Map(teachersList.map(t => [t.name, t])); // elak scan linear berulang

  const todaySlots = masterRows.filter(row => String(row.day || '').toLowerCase() === dayName.toLowerCase());
  const periods = buildPeriods(masterRows, customSlots, dayName);
  const rehatIds = new Set(periods.filter(p => p.isRehat).map(p => p.id));

  const classSet = new Set(todaySlots.map(row => String(row.className)));
  const classes = [...classSet].sort();

  const grid = {};
  classes.forEach(cls => { grid[cls] = {}; });

  todaySlots.forEach(row => {
    const periodId = String(row.period);
    const className = String(row.className);
    const subject = String(row.subject || '');
    const teacherId = String(row.teacherId || '').trim();
    const teacherName = String(row.teacherName || '').trim();
    const isAbsent = absentSet.has(teacherId);
    const absentReason = isAbsent ? (absentReasons[teacherId] || '') : '';
    const assignKey = `${teacherId}|${periodId}|${className}`;
    const { relief: reliefTeacher, note } = getReliefFromAssignment(assignments[assignKey]);
    // Guna array (bukan overwrite) — sokong team-teaching (>1 guru 1 kelas 1 waktu)
    if (!grid[className][periodId]) grid[className][periodId] = [];
    grid[className][periodId].push({ subject, teacherId, teacherName, isAbsent, absentReason, reliefTeacher, note, assignKey });
  });

  const teacherTeachingMap = {};
  todaySlots.forEach(row => {
    const tid = String(row.teacherId || '').trim();
    const pid = String(row.period);
    if (!teacherTeachingMap[tid]) teacherTeachingMap[tid] = new Set();
    teacherTeachingMap[tid].add(pid);
  });

  const teacherReliefMap = {};
  Object.entries(assignments || {}).forEach(([key, val]) => {
    const { relief: reliefName } = getReliefFromAssignment(val);
    if (!reliefName) return;
    const periodId = key.split('|')[1];
    if (rehatIds.has(periodId)) return;
    const t = teachersByName.get(reliefName);
    if (t) {
      if (!teacherReliefMap[t.id]) teacherReliefMap[t.id] = new Set();
      teacherReliefMap[t.id].add(periodId);
    }
  });

  const teacherOccupiedMap = {};
  Object.keys(teacherTeachingMap).forEach(tid => { teacherOccupiedMap[tid] = new Set(teacherTeachingMap[tid]); });
  Object.keys(teacherReliefMap).forEach(tid => {
    if (!teacherOccupiedMap[tid]) teacherOccupiedMap[tid] = new Set();
    teacherReliefMap[tid].forEach(pid => teacherOccupiedMap[tid].add(pid));
  });

  const periodAvailMap = {};
  const teachingPeriods = periods.filter(p => !p.isRehat);
  const totalTeachingPeriods = teachingPeriods.length;

  teachingPeriods.forEach(p => {
    const pid = p.id;
    periodAvailMap[pid] = teachersList
      .filter(t => {
        if (absentSet.has(t.id)) return false;
        if (teacherOccupiedMap[t.id] && teacherOccupiedMap[t.id].has(pid)) return false;
        return true;
      })
      .map(t => ({
        id: t.id, name: t.name, short: t.short,
        busyPeriods: (teacherTeachingMap[t.id] || new Set()).size,
        reliefCount: (teacherReliefMap[t.id] || new Set()).size,
        freeSlots: totalTeachingPeriods - (teacherOccupiedMap[t.id] || new Set()).size
      }))
      .sort((a, b) => b.freeSlots - a.freeSlots);
  });

  const teacherMap = {};
  todaySlots.forEach(row => {
    const periodId = String(row.period).trim();
    const className = String(row.className).trim();
    const subject = String(row.subject || '').trim();
    const teacherId = String(row.teacherId || '').trim();
    const teacherName = String(row.teacherName || '').trim();
    if (!teacherId || teacherId === 'undefined') return;
    const assignKey = `${teacherId}|${periodId}|${className}`;
    const { relief: reliefTeacher, note } = getReliefFromAssignment((assignments || {})[assignKey]);
    if (!teacherMap[teacherId]) teacherMap[teacherId] = { name: teacherName, id: teacherId };
    if (!teacherMap[teacherId][periodId]) teacherMap[teacherId][periodId] = [];
    teacherMap[teacherId][periodId].push({
      className, subject, assignKey, reliefTeacher, note,
      isAbsent: absentSet.has(teacherId),
      absentReason: absentSet.has(teacherId) ? (absentReasons[teacherId] || '') : '',
      teacherName
    });
  });

  return { dayName, periods, classes, grid, periodAvailMap, teacherMap };
}

/**
 * Versi RINGAN (untuk paparan guru: Saya/Kelas/Induk) — port dari
 * buildBoardDataLight() Apps Script. Skip periodAvailMap (admin sahaja perlu).
 * Tambahan: reliefDuties + teacherSchedule (jadual PENUH setiap guru —
 * bahagian yang dikunci di belakang login).
 */
export function buildBoardDataLight(masterRows, dateStr, absentIds, assignments, absentReasons, customSlots) {
  absentReasons = absentReasons || {};
  const dayName = getMalayDayName(new Date(dateStr + 'T00:00:00'));
  const absentSet = new Set((absentIds || []).map(id => String(id).trim()));

  const todaySlots = masterRows.filter(row => String(row.day || '').toLowerCase() === dayName.toLowerCase());
  const periods = buildPeriods(masterRows, customSlots, dayName);

  const classSet = new Set(todaySlots.map(row => String(row.className)));
  const classes = [...classSet].sort();
  const grid = {};
  classes.forEach(cls => { grid[cls] = {}; });

  todaySlots.forEach(row => {
    const periodId = String(row.period);
    const className = String(row.className);
    const teacherId = String(row.teacherId || '').trim();
    const assignKey = `${teacherId}|${periodId}|${className}`;
    const { relief: reliefTeacher, note } = getReliefFromAssignment((assignments || {})[assignKey]);
    // Guna array (bukan overwrite) — sokong team-teaching (>1 guru 1 kelas 1 waktu)
    if (!grid[className][periodId]) grid[className][periodId] = [];
    grid[className][periodId].push({
      subject: String(row.subject || ''),
      teacherId,
      teacherName: String(row.teacherName || '').trim(),
      isAbsent: absentSet.has(teacherId),
      absentReason: absentSet.has(teacherId) ? (absentReasons[teacherId] || '') : '',
      reliefTeacher, note
    });
  });

  const teacherMap = {};
  todaySlots.forEach(row => {
    const periodId = String(row.period).trim();
    const className = String(row.className).trim();
    const subject = String(row.subject || '').trim();
    const teacherId = String(row.teacherId || '').trim();
    const teacherName = String(row.teacherName || '').trim();
    if (!teacherId || teacherId === 'undefined') return;
    const assignKey = `${teacherId}|${periodId}|${className}`;
    const { relief: reliefTeacher, note } = getReliefFromAssignment((assignments || {})[assignKey]);
    if (!teacherMap[teacherId]) teacherMap[teacherId] = { name: teacherName, id: teacherId };
    if (!teacherMap[teacherId][periodId]) teacherMap[teacherId][periodId] = [];
    teacherMap[teacherId][periodId].push({
      className, subject, assignKey, reliefTeacher, note,
      isAbsent: absentSet.has(teacherId),
      absentReason: absentSet.has(teacherId) ? (absentReasons[teacherId] || '') : '',
      teacherName
    });
  });

  const reliefDuties = {};
  Object.entries(assignments || {}).forEach(([key, val]) => {
    const { relief: reliefName, note } = getReliefFromAssignment(val);
    if (!reliefName) return;
    const parts = key.split('|');
    if (parts.length < 3) return;
    const teacherId = parts[0], periodId = parts[1], className = parts.slice(2).join('|');
    const slotArr = (teacherMap[teacherId] && teacherMap[teacherId][periodId]) || [];
    const slot = slotArr.find(s => s.className === className) || slotArr[0];
    const period = periods.find(p => p.id === periodId);
    if (!reliefDuties[reliefName]) reliefDuties[reliefName] = [];
    reliefDuties[reliefName].push({
      period: periodId,
      time: period ? (period.start + ' \u2013 ' + period.end) : '',
      className,
      subject: (slot && slot.subject) || '',
      absentTeacher: (slot && slot.teacherName) || '',
      absentReason: (slot && slot.absentReason) || '',
      note
    });
  });

  // teacherSchedule — JADUAL PENUH setiap guru (bahagian dikunci di belakang login)
  const teacherSchedule = {};
  Object.entries(grid).forEach(([className, pMap]) => {
    Object.entries(pMap).forEach(([periodId, cell]) => {
      if (!cell || !cell.teacherId) return;
      const tid = cell.teacherId;
      if (!teacherSchedule[tid]) teacherSchedule[tid] = {};
      teacherSchedule[tid][periodId] = { className, subject: cell.subject };
    });
  });

  return { dayName, periods, classes, grid, reliefDuties, teacherSchedule, teacherMap };
}

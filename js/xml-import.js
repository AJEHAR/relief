// ═══════════════════════════════════════════════════════════
// XML IMPORT — port dari processASCXML() (Code.gs) ke client-side,
// guna DOMParser (bukan XmlService Apps Script), tulis ke Firestore.
//
// NOTA PRESTASI: teachers & masterTimetable disimpan sebagai SATU
// dokumen besar (field array), BUKAN satu dokumen per baris/guru.
// Ini elak kuota "reads" percuma Firestore cepat habis — baca
// seluruh jadual jadi 1 bacaan sahaja, bukan ratusan/ribuan.
// ═══════════════════════════════════════════════════════════
import { dbFs, doc, setDoc } from './firebase-init.js';
import { formatTimeStr } from './board-engine.js';
import { invalidateCache, getTeacherList } from './db.js';

function ga(el, name) {
  const v = el.getAttribute(name);
  return v ? v.trim() : '';
}
function gaAny(el, names) {
  for (const n of names) {
    const v = el.getAttribute(n);
    if (v && v.trim()) return v.trim();
  }
  return '';
}

export async function processASCXML(fileContent, onProgress) {
  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(fileContent, 'text/xml');
    const errNode = xml.querySelector('parsererror');
    if (errNode) return { success: false, message: 'Ralat XML: fail tidak sah / rosak.' };

    const root = xml.documentElement;
    const child = (tag) => root.querySelector(':scope > ' + tag);
    const children = (parent, tag) => parent ? Array.from(parent.querySelectorAll(':scope > ' + tag)) : [];

    // ── Teachers ──
    const teachersMap = {}; const teachersArray = [];
    children(child('teachers'), 'teacher').forEach(t => {
      const id = ga(t, 'id'); if (!id) return;
      const name = gaAny(t, ['firstname', 'name']).trim(); if (!name) return;
      const short = gaAny(t, ['short', 'abbrev']).trim();
      teachersMap[id] = { name, short };
      teachersArray.push({ id, name, short, contact: '', email: '' });
    });

    // ── Subjects ──
    const subjectsMap = {};
    children(child('subjects'), 'subject').forEach(s => {
      const id = ga(s, 'id'); if (!id) return;
      subjectsMap[id] = { name: gaAny(s, ['name', 'print']), short: gaAny(s, ['short', 'abbrev']) };
    });

    // ── Classes ──
    const classesMap = {};
    children(child('classes'), 'class').forEach(c => {
      const id = ga(c, 'id'); if (!id) return;
      classesMap[id] = { name: gaAny(c, ['name', 'short', 'print']) || id };
    });

    // ── Periods ──
    const periodsMap = {};
    children(child('periods'), 'period').forEach(p => {
      const pid = gaAny(p, ['period', 'idx', 'id']); if (!pid) return;
      periodsMap[pid] = {
        start: formatTimeStr(gaAny(p, ['starttime', 'startTime', 'start']) || '0000'),
        end: formatTimeStr(gaAny(p, ['endtime', 'endTime', 'end']) || '0000')
      };
    });

    // ── Lessons ──
    const lessonsMap = {}; let skipNoClass = 0;
    children(child('lessons'), 'lesson').forEach(l => {
      const id = ga(l, 'id'); if (!id) return;
      const teacherIds = gaAny(l, ['teacherids', 'teacherid']);
      const classIds = gaAny(l, ['classids', 'classid']);
      const subjectId = gaAny(l, ['subjectid', 'subject']);
      if (!classIds) { skipNoClass++; return; }
      lessonsMap[id] = { subjectId, teacherIds, classIds };
    });

    // ── Cards → masterTimetable rows ──
    const daysDef = ['Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat'];
    const masterData = [];
    let cTotal = 0, cRows = 0, cNoLesson = 0, cNoDays = 0, cNoAttr = 0;

    children(child('cards'), 'card').forEach(c => {
      cTotal++;
      const lessonId = ga(c, 'lessonid');
      const periodId = gaAny(c, ['period', 'periodid']);
      const daysStr = ga(c, 'days');
      if (!lessonId || !periodId || !daysStr) { cNoAttr++; return; }
      const lesson = lessonsMap[lessonId];
      if (!lesson) { cNoLesson++; return; }

      let hadValidDay = false;
      for (let i = 0; i < daysStr.length && i < 5; i++) {
        if (daysStr[i] !== '1') continue;
        hadValidDay = true;
        const dayName = daysDef[i];
        const period = periodsMap[periodId] || { start: '?', end: '?' };
        const teacherIdList = lesson.teacherIds
          ? lesson.teacherIds.split(',').map(t => t.trim()).filter(Boolean)
          : [''];
        const mainClassId = lesson.classIds ? lesson.classIds.split(',')[0].trim() : '';
        const classObj = classesMap[mainClassId] || { name: mainClassId ? 'ID:' + mainClassId : 'Tiada Kelas' };
        const subject = subjectsMap[lesson.subjectId] || { name: lesson.subjectId || 'Tiada Subjek', short: '' };

        teacherIdList.forEach(tid => {
          const teacher = teachersMap[tid] || { name: tid ? 'ID:' + tid : 'Tiada Guru' };
          masterData.push({
            day: dayName, period: periodId, start: period.start, end: period.end,
            classId: mainClassId, className: classObj.name,
            subId: lesson.subjectId, subject: subject.name,
            teacherId: tid, teacherName: teacher.name
          });
          cRows++;
        });
      }
      if (!hadValidDay) cNoDays++;
    });

    // ── Tulis ke Firestore (SATU dokumen besar setiap koleksi) ──
    if (teachersArray.length > 0) {
      onProgress && onProgress('Menggabung guru tambahan sedia ada...');
      invalidateCache(); // pastikan getTeacherList() baca fresh (elak cache lapuk/kosong)
      const existingList = await getTeacherList(); // auto-migrate struktur lama jika perlu
      const existingExtras = existingList.filter(t => String(t.id).startsWith('EXTRA_'));
      const fullList = [...teachersArray, ...existingExtras];
      onProgress && onProgress(`Menulis ${fullList.length} guru...`);
      await setDoc(doc(dbFs, 'teachers', 'data'), { list: fullList });
      invalidateCache();
    }

    if (masterData.length > 0) {
      onProgress && onProgress(`Menulis ${masterData.length} slot jadual...`);
      await setDoc(doc(dbFs, 'masterTimetable', 'data'), { rows: masterData });
      invalidateCache();
    }

    const lTotal = Object.keys(lessonsMap).length + skipNoClass;
    let msg, success;
    if (masterData.length > 0) {
      success = true;
      msg = `\u2705 Berjaya! ${masterData.length} slot dijadualkan untuk ${teachersArray.length} guru (${cTotal} cards diproses).`;
    } else {
      success = false;
      msg = `\u26a0\ufe0f 0 slot. Diagnostik \u2014 Cards: ${cTotal} total, ${cNoAttr} tiada attr, ${cNoLesson} tiada lesson match, ${cNoDays} bitmask kosong. Lessons: ${lTotal} total, ${Object.keys(lessonsMap).length} valid, ${skipNoClass} skip. Teachers: ${teachersArray.length}. Sila semak XML anda.`;
    }

    return {
      success, message: msg,
      stats: { teachers: teachersArray.length, slots: masterData.length, cardsTotal: cTotal, cardsRows: cRows, lessonsValid: Object.keys(lessonsMap).length, lessonsSkip: skipNoClass }
    };
  } catch (e) {
    return { success: false, message: 'Ralat XML: ' + (e.message || e) };
  }
}

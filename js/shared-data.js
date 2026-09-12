// ═══════════════════════════════════════════════════════════
// SHARED DATA — senarai guru & kelas, dikongsi Ruang Guru & Penyelaras
// ═══════════════════════════════════════════════════════════
import * as db from './db.js';

export async function loadStaticLists() {
  const [teachersList, classList] = await Promise.all([db.getTeacherList(), db.getClassList()]);
  return { teachersList, classList };
}

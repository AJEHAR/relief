// ═══════════════════════════════════════════════════════════
// SHARED DATA — senarai guru & kelas, dikongsi Ruang Guru & Penyelaras
// ═══════════════════════════════════════════════════════════
import * as db from './db.js';

export async function loadStaticLists() {
  const teachersList = await db.getTeacherList();
  const classList = await db.getClassList();
  return { teachersList, classList };
}

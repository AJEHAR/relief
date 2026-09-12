import { auth, dbFs, googleProvider, signInWithPopup, onAuthStateChanged, doc, getDoc, setDoc, collection, getDocs, writeBatch } from './firebase-init.js';

const logEl = document.getElementById('log');
function log(msg) { logEl.textContent += '\n' + msg; logEl.scrollTop = logEl.scrollHeight; }

document.getElementById('btn-login').addEventListener('click', () => signInWithPopup(auth, googleProvider).catch(e => alert(e.message)));

onAuthStateChanged(auth, async (user) => {
  if (!user) { document.getElementById('gate').style.display = 'block'; document.getElementById('tool').style.display = 'none'; return; }
  const snap = await getDoc(doc(dbFs, 'users', user.uid));
  const role = snap.exists() ? snap.data().role : 'pending';
  if (role !== 'admin') {
    document.getElementById('gate').innerHTML = `<h1>Akaun ini bukan Admin.</h1><p>Log masuk ke app utama dahulu untuk cipta profil, minta admin sedia ada naikkan taraf anda.</p>`;
    return;
  }
  document.getElementById('gate').style.display = 'none';
  document.getElementById('tool').style.display = 'block';
});

// ── Parser CSV ringkas (sokong quoted fields dgn koma & newline) ──
function parseCSV(text) {
  const rows = []; let row = []; let field = ''; let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map(h => h.trim());
  return rows.filter(r => r.some(c => c !== '')).map(r => {
    const obj = {}; header.forEach((h, i) => obj[h] = (r[i] !== undefined ? r[i] : '')); return obj;
  });
}

function readFile(inputId) {
  return new Promise((resolve, reject) => {
    const file = document.getElementById(inputId).files[0];
    if (!file) return reject(new Error('Sila pilih fail dahulu.'));
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

async function clearCollection(colName) {
  const snap = await getDocs(collection(dbFs, colName));
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const b = writeBatch(dbFs);
    docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
    await b.commit();
  }
}

async function writeDocs(colName, items, idFn) {
  for (let i = 0; i < items.length; i += 400) {
    const b = writeBatch(dbFs);
    items.slice(i, i + 400).forEach(({ id, data }) => b.set(doc(dbFs, colName, id), data));
    await b.commit();
    log(`  ...${Math.min(i + 400, items.length)}/${items.length}`);
  }
}

window.importTeachers = async function () {
  try {
    log('▶ Membaca Teachers.csv...');
    const rows = parseCSV(await readFile('f-teachers'));
    const list = rows.filter(r => r.ID && r.Name).map(r => ({
      id: String(r.ID).trim(), name: String(r.Name).trim(), short: String(r.Short || '').trim(),
      contact: String(r.Contact || ''), email: String(r.Email || '')
    }));
    // NOTA (fix): dulu ni overwrite terus & buang "Guru Tambahan" (EXTRA_) sedia
    // ada yang mungkin dah ditambah dlm app — sekarang kekalkan mereka, sama
    // macam kelakuan xml-import.js.
    log('  Menggabung guru tambahan (EXTRA_) sedia ada...');
    let existingExtras = [];
    try {
      const existingSnap = await getDoc(doc(dbFs, 'teachers', 'data'));
      const existingList = existingSnap.exists() ? (existingSnap.data().list || []) : [];
      existingExtras = existingList.filter(t => String(t.id).startsWith('EXTRA_'));
    } catch (e) { /* tiada data sedia ada lagi, abaikan */ }
    const fullList = [...list, ...existingExtras];
    log(`  ${list.length} guru dari CSV + ${existingExtras.length} guru tambahan sedia ada. Menulis (1 dokumen besar — elak kuota reads)...`);
    await setDoc(doc(dbFs, 'teachers', 'data'), { list: fullList });
    log(`✅ ${list.length} guru berjaya diimport (${existingExtras.length} guru tambahan dikekalkan).`);
  } catch (e) { log('❌ Ralat: ' + e.message); }
};

window.importMaster = async function () {
  try {
    log('▶ Membaca MasterTimetable.csv...');
    const rows = parseCSV(await readFile('f-master'));
    const list = rows.map(r => ({
      day: String(r.Day || '').trim(), period: String(r.Period || '').trim(),
      start: String(r.Start || '').trim(), end: String(r.End || '').trim(),
      classId: String(r.ClassID || '').trim(), className: String(r.Class || '').trim(),
      subId: String(r.SubID || '').trim(), subject: String(r.Subject || '').trim(),
      teacherId: String(r.TeachID || '').trim(), teacherName: String(r.Teacher || '').trim()
    }));
    log(`  ${list.length} slot dijumpai. Menulis (1 dokumen besar — elak kuota reads)...`);
    await setDoc(doc(dbFs, 'masterTimetable', 'data'), { rows: list });
    log(`✅ ${list.length} slot jadual berjaya diimport.`);
  } catch (e) { log('❌ Ralat: ' + e.message); }
};

window.importBoard = async function () {
  try {
    log('▶ Membaca DailyBoard.csv...');
    const rows = parseCSV(await readFile('f-board'));
    const items = rows.filter(r => r.Date).map(r => {
      let absentIds = [], assignments = {}, absentReasons = {};
      try { absentIds = JSON.parse(r.AbsentTeacherIds || '[]'); } catch (e) {}
      try { assignments = JSON.parse(r.Assignments || '{}'); } catch (e) {}
      try { absentReasons = JSON.parse(r.AbsentReasons || '{}'); } catch (e) {}
      return { id: String(r.Date).trim(), data: { absentIds, assignments, absentReasons, status: r.Status || 'draft' } };
    });
    await writeDocs('dailyBoard', items);
    log(`✅ ${items.length} papan harian berjaya diimport.`);
  } catch (e) { log('❌ Ralat: ' + e.message); }
};

window.importRelief = async function () {
  try {
    log('▶ Membaca ReliefAssignments.csv...');
    const rows = parseCSV(await readFile('f-relief'));
    const items = rows.filter(r => r.Date).map((r, i) => ({
      id: 'R' + Date.now() + '_' + i,
      data: {
        batchId: r.BatchID || r['Batch ID'] || '', date: String(r.Date).trim(), day: r.Day || '',
        period: r.Period || '', time: r.Time || '', className: r.Class || '', subject: r.Subject || '',
        absentTeacher: r.AbsentTeacherID || r['Absent Teacher'] || '',
        reliefTeacher: r.ReliefTeacherID || r['Relief Teacher'] || '',
        note: r.Note || '', reason: r.Reason || ''
      }
    }));
    await writeDocs('reliefRecords', items);
    log(`✅ ${items.length} rekod arkib berjaya diimport.`);
  } catch (e) { log('❌ Ralat: ' + e.message); }
};

// ═══════════════════════════════════════════════════════════
// FIREBASE CONFIG — GANTIKAN dengan config projek Firebase anda
// ═══════════════════════════════════════════════════════════
// Cara dapatkan: Firebase Console → Project settings → General
// → scroll ke "Your apps" → pilih Web app → "SDK setup and
// configuration" → salin objek firebaseConfig di bawah.
//
// INI SATU-SATUNYA FAIL YANG PERLU DIUBAH UNTUK SETUP.
//
// ⚠️ KESELAMATAN: fail ni SEBELUM INI mengandungi apiKey/projectId
// SEBENAR ter-commit dalam repo (bocor). Nilai di bawah dah ditukar
// ke placeholder — isi semula dengan config projek Firebase anda
// SENDIRI sebelum deploy, dan pastikan firestore.rules di-deploy
// dahulu sebelum app ni live.
// ═══════════════════════════════════════════════════════════

export const firebaseConfig = {
  apiKey: "GANTIKAN_DENGAN_API_KEY_ANDA",
  authDomain: "GANTIKAN.firebaseapp.com",
  projectId: "GANTIKAN_PROJECT_ID",
  storageBucket: "GANTIKAN.firebasestorage.app",
  messagingSenderId: "GANTIKAN_SENDER_ID",
  appId: "GANTIKAN_APP_ID",
  measurementId: "GANTIKAN_MEASUREMENT_ID"
};

// Senarai emel yang automatik jadi ADMIN pada first-login sahaja
// (selepas itu, urus role melalui panel "Pengurusan Pengguna" dalam app).
// Kosongkan array ni [] jika anda nak tetapkan admin terus dari
// Firebase Console → Firestore → koleksi "users" secara manual.
//
// ⚠️ PENTING: senarai ni MESTI SAMA PERSIS dengan senarai
// isBootstrapAdmin() dalam firestore.rules — kedua-dua fail perlu
// dikemaskini bersama.
export const BOOTSTRAP_ADMIN_EMAILS = [
  // "admin-anda@gmail.com",
];

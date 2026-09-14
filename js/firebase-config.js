// ═══════════════════════════════════════════════════════════
// FIREBASE CONFIG — GANTIKAN dengan config projek Firebase anda
// ═══════════════════════════════════════════════════════════
// Cara dapatkan: Firebase Console → Project settings → General
// → scroll ke "Your apps" → pilih Web app → "SDK setup and
// configuration" → salin objek firebaseConfig di bawah.
//
// INI SATU-SATUNYA FAIL YANG PERLU DIUBAH UNTUK SETUP.
// ═══════════════════════════════════════════════════════════

export const firebaseConfig = {
  apiKey: "AIzaSyCZveh_UYZql_LDCCM8EKKNNn5xD6idmCQ",
  authDomain: "guruganti-77b4d.firebaseapp.com",
  projectId: "guruganti-77b4d",
  storageBucket: "guruganti-77b4d.firebasestorage.app",
  messagingSenderId: "466983522437",
  appId: "1:466983522437:web:c4c4a79733432ca8a8d9ec",
  measurementId: "G-3RTPFBJCPH"
};

// Senarai emel yang automatik jadi ADMIN pada first-login sahaja
// (selepas itu, urus role melalui panel "Pengurusan Pengguna" dalam app).
// Kosongkan array ni [] jika anda nak tetapkan admin terus dari
// Firebase Console → Firestore → koleksi "users" secara manual.
export const BOOTSTRAP_ADMIN_EMAILS = [
  "azharuddinhaniff@gmail.com",
];

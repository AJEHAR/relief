// ═══════════════════════════════════════════════════════════
// Firebase init — Auth + Firestore (modular SDK v10, via CDN)
// ═══════════════════════════════════════════════════════════
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection,
  getDocs, query, where, writeBatch, serverTimestamp, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Cache local (IndexedDB) diaktifkan — bacaan yang sama diambil dari cache peranti
// dahulu (lebih laju, jimat kuota), Firestore auto-sync bila online. Bertahan
// merentas reload penuh (relevan sebab sistem ni multi-page, bukan SPA).
export const dbFs = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const googleProvider = new GoogleAuthProvider();

export {
  signInWithPopup, fbSignOut, onAuthStateChanged,
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection,
  getDocs, query, where, writeBatch, serverTimestamp, orderBy, limit
};

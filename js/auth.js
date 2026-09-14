// ═══════════════════════════════════════════════════════════
// AUTH — Google Sign-In, role (admin/pending), pautan guru↔akaun
// ═══════════════════════════════════════════════════════════
import {
  auth, dbFs, googleProvider, signInWithPopup, fbSignOut, onAuthStateChanged,
  doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp
} from './firebase-init.js';
import { BOOTSTRAP_ADMIN_EMAILS } from './firebase-config.js';

// State semasa (dikemaskini bila auth berubah)
export const authState = {
  ready: false,        // firebase auth dah check status login ke belum
  user: null,           // objek Firebase User atau null
  profile: null,         // { email, name, photoURL, role, teacherId, createdAt }
};

const listeners = [];
export function onAuthChange(cb) {
  listeners.push(cb);
  if (authState.ready) cb(authState);
}
function notify() { listeners.forEach(cb => cb(authState)); }

export async function loginWithGoogle() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      alert('Log masuk gagal: ' + (e.message || e.code));
    }
  }
}

export async function logout() {
  await fbSignOut(auth);
}

async function ensureUserProfile(user) {
  const ref = doc(dbFs, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return snap.data();
  }
  const isBootstrapAdmin = BOOTSTRAP_ADMIN_EMAILS
    .map(e => e.toLowerCase())
    .includes((user.email || '').toLowerCase());
  const profile = {
    email: user.email || '',
    name: user.displayName || '',
    photoURL: user.photoURL || '',
    role: isBootstrapAdmin ? 'admin' : 'pending',
    teacherId: null,
    createdAt: serverTimestamp()
  };
  await setDoc(ref, profile);
  return profile;
}

export async function setMyTeacherId(teacherId) {
  if (!authState.user) return { success: false, message: 'Belum log masuk.' };
  try {
    const ref = doc(dbFs, 'users', authState.user.uid);
    await updateDoc(ref, { teacherId });
    authState.profile = { ...authState.profile, teacherId };
    notify();
    return { success: true };
  } catch (e) { return { success: false, message: e.message || String(e) }; }
}

/** Padam profil/role sendiri dari sistem (bukan padam akaun Google) + log keluar. */
export async function deleteMyProfile() {
  if (!authState.user) return { success: false, message: 'Belum log masuk.' };
  try {
    const uid = authState.user.uid;
    await deleteDoc(doc(dbFs, 'users', uid));
    await fbSignOut(auth);
    return { success: true };
  } catch (e) { return { success: false, message: e.message || String(e) }; }
}

export function isAdmin() {
  return authState.profile && authState.profile.role === 'admin';
}
export function isLoggedIn() {
  return !!authState.user;
}

onAuthStateChanged(auth, async (user) => {
  authState.user = user;
  if (user) {
    try {
      authState.profile = await ensureUserProfile(user);
    } catch (e) {
      console.error('Gagal cipta/muat profil pengguna:', e);
      authState.profile = { email: user.email || '', name: user.displayName || '', photoURL: user.photoURL || '', role: 'pending', teacherId: null, _error: e.message };
    }
  } else {
    authState.profile = null;
  }
  authState.ready = true;
  notify();
});

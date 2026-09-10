// ═══════════════════════════════════════════════════════════
// NAV — navbar + drawer dikongsi semua 4 page, + gate akses page
// ═══════════════════════════════════════════════════════════
import { authState, onAuthChange, loginWithGoogle, logout, isAdmin, isLoggedIn } from './auth.js';
import { $ } from './ui-utils.js';

export const PAGES = [
  { id: 'jadual', href: 'index.html', label: 'Jadual Ganti', icon: 'fa-list-alt', need: null },
  { id: 'ruang-guru', href: 'ruang-guru.html', label: 'Ruang Guru', icon: 'fa-user-graduate', need: 'login' },
  { id: 'penyelaras', href: 'penyelaras.html', label: 'Penyelaras GG', icon: 'fa-clipboard-list', need: 'admin' },
  { id: 'admin', href: 'admin.html', label: 'Admin', icon: 'fa-cog', need: 'admin' },
];

function pageLinkHtml(p, cls) {
  return `<a href="${p.href}" class="${cls}" data-page="${p.id}" data-need="${p.need || ''}">
    <i class="fas ${p.icon}"></i><span>${p.label}</span></a>`;
}

function navShellHtml() {
  return `
  <div class="navbar">
    <div class="navbar-inner">
      <button class="hamburger-btn" id="hamburger-btn" aria-label="Menu"><i class="fas fa-bars"></i></button>
      <div class="navbar-brand">
        <div class="navbar-icon"><i class="fas fa-user-clock"></i></div>
        <div><div class="navbar-title">SISTEM GURU GANTI</div><div class="navbar-sub">K-SpeEdS</div></div>
      </div>
      <nav class="page-nav-desktop" id="page-nav-desktop">
        ${PAGES.map(p => pageLinkHtml(p, 'page-link')).join('')}
      </nav>
      <div id="auth-box" class="auth-box">
        <div id="auth-loading" class="auth-loading"><i class="fas fa-circle-notch fa-spin"></i> Menyemak akaun...</div>
        <button id="btn-login" class="btn-auth hidden"><i class="fab fa-google"></i> Log Masuk</button>
        <div id="user-chip" class="user-chip hidden">
          <img id="user-photo" class="user-photo" src="" alt="">
          <div class="user-meta"><div id="user-name" class="user-name">—</div><div id="user-role" class="user-role">—</div></div>
          <button class="btn-logout" id="btn-logout" title="Log Keluar"><i class="fas fa-sign-out-alt"></i></button>
        </div>
      </div>
    </div>
  </div>
  <div class="drawer-overlay" id="drawer-overlay"></div>
  <div class="drawer" id="drawer">
    <div class="drawer-head">
      <div class="navbar-icon"><i class="fas fa-user-clock"></i></div>
      <div><div class="navbar-title" style="color:var(--navy);">SISTEM GURU GANTI</div><div class="navbar-sub" style="color:var(--muted);">K-SpeEdS</div></div>
      <button class="drawer-close" id="drawer-close"><i class="fas fa-times"></i></button>
    </div>
    <nav class="page-nav-drawer" id="page-nav-drawer">
      ${PAGES.map(p => pageLinkHtml(p, 'drawer-link')).join('')}
    </nav>
  </div>`;
}

export function initNav(activePageId) {
  const root = $('nav-root');
  root.innerHTML = navShellHtml();

  // Highlight active page
  document.querySelectorAll('.page-link, .drawer-link').forEach(a => {
    if (a.dataset.page === activePageId) a.classList.add('active');
  });

  // Drawer toggle
  const drawer = $('drawer'), overlay = $('drawer-overlay');
  function openDrawer() { drawer.classList.add('open'); overlay.classList.add('open'); }
  function closeDrawer() { drawer.classList.remove('open'); overlay.classList.remove('open'); }
  $('hamburger-btn').addEventListener('click', openDrawer);
  $('drawer-close').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
  document.querySelectorAll('.drawer-link').forEach(a => a.addEventListener('click', closeDrawer));

  // Auth wiring
  $('btn-login').addEventListener('click', loginWithGoogle);
  $('btn-logout').addEventListener('click', logout);

  onAuthChange(renderAuthUI);
}

function renderAuthUI(state) {
  $('auth-loading').classList.add('hidden');
  const loginBtn = $('btn-login'), chip = $('user-chip');
  if (state.user) {
    loginBtn.classList.add('hidden');
    chip.classList.remove('hidden');
    $('user-photo').src = state.profile?.photoURL || state.user.photoURL || '';
    $('user-name').textContent = state.profile?.name || state.user.displayName || state.user.email;
    $('user-role').textContent = state.profile?.role === 'admin' ? 'Admin' : (state.profile?.role === 'pending' ? 'Belum Disahkan' : 'Guru');
  } else {
    loginBtn.classList.remove('hidden');
    chip.classList.add('hidden');
  }

  document.querySelectorAll('.page-link, .drawer-link').forEach(a => {
    const need = a.dataset.need;
    let ok = true;
    if (need === 'login') ok = isLoggedIn();
    if (need === 'admin') ok = isAdmin();
    a.classList.toggle('hidden', !ok);
  });
}

/**
 * Kunci akses satu page. requirement: 'public' | 'login' | 'admin'.
 * Bila diluluskan, papar #page-content & panggil onGranted() (sekali sahaja).
 * Bila tidak, papar skrin kunci dlm #page-gate.
 */
export function gatePage(requirement, onGranted) {
  let granted = false;
  onAuthChange((state) => {
    if (!state.ready) return;
    const ok = requirement === 'public' ? true : requirement === 'login' ? isLoggedIn() : isAdmin();
    const gate = $('page-gate'), content = $('page-content');
    if (ok) {
      gate.classList.add('hidden');
      content.classList.remove('hidden');
      if (!granted) { granted = true; onGranted(state); }
    } else {
      content.classList.add('hidden');
      gate.classList.remove('hidden');
      gate.innerHTML = lockScreenHtml(requirement, state);
    }
  });
}

function lockScreenHtml(requirement, state) {
  if (requirement === 'login' && !isLoggedIn()) {
    return `<div class="card"><div class="state-box"><div class="s-icon">🔒</div><div class="s-title">Log Masuk Diperlukan</div>
      <div class="s-sub">Sila log masuk guna akaun Google untuk akses halaman ini.</div>
      <button class="btn btn-primary btn-sm" style="margin-top:14px;" onclick="document.getElementById('btn-login').click()"><i class="fab fa-google"></i> Log Masuk</button>
      </div></div>`;
  }
  if (requirement === 'admin' && !isLoggedIn()) {
    return `<div class="card"><div class="state-box"><div class="s-icon">🔒</div><div class="s-title">Log Masuk Diperlukan</div>
      <div class="s-sub">Halaman ini untuk Admin sahaja. Sila log masuk dahulu.</div>
      <button class="btn btn-primary btn-sm" style="margin-top:14px;" onclick="document.getElementById('btn-login').click()"><i class="fab fa-google"></i> Log Masuk</button>
      </div></div>`;
  }
  if (requirement === 'admin' && isLoggedIn() && !isAdmin()) {
    return `<div class="card"><div class="state-box"><div class="s-icon">⛔</div><div class="s-title">Akses Ditolak</div>
      <div class="s-sub">Akaun anda (${state.profile?.email || ''}) belum ditetapkan sebagai Admin. Hubungi admin sedia ada untuk naikkan taraf akaun anda melalui Admin → Pengurusan Pengguna.</div>
      <a href="index.html" class="btn btn-ghost btn-sm" style="margin-top:14px;display:inline-block;"><i class="fas fa-arrow-left"></i> Balik ke Jadual Ganti</a>
      </div></div>`;
  }
  return '';
}

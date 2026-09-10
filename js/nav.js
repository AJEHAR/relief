// ═══════════════════════════════════════════════════════════
// NAV — dropdown (desktop) + drawer accordion (tablet/phone)
// ═══════════════════════════════════════════════════════════
import { authState, onAuthChange, loginWithGoogle, logout, isAdmin, isLoggedIn } from './auth.js';
import { $ } from './ui-utils.js';

export const PAGES = [
  { id: 'jadual', href: 'index.html', label: 'Jadual Ganti', icon: 'fa-list-alt', need: null, subs: [] },
  { id: 'ruang-guru', href: 'ruang-guru.html', label: 'Ruang Guru', icon: 'fa-user-graduate', need: 'login', subs: [
      { id: 'saya', label: 'Jadual Saya' }, { id: 'kelas', label: 'Kelas' }
  ]},
  { id: 'penyelaras', href: 'penyelaras.html', label: 'Penyelaras GG', icon: 'fa-clipboard-list', need: 'admin', subs: [
      { id: 'papan', label: 'Papan' }, { id: 'senarai', label: 'Senarai Nama Guru' }, { id: 'sejarah', label: 'Sejarah' }
  ]},
  { id: 'admin', href: 'admin.html', label: 'Admin', icon: 'fa-cog', need: 'admin', subs: [
      { id: 'xml', label: 'XML ASC' }, { id: 'logo', label: 'Upload Logo' }, { id: 'pengguna', label: 'Pengurusan Pengguna' }
  ]},
];

function subUrl(p, s) { return p.href + '#' + s.id; }

function desktopItemHtml(p) {
  if (!p.subs.length) {
    return `<a href="${p.href}" class="page-link" data-page="${p.id}" data-need="${p.need || ''}"><i class="fas ${p.icon}"></i><span>${p.label}</span></a>`;
  }
  return `<div class="page-link-wrap" data-page="${p.id}" data-need="${p.need || ''}">
    <button class="page-link page-link-btn" data-toggle-dd="${p.id}"><i class="fas ${p.icon}"></i><span>${p.label}</span><i class="fas fa-chevron-down dd-chevron"></i></button>
    <div class="page-dropdown" id="dd-${p.id}">
      ${p.subs.map(s => `<a href="${subUrl(p, s)}" class="dd-item-link" data-page="${p.id}" data-sub="${s.id}">${s.label}</a>`).join('')}
    </div>
  </div>`;
}

function drawerItemHtml(p) {
  if (!p.subs.length) {
    return `<a href="${p.href}" class="drawer-link" data-page="${p.id}" data-need="${p.need || ''}"><i class="fas ${p.icon}"></i><span>${p.label}</span></a>`;
  }
  return `<div class="drawer-group" data-page="${p.id}" data-need="${p.need || ''}">
    <button class="drawer-link drawer-group-head" data-toggle-acc="${p.id}"><i class="fas ${p.icon}"></i><span>${p.label}</span><i class="fas fa-chevron-down acc-chevron"></i></button>
    <div class="drawer-sublist" id="acc-${p.id}">
      ${p.subs.map(s => `<a href="${subUrl(p, s)}" class="drawer-sublink" data-page="${p.id}" data-sub="${s.id}">${s.label}</a>`).join('')}
    </div>
  </div>`;
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
        ${PAGES.map(desktopItemHtml).join('')}
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
      ${PAGES.map(drawerItemHtml).join('')}
    </nav>
    <div class="drawer-footer">
      <div id="drawer-profile" class="drawer-profile hidden">
        <img id="drawer-user-photo" class="user-photo" src="" alt="">
        <div class="u-meta"><div id="drawer-user-name" class="user-name" style="color:var(--navy);">—</div>
          <button class="drawer-logout" id="drawer-btn-logout"><i class="fas fa-sign-out-alt"></i> Log Keluar</button></div>
      </div>
      <div id="drawer-login-wrap" class="drawer-login-wrap">
        <button class="btn btn-primary btn-sm" id="drawer-btn-login" style="width:100%;"><i class="fab fa-google"></i> Log Masuk</button>
      </div>
      <div class="drawer-copyright">© <span id="drawer-year"></span> Sistem Guru Ganti · Hak Cipta Terpelihara</div>
    </div>
  </div>`;
}

let currentPageId = null;

export function initNav(activePageId) {
  currentPageId = activePageId;
  const root = $('nav-root');
  root.innerHTML = navShellHtml();
  $('drawer-year').textContent = new Date().getFullYear();

  document.querySelectorAll('[data-page]').forEach(el => { if (el.dataset.page === activePageId) el.classList.add('active'); });

  document.querySelectorAll('[data-toggle-dd]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.toggleDd;
      const dd = $('dd-' + id);
      const isOpen = dd.classList.contains('open');
      document.querySelectorAll('.page-dropdown.open').forEach(d => d.classList.remove('open'));
      if (!isOpen) dd.classList.add('open');
    });
  });
  document.addEventListener('click', () => document.querySelectorAll('.page-dropdown.open').forEach(d => d.classList.remove('open')));

  document.querySelectorAll('[data-toggle-acc]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.toggleAcc;
      $('acc-' + id).classList.toggle('open');
      btn.classList.toggle('open');
    });
    if (btn.closest('[data-page]').dataset.page === activePageId) {
      $('acc-' + btn.dataset.toggleAcc).classList.add('open');
      btn.classList.add('open');
    }
  });

  const drawer = $('drawer'), overlay = $('drawer-overlay');
  function openDrawer() { drawer.classList.add('open'); overlay.classList.add('open'); }
  function closeDrawer() { drawer.classList.remove('open'); overlay.classList.remove('open'); }
  $('hamburger-btn').addEventListener('click', openDrawer);
  $('drawer-close').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
  document.querySelectorAll('.drawer-link, .drawer-sublink').forEach(a => a.addEventListener('click', closeDrawer));

  $('btn-login').addEventListener('click', loginWithGoogle);
  $('btn-logout').addEventListener('click', logout);
  $('drawer-btn-login').addEventListener('click', loginWithGoogle);
  $('drawer-btn-logout').addEventListener('click', logout);

  onAuthChange(renderAuthUI);
  highlightActiveSub();
  window.addEventListener('hashchange', highlightActiveSub);
}

function highlightActiveSub() {
  const hash = (location.hash || '').replace('#', '');
  document.querySelectorAll('[data-sub]').forEach(a => {
    a.classList.toggle('active', a.dataset.page === currentPageId && a.dataset.sub === hash);
  });
}

function renderAuthUI(state) {
  $('auth-loading').classList.add('hidden');
  const loginBtn = $('btn-login'), chip = $('user-chip');
  const dProfile = $('drawer-profile'), dLogin = $('drawer-login-wrap');
  if (state.user) {
    loginBtn.classList.add('hidden'); chip.classList.remove('hidden');
    $('user-photo').src = state.profile?.photoURL || state.user.photoURL || '';
    $('user-name').textContent = state.profile?.name || state.user.displayName || state.user.email;
    $('user-role').textContent = state.profile?.role === 'admin' ? 'Admin' : (state.profile?.role === 'pending' ? 'Belum Disahkan' : 'Guru');

    dProfile.classList.remove('hidden'); dLogin.classList.add('hidden');
    $('drawer-user-photo').src = state.profile?.photoURL || state.user.photoURL || '';
    $('drawer-user-name').textContent = state.profile?.name || state.user.displayName || state.user.email;
  } else {
    loginBtn.classList.remove('hidden'); chip.classList.add('hidden');
    dProfile.classList.add('hidden'); dLogin.classList.remove('hidden');
  }

  document.querySelectorAll('[data-need]').forEach(el => {
    const need = el.dataset.need;
    let ok = true;
    if (need === 'login') ok = isLoggedIn();
    if (need === 'admin') ok = isAdmin();
    el.classList.toggle('hidden', !ok);
  });
}

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

/** Baca #hash semasa untuk tentukan subpage awal (default = subpage pertama) */
export function initialSub(defaultSub) {
  const hash = (location.hash || '').replace('#', '');
  return hash || defaultSub;
}

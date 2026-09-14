// ═══════════════════════════════════════════════════════════
// NAV — dropdown (desktop) + drawer accordion (tablet/phone)
// ═══════════════════════════════════════════════════════════
import { authState, onAuthChange, loginWithGoogle, logout, isAdmin, isLoggedIn, deleteMyProfile, setMyTeacherId } from './auth.js';
import { getBranding, getLogo, getTeacherList, getGuruPageData } from './db.js';
import { $, esc, escJs, escRx, toast } from './ui-utils.js';

export const PAGES = [
  { id: 'jadual', href: 'index.html', label: 'Jadual Ganti', icon: 'fa-list-alt', need: null, subs: [] },
  { id: 'jadual-induk', href: 'penyelaras.html', label: 'Jadual Induk', icon: 'fa-th', need: 'admin', subs: [] },
  { id: 'jadual-saya', href: 'ruang-guru.html', label: 'Jadual Saya', icon: 'fa-user', need: 'login', subs: [], hash: 'saya' },
  { id: 'kelas', href: 'ruang-guru.html', label: 'Kelas', icon: 'fa-door-open', need: 'login', subs: [], hash: 'kelas' },
  { id: 'penyelaras', href: 'penyelaras.html', label: 'Penyelaras GG', icon: 'fa-clipboard-list', need: 'admin', subs: [
      { id: 'senarai', label: 'Senarai Nama Guru' }, { id: 'sejarah', label: 'Sejarah' }, { id: 'masa', label: 'Masa Jadual' }
  ]},
  { id: 'admin', href: 'admin.html', label: 'Admin', icon: 'fa-cog', need: 'admin', subs: [
      { id: 'xml', label: 'XML ASC' }, { id: 'logo', label: 'Jenama' }, { id: 'pengguna', label: 'Pengurusan Pengguna' }, { id: 'reset', label: 'Reset Data' }, { id: 'backup', label: 'Backup & Restore' }
  ]},
];

/** Tentukan page id aktif berdasarkan URL semasa (fail + hash). Uruskan
 * kes khas: fail dikongsi oleh >1 entri nav (cth ruang-guru.html oleh
 * jadual-saya & kelas; penyelaras.html oleh jadual-induk & penyelaras). */
function resolveActivePage() {
  const path = (location.pathname.split('/').pop() || 'index.html');
  const hash = (location.hash || '').replace('#', '');
  const candidates = PAGES.filter(p => p.href === path);
  if (candidates.length === 1) return candidates[0].id;
  // lebih daripada 1 page kongsi fail sama:
  // 1) cari yang subs.id sepadan hash (cth Penyelaras GG punya subpage)
  const withSubMatch = candidates.find(p => p.subs.some(s => s.id === hash));
  if (withSubMatch) return withSubMatch.id;
  // 2) cari direct-link (subs=[]) dgn 'hash' eksplisit sepadan (cth Jadual Saya vs Kelas)
  const exactDirect = candidates.find(p => p.subs.length === 0 && p.hash === hash);
  if (exactDirect) return exactDirect.id;
  // 3) fallback: direct-link TANPA hash eksplisit (cth Jadual Induk, default fail tu)
  const genericDirect = candidates.find(p => p.subs.length === 0 && !p.hash);
  return genericDirect ? genericDirect.id : candidates[0].id;
}

function subUrl(p, s) { return p.href + '#' + s.id; }

function desktopItemHtml(p) {
  if (!p.subs.length) {
    const linkHref = p.hash ? `${p.href}#${p.hash}` : p.href;
    return `<a href="${linkHref}" class="page-link" data-page="${p.id}" data-need="${p.need || ''}"><i class="fas ${p.icon}"></i><span>${p.label}</span></a>`;
  }
  return `<div class="page-link-wrap" data-need="${p.need || ''}">
    <button class="page-link page-link-btn" data-page="${p.id}" data-toggle-dd="${p.id}"><i class="fas ${p.icon}"></i><span>${p.label}</span><i class="fas fa-chevron-down dd-chevron"></i></button>
    <div class="page-dropdown" id="dd-${p.id}">
      ${p.subs.map(s => `<a href="${subUrl(p, s)}" class="dd-item-link" data-page="${p.id}" data-sub="${s.id}">${s.label}</a>`).join('')}
    </div>
  </div>`;
}

function drawerItemHtml(p) {
  if (!p.subs.length) {
    const linkHref = p.hash ? `${p.href}#${p.hash}` : p.href;
    return `<a href="${linkHref}" class="drawer-link" data-page="${p.id}" data-need="${p.need || ''}"><i class="fas ${p.icon}"></i><span>${p.label}</span></a>`;
  }
  return `<div class="drawer-group" data-need="${p.need || ''}">
    <button class="drawer-link drawer-group-head" data-page="${p.id}" data-toggle-acc="${p.id}"><i class="fas ${p.icon}"></i><span>${p.label}</span><i class="fas fa-chevron-down acc-chevron"></i></button>
    <div class="drawer-sublist" id="acc-${p.id}">
      ${p.subs.map(s => `<a href="${subUrl(p, s)}" class="drawer-sublink" data-page="${p.id}" data-sub="${s.id}">${s.label}</a>`).join('')}
    </div>
  </div>`;
}

function navShellHtml(branding, logoB64) {
  const iconHtml = logoB64 ? `<img src="${logoB64}" alt="Logo" style="width:100%;height:100%;object-fit:contain;border-radius:8px;">` : `<i class="fas fa-user-clock"></i>`;
  return `
  <div class="navbar">
    <div class="navbar-inner">
      <button class="hamburger-btn" id="hamburger-btn" aria-label="Menu"><i class="fas fa-bars"></i></button>
      <div class="navbar-brand">
        <div class="navbar-icon">${iconHtml}</div>
        <div><div class="navbar-title">${branding.title}</div><div class="navbar-sub">${branding.subtitle}</div></div>
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
      <div class="navbar-icon">${iconHtml}</div>
      <div><div class="navbar-title" style="color:var(--navy);">${branding.title}</div><div class="navbar-sub" style="color:var(--muted);">${branding.subtitle}</div></div>
      <button class="drawer-close" id="drawer-close"><i class="fas fa-times"></i></button>
    </div>
    <nav class="page-nav-drawer" id="page-nav-drawer">
      ${PAGES.map(drawerItemHtml).join('')}
    </nav>
    <div class="drawer-footer">
      <div id="drawer-profile" class="drawer-profile hidden">
        <img id="drawer-user-photo" class="user-photo" src="" alt="">
        <div class="u-meta"><div id="drawer-user-name" class="user-name">—</div>
          <div style="display:flex;gap:10px;">
          <button class="drawer-logout" id="drawer-btn-logout"><i class="fas fa-sign-out-alt"></i> Log Keluar</button>
          <button class="drawer-logout" id="drawer-btn-delete-account" style="color:#94a3b8;"><i class="fas fa-user-slash"></i> Padam Akaun</button>
          </div></div>
      </div>
      <div id="drawer-login-wrap" class="drawer-login-wrap">
        <button class="btn btn-primary btn-sm" id="drawer-btn-login" style="width:100%;"><i class="fab fa-google"></i> Log Masuk</button>
      </div>
      <div class="drawer-copyright">© <span id="drawer-year"></span> ${branding.footerText}</div>
    </div>
  </div>

  <div id="pickNameModal" class="modal-overlay hidden">
    <div class="modal-box">
      <div class="modal-head">Pilih Nama Anda<button id="pick-name-skip-x" class="modal-x"><i class="fas fa-times"></i></button></div>
      <div class="modal-body">
        <div style="font-size:.8rem;color:var(--muted);margin-bottom:10px;">Supaya sistem boleh kenal pasti tugasan guru ganti anda secara automatik (papar di navbar bila anda ditugaskan).</div>
        <div class="search-outer" id="pick-name-search-outer" style="position:relative;">
          <div class="search-field">
            <i class="fas fa-search si-left"></i>
            <input type="text" id="pick-name-search" class="search-input" placeholder="Taip nama guru..." autocomplete="off">
          </div>
          <div class="dd-wrap" id="pick-name-ddwrap"></div>
        </div>
        <button class="btn-ghost btn-sm" id="pick-name-skip" style="margin-top:14px;width:100%;">Langkau buat masa ini</button>
      </div>
    </div>
  </div>`;
}

export async function initNav() {
  const root = $('nav-root');
  const [branding, logoB64] = await Promise.all([getBranding(), getLogo()]);
  root.innerHTML = navShellHtml(branding, logoB64);
  $('drawer-year').textContent = new Date().getFullYear();

  applyActiveHighlight();

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
  });

  const drawer = $('drawer'), overlay = $('drawer-overlay');
  function openDrawer() { drawer.classList.add('open'); overlay.classList.add('open'); }
  function closeDrawer() { drawer.classList.remove('open'); overlay.classList.remove('open'); }
  $('hamburger-btn').addEventListener('click', openDrawer);
  $('drawer-close').addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
  // Nota: '.drawer-group-head' (butang toggle accordion) SENGAJA dikecualikan —
  // ia bukan pautan navigasi, cuma buka/tutup senarai subpage. Kalau tak dikecualikan,
  // drawer terus tertutup sebelum sempat nampak accordion terbuka.
  document.querySelectorAll('.drawer-link:not(.drawer-group-head), .drawer-sublink').forEach(a => a.addEventListener('click', closeDrawer));

  $('btn-login').addEventListener('click', loginWithGoogle);
  $('btn-logout').addEventListener('click', logout);
  $('drawer-btn-login').addEventListener('click', loginWithGoogle);
  $('drawer-btn-logout').addEventListener('click', logout);
  $('drawer-btn-delete-account').addEventListener('click', async () => {
    const ok = confirm('Padam akaun/profil anda dari sistem ni?\n\nIni cuma buang rekod role & pautan nama guru anda dalam sistem — akaun Google anda sendiri TIDAK dipadam. Anda boleh log masuk semula lepas ni (akan mula semula sebagai "Belum Disahkan").\n\nTeruskan?');
    if (!ok) return;
    const res = await deleteMyProfile();
    if (!res.success) { toast('Gagal padam akaun: ' + res.message, 'error'); return; }
    location.href = 'index.html';
  });

  onAuthChange(renderAuthUI);
  window.addEventListener('hashchange', applyActiveHighlight);

  // ── Pilih Nama modal ──
  $('pick-name-search').addEventListener('input', () => { renderPickNameDD($('pick-name-search').value); $('pick-name-ddwrap').classList.add('open'); });
  $('pick-name-search').addEventListener('focus', () => { renderPickNameDD($('pick-name-search').value); $('pick-name-ddwrap').classList.add('open'); });
  document.addEventListener('click', e => { if (!$('pick-name-search-outer').contains(e.target)) $('pick-name-ddwrap').classList.remove('open'); });
  $('pick-name-skip').addEventListener('click', skipPickName);
  $('pick-name-skip-x').addEventListener('click', skipPickName);
}

// ═══════════════════════════════════════════════════════════
// PILIH NAMA modal — muncul automatik lepas login jika teacherId
// belum ditetapkan (elak guru yang tak pernah buka Ruang Guru
// terlepas ciri kenal-pasti tugasan).
// ═══════════════════════════════════════════════════════════
let _pickNameTeachers = null;

async function checkPickNamePrompt(state) {
  if (!state.user || !state.profile) { $('pickNameModal')?.classList.add('hidden'); return; }
  if (state.profile.teacherId) { $('pickNameModal')?.classList.add('hidden'); return; }
  if (sessionStorage.getItem('pickNameSkipped')) return;
  $('pickNameModal').classList.remove('hidden');
  if (!_pickNameTeachers) _pickNameTeachers = await getTeacherList();
  renderPickNameDD('');
}

function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (!parts[0]) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function renderPickNameDD(q) {
  const dd = $('pick-name-ddwrap');
  if (!_pickNameTeachers) { dd.innerHTML = `<div class="dd-empty"><i class="fas fa-spinner fa-spin"></i>Memuatkan senarai guru...</div>`; return; }
  const ql = q.trim().toLowerCase();
  const filtered = (ql ? _pickNameTeachers.filter(t => t.name.toLowerCase().includes(ql) || (t.short || '').toLowerCase().includes(ql)) : _pickNameTeachers)
    .slice().sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50);
  if (!filtered.length) { dd.innerHTML = `<div class="dd-empty"><i class="fas fa-search"></i>Tiada guru dijumpai.</div>`; return; }
  dd.innerHTML = filtered.map(t => {
    const hl = ql ? t.name.replace(new RegExp('(' + escRx(ql) + ')', 'gi'), '<em>$1</em>') : t.name;
    return `<div class="dd-item" data-id="${escJs(t.id)}">
      <div class="dd-item-avatar">${esc(getInitials(t.name))}</div>
      <span class="dd-item-name">${hl}</span>${t.short ? `<span class="dd-item-short">${esc(t.short)}</span>` : ''}
    </div>`;
  }).join('');
  dd.querySelectorAll('.dd-item').forEach(el => el.addEventListener('mousedown', () => selectPickName(el.dataset.id)));
}

async function selectPickName(id) {
  const t = (_pickNameTeachers || []).find(x => x.id === id);
  if (!t) return;
  const res = await setMyTeacherId(id);
  if (!res.success) { toast('Gagal simpan pautan nama: ' + res.message, 'error'); return; }
  $('pickNameModal').classList.add('hidden');
  checkTodayDuty();
}

function skipPickName() {
  sessionStorage.setItem('pickNameSkipped', '1');
  $('pickNameModal').classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════
// SOROT NAMA — nama pengguna di navbar bertukar warna kalau dia
// ada tugasan guru ganti PADA HARI INI.
// ═══════════════════════════════════════════════════════════
let baseName = '';
let todayDutyCount = 0;

function updateNameDisplay() {
  const el1 = $('user-name'), el2 = $('drawer-user-name');
  if (!el1 || !el2) return;
  const suffix = todayDutyCount > 0 ? ` ●` : '';
  el1.textContent = baseName + suffix;
  el2.textContent = baseName + suffix;
  el1.classList.toggle('on-duty', todayDutyCount > 0);
  el2.classList.toggle('on-duty', todayDutyCount > 0);
  const title = todayDutyCount > 0 ? `Anda ditugaskan menggantikan ${todayDutyCount} slot hari ini` : '';
  if (title) { el1.title = title; el2.title = title; } else { el1.removeAttribute('title'); el2.removeAttribute('title'); }
}

async function checkTodayDuty() {
  todayDutyCount = 0;
  updateNameDisplay();
  const teacherId = authState.profile?.teacherId;
  if (!teacherId) return;
  try {
    if (!_pickNameTeachers) _pickNameTeachers = await getTeacherList();
    const t = _pickNameTeachers.find(x => x.id === teacherId);
    if (!t) return;
    const today = new Date();
    const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    const res = await getGuruPageData(dateStr);
    const duties = res.board?.reliefDuties?.[t.name];
    todayDutyCount = duties ? duties.length : 0;
    updateNameDisplay();
  } catch (e) { /* senyap — bukan ciri kritikal */ }
}

function applyActiveHighlight() {
  const activeId = resolveActivePage();
  const hash = (location.hash || '').replace('#', '');
  document.querySelectorAll('[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === activeId));
  document.querySelectorAll('[data-sub]').forEach(a => a.classList.toggle('active', a.dataset.page === activeId && a.dataset.sub === hash));
  // Auto-expand accordion/dropdown kumpulan yang aktif
  document.querySelectorAll('[data-toggle-acc]').forEach(btn => {
    const isActiveGroup = btn.dataset.page === activeId;
    $('acc-' + btn.dataset.toggleAcc).classList.toggle('open', isActiveGroup);
    btn.classList.toggle('open', isActiveGroup);
  });
}

function renderAuthUI(state) {
  $('auth-loading').classList.add('hidden');
  const loginBtn = $('btn-login'), chip = $('user-chip');
  const dProfile = $('drawer-profile'), dLogin = $('drawer-login-wrap');
  if (state.user) {
    loginBtn.classList.add('hidden'); chip.classList.remove('hidden');
    $('user-photo').src = state.profile?.photoURL || state.user.photoURL || '';
    $('user-role').textContent = state.profile?.role === 'admin' ? 'Admin' : (state.profile?.role === 'pending' ? 'Belum Disahkan' : 'Guru');
    dProfile.classList.remove('hidden'); dLogin.classList.add('hidden');
    $('drawer-user-photo').src = state.profile?.photoURL || state.user.photoURL || '';
    baseName = state.profile?.name || state.user.displayName || state.user.email;
    updateNameDisplay();
    checkPickNamePrompt(state);
    checkTodayDuty();
  } else {
    loginBtn.classList.remove('hidden'); chip.classList.add('hidden');
    dProfile.classList.add('hidden'); dLogin.classList.remove('hidden');
    baseName = ''; todayDutyCount = 0;
    $('pickNameModal')?.classList.add('hidden');
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

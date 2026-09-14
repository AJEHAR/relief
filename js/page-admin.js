import { initNav, gatePage, initialSub } from './nav.js';
import { authState } from './auth.js';
import * as db from './db.js';
import { processASCXML } from './xml-import.js';
import { $, esc, escJs, toast, showConfirm, skeletonRows } from './ui-utils.js';

initNav();

let pendingLogoBase64 = undefined;

function switchSub(sub) {
  ['xml', 'logo', 'pengguna', 'reset'].forEach(s => $('sub-' + s).classList.toggle('hidden', s !== sub));
  if (sub === 'logo') { loadAdminLogoPreview(); loadBrandingForm(); }
  if (sub === 'pengguna') loadUserMgmt();
}

// ── XML ASC ──
function wireXmlUpload() {
  $('xml-drop-zone').addEventListener('click', () => $('xmlFile').click());
  $('xmlFile').addEventListener('change', async function (e) {
    const file = e.target.files[0];
    if (!file) return;
    $('setup-msg').textContent = '';
    $('setup-loading').classList.remove('hidden');
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const res = await processASCXML(ev.target.result, (msg) => { $('setup-loading-msg').textContent = msg; });
      $('setup-loading').classList.add('hidden');
      $('setup-msg').innerHTML = res.success
        ? `<span style="color:var(--success);">${esc(res.message)}</span>`
        : `<span style="color:var(--danger);">${esc(res.message)}</span>`;
      $('xmlFile').value = '';
    };
    reader.onerror = () => { $('setup-loading').classList.add('hidden'); $('setup-msg').innerHTML = `<span style="color:var(--danger);">Gagal membaca fail.</span>`; };
    reader.readAsText(file);
  });
}

// ── Logo ──
async function loadAdminLogoPreview() {
  const b64 = await db.getLogo();
  if (b64) { $('logo-preview-img').src = b64; $('logo-preview-img').style.display = 'block'; $('logo-preview-empty').style.display = 'none'; }
  else { $('logo-preview-img').style.display = 'none'; $('logo-preview-empty').style.display = 'block'; }
}
function previewLogo(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    pendingLogoBase64 = e.target.result;
    $('logo-preview-img').src = pendingLogoBase64; $('logo-preview-img').style.display = 'block'; $('logo-preview-empty').style.display = 'none';
    $('btn-save-logo').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}
async function saveLogoAction() {
  if (pendingLogoBase64 === undefined) return;
  const res = await db.saveLogo(pendingLogoBase64);
  if (!res.success) return toast(res.message, 'error');
  $('btn-save-logo').classList.add('hidden');
  toast('Logo disimpan.', 'success');
}
function removeLogoAction() {
  showConfirm({
    title: 'Padam Logo', msg: 'Padam logo sekolah?', okLabel: 'Padam', okType: 'warn',
    onOk: async () => { await db.saveLogo(null); pendingLogoBase64 = undefined; await loadAdminLogoPreview(); toast('Logo dipadam.', 'success'); }
  });
}

// ── Jenama (tajuk/subtajuk/footer) ──
async function loadBrandingForm() {
  const b = await db.getBranding();
  $('brand-title').value = b.title;
  $('brand-subtitle').value = b.subtitle;
  $('brand-footer').value = b.footerText;
}
async function saveBrandingAction() {
  const title = $('brand-title').value.trim() || 'SISTEM GURU GANTI';
  const subtitle = $('brand-subtitle').value.trim() || 'K-SpeEdS';
  const footerText = $('brand-footer').value.trim() || 'Sistem Guru Ganti · Hak Cipta Terpelihara';
  const res = await db.saveBranding({ title, subtitle, footerText });
  if (!res.success) { $('branding-msg').innerHTML = `<span style="color:var(--danger);">Ralat: ${esc(res.message)}</span>`; return; }
  $('branding-msg').innerHTML = `<span style="color:var(--success);">✅ Disimpan. Refresh halaman untuk lihat perubahan di navbar.</span>`;
  toast('Jenama disimpan.', 'success');
}

// ── Pengurusan Pengguna ──
async function loadUserMgmt() {
  const wrap = $('user-mgmt-list');
  wrap.innerHTML = skeletonRows(3);
  const users = await db.listUsers();
  if (!users.length) { wrap.innerHTML = `<div style="color:var(--muted);font-size:.8rem;">Tiada pengguna log masuk lagi.</div>`; return; }
  users.sort((a, b) => (a.role === 'pending' ? -1 : 1) - (b.role === 'pending' ? -1 : 1));
  wrap.innerHTML = users.map(u => `<div class="user-row">
    <img src="${esc(u.photoURL || '')}" onerror="this.style.visibility='hidden'">
    <div class="u-meta"><div style="font-weight:700;font-size:.82rem;">${esc(u.name || u.email)}</div><div class="u-email">${esc(u.email)}</div></div>
    <select data-uid="${esc(u.uid)}" class="role-select">
      <option value="pending" ${u.role === 'pending' ? 'selected' : ''}>Belum Disahkan</option>
      <option value="guru" ${u.role === 'guru' ? 'selected' : ''}>Guru</option>
      <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
    </select>
    <button class="btn-ghost btn-sm btn-del-user" data-uid="${esc(u.uid)}" data-name="${esc(u.name || u.email)}" style="color:#dc2626;margin-left:6px;" title="Padam profil pengguna ini"><i class="fas fa-trash"></i></button>
    </div>`).join('');
  wrap.querySelectorAll('.role-select').forEach(sel => sel.addEventListener('change', () => setUserRoleAction(sel.dataset.uid, sel.value)));
  wrap.querySelectorAll('.btn-del-user').forEach(btn => btn.addEventListener('click', () => deleteUserAction(btn.dataset.uid, btn.dataset.name)));
}
async function setUserRoleAction(uid, role) {
  const res = await db.setUserRole(uid, role);
  if (!res.success) return toast('Gagal kemas kini role: ' + res.message, 'error');
  toast('Role dikemaskini.', 'success');
  if (uid === authState.user?.uid) location.reload();
}
function deleteUserAction(uid, name) {
  showConfirm({
    title: 'Padam Profil Pengguna',
    msg: `Padam profil "${name}" dari sistem? Ini cuma buang rekod role/pautan guru dalam sistem ni — akaun Google dia sendiri TIDAK dipadam. Dia boleh log masuk semula lepas ni (akan mula semula sebagai "Belum Disahkan").`,
    okLabel: 'Padam', okType: 'warn',
    onOk: async () => {
      const res = await db.deleteUserProfile(uid);
      if (!res.success) return toast('Gagal padam: ' + res.message, 'error');
      toast('Profil dipadam.', 'success');
      if (uid === authState.user?.uid) location.reload();
      else loadUserMgmt();
    }
  });
}

// ── Reset Data ──
function logReset(msg, isError) {
  const el = $('reset-log');
  el.innerHTML = `<span style="color:${isError ? '#dc2626' : '#059669'};">${esc(msg)}</span>`;
}
function wireResetButtons() {
  document.querySelectorAll('.reset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      const label = btn.textContent.trim();
      showConfirm({
        title: 'Padam Data', msg: `Padam "${label}"? Tindakan ini KEKAL, tiada cara nak undo. Pastikan anda memang dalam fasa testing.`,
        okLabel: 'Ya, Padam', okType: 'warn',
        onOk: async () => {
          try {
            const n = await db.resetSection(section);
            logReset(`✅ Berjaya padam (${n} rekod terjejas) — ${label}`);
          } catch (e) { logReset('❌ Ralat: ' + e.message, true); }
        }
      });
    });
  });
  $('btn-reset-all').addEventListener('click', () => {
    showConfirm({
      title: '⚠️ PADAM SEMUA DATA OPERASI',
      msg: 'Ini akan padam SEMUA: senarai guru, jadual induk, papan harian (semua tarikh), arkib, dan logo sekolah. TIDAK termasuk senarai Pengguna. Tindakan ini KEKAL. Anda pasti?',
      okLabel: 'Ya, PADAM SEMUA', okType: 'warn',
      onOk: async () => {
        try {
          const n = await db.resetAllOperationalData();
          logReset(`✅ Semua data operasi dipadam (${n} rekod terjejas).`);
        } catch (e) { logReset('❌ Ralat: ' + e.message, true); }
      }
    });
  });
}

gatePage('admin', async () => {
  wireXmlUpload();
  $('logoFileInput').addEventListener('change', previewLogo);
  $('btn-save-logo').addEventListener('click', saveLogoAction);
  $('btn-remove-logo').addEventListener('click', removeLogoAction);
  $('btn-save-branding').addEventListener('click', saveBrandingAction);
  wireResetButtons();
  switchSub(initialSub('xml'));
  window.addEventListener('hashchange', () => switchSub(initialSub('xml')));
});

window.AdminPage = {};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

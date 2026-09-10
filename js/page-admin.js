import { initNav, gatePage } from './nav.js';
import { authState } from './auth.js';
import * as db from './db.js';
import { processASCXML } from './xml-import.js';
import { $, esc, escJs, toast, showConfirm } from './ui-utils.js';

initNav('admin');

let pendingLogoBase64 = undefined;

function switchSub(sub) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.sub === sub));
  ['xml', 'logo', 'pengguna'].forEach(s => $('sub-' + s).classList.toggle('hidden', s !== sub));
  if (sub === 'logo') loadAdminLogoPreview();
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

// ── Pengurusan Pengguna ──
async function loadUserMgmt() {
  const wrap = $('user-mgmt-list');
  wrap.innerHTML = 'Memuatkan...';
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
    </select></div>`).join('');
  wrap.querySelectorAll('.role-select').forEach(sel => sel.addEventListener('change', () => setUserRoleAction(sel.dataset.uid, sel.value)));
}
async function setUserRoleAction(uid, role) {
  await db.setUserRole(uid, role);
  toast('Role dikemaskini.', 'success');
  if (uid === authState.user?.uid) location.reload();
}

gatePage('admin', async () => {
  wireXmlUpload();
  $('logoFileInput').addEventListener('change', previewLogo);
  $('btn-save-logo').addEventListener('click', saveLogoAction);
  $('btn-remove-logo').addEventListener('click', removeLogoAction);
  switchSub('xml');
});

window.AdminPage = { switchSub };

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

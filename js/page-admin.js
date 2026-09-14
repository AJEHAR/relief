import { initNav, gatePage, initialSub } from './nav.js';
import { authState } from './auth.js';
import * as db from './db.js';
import { processASCXML } from './xml-import.js';
import { $, esc, escJs, toast, showConfirm, skeletonRows } from './ui-utils.js';

initNav();

let pendingLogoBase64 = undefined;

function switchSub(sub) {
  ['xml', 'logo', 'pengguna', 'reset', 'backup'].forEach(s => $('sub-' + s).classList.toggle('hidden', s !== sub));
  if (sub === 'logo') { loadAdminLogoPreview(); loadBrandingForm(); }
  if (sub === 'pengguna') loadUserMgmt();
  if (sub === 'backup') renderBackupSectionList();
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
function setBtnLoading(btn, loading, loadingText) {
  if (loading) {
    btn.dataset.originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.style.opacity = '.6';
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${esc(loadingText || 'Memproses...')}`;
  } else {
    btn.disabled = false;
    btn.style.opacity = '';
    if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
  }
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
          setBtnLoading(btn, true, 'Memadam...');
          logReset('⏳ Sedang memadam...');
          try {
            const n = await db.resetSection(section);
            const msg = `✅ Berjaya padam (${n} rekod terjejas) — ${label}`;
            logReset(msg);
            toast(msg, 'success');
          } catch (e) {
            logReset('❌ Ralat: ' + e.message, true);
            toast('Gagal padam: ' + e.message, 'error');
          } finally {
            setBtnLoading(btn, false);
          }
        }
      });
    });
  });
  $('btn-reset-all').addEventListener('click', () => {
    const btn = $('btn-reset-all');
    showConfirm({
      title: '⚠️ PADAM SEMUA DATA OPERASI',
      msg: 'Ini akan padam SEMUA: senarai guru, jadual induk, papan harian (semua tarikh), arkib, dan logo sekolah. TIDAK termasuk senarai Pengguna. Tindakan ini KEKAL. Anda pasti?',
      okLabel: 'Ya, PADAM SEMUA', okType: 'warn',
      onOk: async () => {
        setBtnLoading(btn, true, 'Memadam semua data...');
        logReset('⏳ Sedang memadam semua data operasi...');
        try {
          const n = await db.resetAllOperationalData();
          const msg = `✅ Semua data operasi dipadam (${n} rekod terjejas).`;
          logReset(msg);
          toast(msg, 'success');
        } catch (e) {
          logReset('❌ Ralat: ' + e.message, true);
          toast('Gagal padam: ' + e.message, 'error');
        } finally {
          setBtnLoading(btn, false);
        }
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════
// BACKUP & RESTORE
// ═══════════════════════════════════════════════════════════
let pendingRestoreData = null;

function renderBackupSectionList() {
  $('backup-section-list').innerHTML = db.BACKUP_SECTIONS.map(s => `
    <label style="display:flex;align-items:center;gap:8px;font-size:.8rem;font-weight:700;color:var(--navy);">
      <input type="checkbox" class="backup-cb" value="${esc(s.id)}" checked> ${esc(s.label)}
    </label>`).join('');
}

function checkedValues(selector) {
  return Array.from(document.querySelectorAll(selector + ':checked')).map(el => el.value);
}

async function doBackup() {
  const sections = checkedValues('.backup-cb');
  if (!sections.length) return toast('Sila pilih sekurang-kurangnya 1 bahagian.', 'error');
  const btn = $('btn-do-backup');
  setBtnLoading(btn, true, 'Membuat backup...');
  $('backup-log').innerHTML = `<span style="color:var(--muted);"><i class="fas fa-spinner fa-spin"></i> Mengumpul data...</span>`;
  try {
    const data = await db.exportBackupData(sections);
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `backup-relief-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const msg = `✅ Backup siap dimuat turun (${sections.length} bahagian: ${data.sections.join(', ')}).`;
    $('backup-log').innerHTML = `<span style="color:var(--success);">${esc(msg)}</span>`;
    toast('Backup berjaya dimuat turun.', 'success');
  } catch (e) {
    $('backup-log').innerHTML = `<span style="color:var(--danger);">❌ Ralat: ${esc(e.message)}</span>`;
    toast('Gagal buat backup: ' + e.message, 'error');
  } finally {
    setBtnLoading(btn, false);
  }
}

function wireRestoreFileInput() {
  $('restore-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $('restore-file-name').textContent = file.name;
    $('restore-log').innerHTML = '';
    $('restore-section-wrap').classList.add('hidden');
    pendingRestoreData = null;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.sections) || !parsed.sections.length) {
        throw new Error('Fail ni bukan fail backup yang sah (struktur tak dikenali).');
      }
      pendingRestoreData = parsed;
      const available = db.BACKUP_SECTIONS.filter(s => parsed.sections.includes(s.id));
      $('restore-section-list').innerHTML = available.map(s => `
        <label style="display:flex;align-items:center;gap:8px;font-size:.8rem;font-weight:700;color:var(--navy);">
          <input type="checkbox" class="restore-cb" value="${esc(s.id)}" checked> ${esc(s.label)}
        </label>`).join('');
      $('restore-section-wrap').classList.remove('hidden');
      $('restore-log').innerHTML = `<span style="color:var(--muted);">Backup dibuat: ${esc(parsed.exportedAt || '—')} · ${available.length} bahagian tersedia dalam fail ni.</span>`;
    } catch (err) {
      toast('Fail tidak sah: ' + err.message, 'error');
      $('restore-log').innerHTML = `<span style="color:var(--danger);">❌ ${esc(err.message)}</span>`;
    }
  });
}

function doRestore() {
  if (!pendingRestoreData) return;
  const sections = checkedValues('.restore-cb');
  if (!sections.length) return toast('Sila pilih sekurang-kurangnya 1 bahagian.', 'error');
  const labels = db.BACKUP_SECTIONS.filter(s => sections.includes(s.id)).map(s => s.label).join(', ');
  showConfirm({
    title: '⚠️ Restore Data',
    msg: `Ini akan GANTIKAN sepenuhnya bahagian berikut dengan kandungan fail backup: ${labels}. Data semasa bagi bahagian ni akan HILANG (digantikan). Tindakan ini KEKAL. Anda pasti?`,
    okLabel: 'Ya, Restore', okType: 'warn',
    onOk: async () => {
      const btn = $('btn-do-restore');
      setBtnLoading(btn, true, 'Sedang restore...');
      $('restore-log').innerHTML = `<span style="color:var(--muted);"><i class="fas fa-spinner fa-spin"></i> Sedang restore data...</span>`;
      try {
        const report = await db.restoreBackupData(pendingRestoreData, sections);
        const summary = Object.entries(report).map(([k, v]) => `${k}: ${v}`).join(', ');
        const msg = `✅ Restore siap — ${summary}.`;
        $('restore-log').innerHTML = `<span style="color:var(--success);">${esc(msg)}</span>`;
        toast('Restore berjaya.', 'success');
      } catch (e) {
        $('restore-log').innerHTML = `<span style="color:var(--danger);">❌ Ralat: ${esc(e.message)}</span>`;
        toast('Gagal restore: ' + e.message, 'error');
      } finally {
        setBtnLoading(btn, false);
      }
    }
  });
}

gatePage('admin', async () => {
  wireXmlUpload();
  $('logoFileInput').addEventListener('change', previewLogo);
  $('btn-save-logo').addEventListener('click', saveLogoAction);
  $('btn-remove-logo').addEventListener('click', removeLogoAction);
  $('btn-save-branding').addEventListener('click', saveBrandingAction);
  wireResetButtons();
  $('btn-do-backup').addEventListener('click', doBackup);
  wireRestoreFileInput();
  $('btn-do-restore').addEventListener('click', doRestore);
  switchSub(initialSub('xml'));
  window.addEventListener('hashchange', () => switchSub(initialSub('xml')));
});

window.AdminPage = {};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

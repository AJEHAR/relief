// ═══════════════════════════════════════════════════════════
// PRINT / PDF — guna dialog cetak asli browser (window.print()),
// sama macam printJadualIndukByDay() dalam sistem asal. Pengguna
// boleh pilih "Save as PDF" atau hantar terus ke pencetak.
// ═══════════════════════════════════════════════════════════
import { getLogo } from './db.js';

const PRINT_CSS = `
  * { box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color:#1e2d4a; margin:20px; }
  table { width:100%; border-collapse:collapse; font-size:9.5pt; margin-bottom:12pt; }
  th { background:#1e3a8a !important; color:#fff !important; padding:6pt 8pt; font-size:8pt; text-transform:uppercase; text-align:left; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  td { padding:7pt 8pt; border-bottom:0.5pt solid #e2e8f0; vertical-align:middle; }
  .green { color:#059669; font-weight:bold; }
  .red { color:#dc2626; font-weight:bold; }
  .pdf-header { display:flex; align-items:center; gap:10pt; margin-bottom:10pt; }
  .pdf-header img { width:42pt; height:42pt; object-fit:contain; }
  .pdf-title { font-size:16pt; font-weight:800; color:#0f2044; margin-bottom:4pt; }
  .pdf-sub { font-size:10pt; color:#6b7c9e; margin-bottom:16pt; }
  @media print {
    body { margin:0; }
    @page { margin: 14mm; }
  }
`;

/**
 * Buka tetingkap cetak BARU serta-merta (synchronous, sebelum sebarang await)
 * supaya browser tak sekat sebagai popup. Panggil writePrintWindow() lepas
 * data sedia (boleh selepas await).
 */
export function openPrintWindow() {
  return window.open('', '_blank', 'width=900,height=1000');
}

export async function writePrintWindow(win, htmlContent, title) {
  if (!win) {
    alert('Tetingkap cetak disekat oleh browser. Sila benarkan popup untuk laman ini dan cuba lagi.');
    return;
  }
  let logoHtml = '';
  try {
    const logo = await getLogo();
    if (logo) logoHtml = `<div class="pdf-header"><img src="${logo}" alt="Logo"></div>`;
  } catch (e) { /* logo pilihan sahaja, jangan gagalkan cetakan */ }

  const fullHtml = `<!doctype html><html lang="ms"><head><meta charset="utf-8"><title>${title}</title>
    <style>${PRINT_CSS}</style></head><body>${logoHtml}${htmlContent}
    <script>window.onload=function(){setTimeout(function(){window.focus();window.print();},250);};</script>
    </body></html>`;

  // Guna Blob + navigate (BUKAN document.write) — lebih stabil untuk laporan
  // besar (ratusan KB, cth Laporan Mengikut Tempoh merentas banyak hari),
  // terutama di browser mudah alih yang kurang stabil dgn document.write().
  try {
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    win.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  } catch (e) {
    // fallback kalau Blob/navigate gagal atas sebab tak dijangka
    win.document.open();
    win.document.write(fullHtml);
    win.document.close();
  }
}

/** Ringkasan: buka + tulis terus (guna bila TIADA async sebelum data sedia) */
export async function printNow(htmlContent, title) {
  await writePrintWindow(openPrintWindow(), htmlContent, title);
}

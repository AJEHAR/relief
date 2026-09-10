// ═══════════════════════════════════════════════════════════
// PDF EXPORT — client-side (html2pdf.js), gantikan generatePDFServer()
// yang dulu guna Google Drive API di Apps Script.
// html2pdf.js dimuatkan via CDN dalam index.html (window.html2pdf).
// ═══════════════════════════════════════════════════════════

const PRINT_CSS = `
  * { box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; color:#1e2d4a; }
  table { width:100%; border-collapse:collapse; font-size:9pt; margin-bottom:12pt; }
  th { background:#1e3a8a; color:#fff; padding:5pt 8pt; font-size:7.5pt; text-transform:uppercase; text-align:left; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  td { padding:6pt 8pt; border-bottom:0.5pt solid #e2e8f0; vertical-align:middle; }
  .teacher-head { background:#1e3a8a; color:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .green { color:#059669; font-weight:bold; }
  .red { color:#dc2626; }
  .pdf-title { font-size:14pt; font-weight:800; color:#0f2044; margin-bottom:4pt; }
  .pdf-sub { font-size:9pt; color:#6b7c9e; margin-bottom:14pt; }
`;

export async function exportHtmlToPdf(htmlContent, filename) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;';
  const style = document.createElement('style');
  style.textContent = PRINT_CSS;
  wrap.appendChild(style);
  const body = document.createElement('div');
  body.innerHTML = htmlContent;
  wrap.appendChild(body);
  document.body.appendChild(wrap);

  try {
    await window.html2pdf().set({
      margin: 10,
      filename: filename.endsWith('.pdf') ? filename : filename + '.pdf',
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] }
    }).from(wrap).save();
  } finally {
    document.body.removeChild(wrap);
  }
}

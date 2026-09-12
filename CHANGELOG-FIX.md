# Log Pembaikan Bug (audit + fix)

Semua 10 bug yang dikenal pasti semasa audit kod telah dibaiki. Ringkasan di bawah;
cari komen `// NOTA (fix)` dalam kod untuk penjelasan penuh di lokasi sebenar.

## ⚠️ TINDAKAN WAJIB SEBELUM DEPLOY
`js/firebase-config.js` dan `firestore.rules` kini guna **placeholder**
(kunci/emel sebenar yang sebelum ini ter-commit telah dibuang atas sebab
keselamatan). Anda MESTI:
1. Isi semula `js/firebase-config.js` dengan config projek Firebase anda sendiri.
2. Isi semula emel admin pertama dalam `firestore.rules` (`isBootstrapAdmin()`)
   — MESTI sama dengan `BOOTSTRAP_ADMIN_EMAILS` dalam `firebase-config.js`.
3. Deploy semula `firestore.rules` ke Firebase Console.

Kalau projek Firebase asal anda (`guruganti-77b4d`) masih yang nak digunakan,
anda cuma perlu salin balik nilai asal dari Firebase Console → Project Settings.

## Senarai Pembaikan

1. **Kunci Firebase & emel peribadi bocor dalam repo** — `js/firebase-config.js`
   & `firestore.rules` ditukar ke placeholder + amaran keselamatan.
2. **Masa terpotong di paparan mudah alih** — `page-jadual.js` & `page-penyelaras.js`
   dulu `.split(' - ')` (hyphen) tapi data sebenar guna en-dash (–) →
   sekarang guna regex yang terima kedua-dua bentuk.
3. **`escJs()` disalahguna untuk atribut HTML** (berisiko HTML-injection kalau
   ID guru dari XML import ada aksara istimewa) — ditukar ke `esc()` di
   `nav.js` & `page-penyelaras.js`; `page-ruang-guru.js` dirombak dari
   `onmousedown="...('...')"` inline kepada `data-id` + `addEventListener`
   (corak sama macam `nav.js`), buang keperluan `window.RGPage` global.
4. **Kelas gabungan (>1 `classIds`) hilang senyap semasa import XML** —
   `xml-import.js` sekarang loop SEMUA `classIds`, bukan ambil yang pertama
   sahaja.
5. **Grid Penyelaras cuma papar/boleh isi 1 kelas** bila seorang guru ada >1
   kelas serentak (team-teaching/kelas gabungan) — `page-penyelaras.js`
   `renderTimetableGrid()` dirombak supaya setiap kelas dalam slot yang sama
   dipapar & assignable berasingan.
6. **Import CSV Teachers padam "Guru Tambahan" sedia ada** — `migrate.js`
   `importTeachers()` kini kekalkan guru `EXTRA_*` sedia ada, sama macam
   kelakuan `xml-import.js`.
7. **Service worker tak precache fail JS** — `sw.js` `STATIC_ASSETS` kini
   sertakan semua `js/*.js`.
8. **Dropdown role "Guru" tak berfungsi** (sama fungsi dgn "pending", boleh
   mengelirukan admin) — pilihan dibuang dari `page-admin.js`, kekal 2 keadaan
   sebenar sistem: Belum Disahkan / Admin.
9. **Padanan guru ganti ikut nama teks (rapuh)** — masalah akar yang punca
   beberapa bug lain (nama pendua, nama disunting kemudian, badge "on-duty"
   navbar tersasar). Fix:
   - `board-engine.js`, `db.js` — assignment kini simpan `reliefId` (ID guru
     stabil) bersama nama; `getReliefFromAssignment()` pulangkan medan ini.
   - `reliefDuties` (buildBoardDataLight) & `teacherReliefMap` (buildBoardData)
     kini dikunci ikut ID dahulu, nama sebagai fallback utk rekod lama.
   - `nav.js` (badge "on-duty"), `page-ruang-guru.js` ("Jadual Saya"),
     `page-penyelaras.js` (grid override/relief-busy) — semua dikemas kini
     guna padanan ID-dahulu.
   - Turut dibaiki serentak: `db.js confirmDailyBoard()` guna
     `key.split('|')` yang boleh potong `className` salah kalau ia sendiri
     mengandungi `|` — kini guna `slice(2).join('|')`.
   - **Nota keserasian**: rekod LAMA (dibuat sebelum fix ni) tiada `reliefId`
     — sistem akan fallback ke padanan nama seperti sebelum ini utk rekod
     tersebut. Rekod BARU akan simpan `reliefId` secara automatik.
10. **Tiada semakan pertindihan `teacherId`** (isu impersonation — >1 akaun
    Google boleh claim identiti guru sama) — `auth.js` `setMyTeacherId()`
    kini semak dulu jika ID tu dah terikat akaun lain, pulangkan amaran;
    `nav.js` & `page-ruang-guru.js` papar `confirm()` sebelum benarkan
    override paksa (`force:true`).

## Susulan semasa semakan "1 waktu, 2 guru" (bug #5)

Semasa disahkan semula khusus utk senario team-teaching/kelas gabungan,
jumpa **1 lagi bug CSS** yang terhasil daripada fix #5 tadi:

11. **Sel bertindih tinggi bila >1 kelas serentak** — `.tt-slot{height:64px}`
    (tegar) + `.tt-slot-inner{height:100%}` bermaksud SETIAP sub-slot dalam
    satu `<td>` cuba isi 100% × 64px SECARA BERASINGAN, jadi baris jadual
    bengkak/tak kemas bila seorang guru ada 2 kelas serentak. Fix: kelas
    `.tt-slot-multi` ditambah pada `<td>` (via `page-penyelaras.js`) +
    peraturan CSS baru (`css/style.css`) yang buat tinggi ikut kandungan
    (auto) bagi kes ni sahaja — sel 1-kelas biasa tak terjejas.
12. **Kelas CSS `.s-partial` (oren, "sebahagian diisi") tak pernah digunakan**
    — sedia ada dalam CSS asal tapi mati (keadaan ni mustahil berlaku semasa
    cuma 1 kelas/slot). Sekarang diwiring: kalau 2 kelas serentak & CUMA
    SATU dah ada guru ganti, sel tunjuk oren (`s-partial`) bukan hijau
    (`s-done`) — admin boleh nampak dengan jelas mana yang masih tergantung.


## Disahkan
- Semua fail JS lulus `node --check` (tiada ralat sintaks).
- Semua `id` DOM yang dirujuk `$('...')` dalam setiap `page-*.js` disahkan
  wujud dalam HTML yang berkaitan.

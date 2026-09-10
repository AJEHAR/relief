# Sistem Guru Ganti — relief.syazr.com

**Struktur 4 halaman + subpage**, guna **Firebase** (Firestore + Authentication Google). Tiada server/Cloud Functions — semua logik jalan di browser.

## Struktur Halaman

```
index.html          → Jadual Ganti           (AWAM, tiada login)
ruang-guru.html      → Ruang Guru             (perlu LOGIN)
                        ├─ subpage: Jadual Saya
                        └─ subpage: Kelas
penyelaras.html      → Penyelaras GG          (perlu ADMIN)
                        ├─ subpage: Papan
                        ├─ subpage: Senarai Nama Guru
                        └─ subpage: Sejarah
admin.html           → Admin                  (perlu ADMIN)
                        ├─ subpage: XML ASC
                        ├─ subpage: Upload Logo
                        └─ subpage: Pengurusan Pengguna
```

Nav atas (desktop, lebar ≥900px) papar semua 4 link (yang tak layak disorok automatik). Skrin sempit (tablet/phone, <900px) papar ikon ☰ yang buka **menu tepi (drawer)** dengan link yang sama.

## Fail JS penting

- `js/nav.js` — navbar + drawer dikongsi semua page, + fungsi `gatePage()` (kunci akses ikut public/login/admin)
- `js/ui-utils.js` — helper dikongsi ($, esc, toast, showConfirm, dll)
- `js/shared-data.js` — muat senarai guru & kelas (dikongsi Ruang Guru & Penyelaras)
- `js/page-jadual.js`, `js/page-ruang-guru.js`, `js/page-penyelaras.js`, `js/page-admin.js` — logik khusus setiap halaman
- `js/auth.js`, `js/db.js`, `js/board-engine.js`, `js/xml-import.js`, `js/pdf-export.js`, `js/firebase-init.js`, `js/firebase-config.js` — tidak berubah

## 1. Setup Firebase (sekali sahaja)

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
2. **Firestore Database** → Create database → mod **Production** → lokasi `asia-southeast1` (Singapore) disyorkan
3. **Authentication** → Get started → tab *Sign-in method* → aktifkan **Google**
4. **Authentication → Settings → Authorized domains** → tambah `relief.syazr.com`
5. Halaman utama projek → ikon **`</>`** (Web) → daftar app → **jangan** tick Firebase Hosting → salin objek `firebaseConfig`
6. Tampal objek tu ke dalam **`js/firebase-config.js`** (gantikan nilai placeholder)
7. (Pilihan) Dalam fail sama, isi `BOOTSTRAP_ADMIN_EMAILS` dengan emel anda supaya first-login terus jadi Admin — jika tidak, tetapkan role admin secara manual di Firebase Console → Firestore → koleksi `users` selepas anda log masuk kali pertama (tukar field `role` kepada `"admin"`)

## 2. Deploy Firestore Security Rules

Guna [Firebase CLI](https://firebase.google.com/docs/cli):
```
firebase login
firebase init firestore   # pilih projek anda, guna firestore.rules yang sedia ada
firebase deploy --only firestore:rules
```
Atau salin-tampal kandungan `firestore.rules` terus ke Firebase Console → Firestore Database → Rules → Publish.

## 3. Deploy ke GitHub Pages

1. Cipta repo baru `relief-main` di GitHub, push kandungan folder ini
2. Repo → Settings → Pages → pastikan deploy dari branch `main`
3. DNS: tambah rekod CNAME `relief.syazr.com` → `<username>.github.io`
4. Fail `CNAME` dalam repo ini sudah diisi `relief.syazr.com`

## 4. Redirect domain lama

Dalam repo `gg-main` dan `ggview-main` (lama), gantikan kandungan `index.html` dengan `redirect-stub-index.html` yang disertakan (satu peringkat di atas folder ni). Domain `gg.syazr.com` & `ggview.syazr.com` akan terus berfungsi tetapi auto bawa pengguna ke `relief.syazr.com`.

## 5. Migrasi data sedia ada

1. Buka Google Sheet lama → untuk setiap sheet (Teachers, MasterTimetable, DailyBoard, ReliefAssignments): **File → Download → Comma Separated Values (.csv)**
2. Deploy dahulu app ni (langkah 3), log masuk sebagai admin
3. Buka `https://relief.syazr.com/migrate.html`
4. Muat naik setiap CSV ikut turutan dalam halaman tu (Teachers & MasterTimetable dahulu)
5. Semak dalam Firestore Console data dah masuk betul, kemudian **padam/lindungi `migrate.html`** (atau biarkan — ia sudah dikunci di sebalik role admin + Firestore Rules, tapi lebih selamat dibuang selepas migrasi selesai)

## Struktur Firestore

```
teachers/{id}              — id, name, short, contact, email
masterTimetable/{id}       — day, period, start, end, classId, className, subId, subject, teacherId, teacherName
dailyBoard/{date}          — absentIds[], assignments{}, absentReasons{}, status
reliefRecords/{autoId}     — arkib (date, day, period, time, className, subject, absentTeacher, reliefTeacher, note, reason)
settings/logo              — base64
users/{uid}                — email, name, photoURL, role('pending'|'admin'), teacherId, createdAt
```

## Akses

| Status | Tab |
|---|---|
| Tak login | Jadual Induk sahaja |
| Login (mana-mana akaun Google) | + Jadual Saya, Jadual Kelas |
| Login + role = admin | + Papan, Sejarah, Admin |

Naikkan taraf pengguna ke Admin melalui tab **Admin → Pengurusan Pengguna** (perlu sekurang-kurangnya 1 admin sedia ada — guna `BOOTSTRAP_ADMIN_EMAILS` untuk admin pertama).

## Fail penting

- `js/firebase-config.js` — **SATU-SATUNYA** fail yang wajib diedit untuk setup
- `firestore.rules` — deploy ke Firebase Console
- `migrate.html` — alat migrasi sekali guna (boleh dibuang selepas migrasi)

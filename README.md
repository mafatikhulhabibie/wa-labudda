# WhatsApp Gateway — multi-session (Baileys + Express)

Gateway **multi-device** dengan **login pengguna**, peran **admin / member**, device tersimpan di **MySQL**, dashboard web, dan API HTTP. Setiap device memakai `session_id` unik; auth Baileys di `sessions/<session_id>/`, QR di `qr/<session_id>.png`, antrean kirim per sesi, jeda kirim acak, retry, rate limit, dan webhook masuk opsional.

## Prerequisites

- Node.js **18+**
- **MySQL 8+** (database kosong; skema dibuat otomatis jika `DB_AUTO_MIGRATE=true`)
- `npm`

## Setup

```bash
cp .env.example .env
```

Isi variabel **MySQL**, **JWT_SECRET**, dan untuk bootstrap admin pertama: **INITIAL_ADMIN_EMAIL** + **INITIAL_ADMIN_PASSWORD** (hanya dipakai saat tabel `users` masih kosong).

```bash
npm install
npm run build:css
node app.js
```

**Tailwind CSS:** satu stylesheet `public/styles.css` di-build dari `src/tailwind.css` (mencakup dashboard, login, dan halaman chat). Setelah mengubah kelas utilitas di `public/*.html` atau `public/*.js`, jalankan lagi `npm run build:css` (atau `npm run watch:css` saat mengutak-atik UI).

Buka **http://127.0.0.1:3000/login.html** → masuk → kelola device dari dashboard.

**Chat bergaya WhatsApp Web** (teks, daftar chat, realtime): **http://127.0.0.1:3000/wa.html** — pastikan device sudah *connected*, lalu pilih device di dropdown.

## Autentikasi API

- Cookie sesi (setelah login di dashboard), atau
- `Authorization: Bearer <jwt>`, atau
- `x-api-key: <user api key>` (hash SHA-256 di database; kunci plain ditampilkan sekali saat admin membuat user dengan opsi generate, atau setelah **POST /api/admin/users/:id/api-key**).

Tanpa kredensial valid → **401**.

**Member** boleh: menambah/menghapus device sendiri, menghubungkan runtime, scan QR, kirim pesan, membaca **GET /api/docs**.

**Admin** tambahan: manajemen pengguna, semua device, broadcast, rotasi API key pengguna.

Referensi lengkap: [`docs/API.md`](docs/API.md).

## Ringkasan endpoint

| Aksi | Method | Path |
|------|--------|------|
| Login | POST | `/api/auth/login` |
| Logout | POST | `/api/auth/logout` |
| Profil | GET | `/api/auth/me` |
| Dokumentasi Markdown | GET | `/api/docs` |
| Daftar / tambah device | GET, POST | `/api/devices` |
| Sambungkan runtime | POST | `/api/devices/:session_id/connect` |
| Hentikan runtime (tanpa hapus device) | POST | `/api/devices/:session_id/disconnect` |
| Hapus device | DELETE | `/api/devices/:session_id` |
| QR / status | GET | `/api/session/qr/:session_id`, `/api/session/status/:session_id` |
| Kirim pesan | POST | `/api/send` |
| Grup kontak | GET, POST, PATCH, DELETE | `/api/contact-groups`, `/api/contact-groups/:id` |
| Kontak | GET, POST, PATCH, DELETE | `/api/contacts`, `/api/contacts/:id` |
| Broadcast | POST | `/api/broadcast` (admin) |
| Admin users / devices | GET, POST, DELETE | `/api/admin/...` |

## PM2

```bash
npm i -g pm2
pm2 start ecosystem.config.cjs
pm2 logs wa-gateway
```

Satu proses Node per mesin untuk peta sesi in-memory. Pastikan MySQL dapat dijangkau dari host tersebut.

## Project layout

- `app.js` — HTTP server, cookie, migrasi DB, shutdown
- `routes/` — API terautentikasi
- `controllers/` — validasi + mapping HTTP
- `repositories/` — akses MySQL
- `middlewares/auth.js` — JWT + cookie + API key per user
- `services/whatsappManager.js` — socket Baileys
- `db/schema.sql` — skema users & devices
- `docs/API.md` — referensi API untuk integrasi
- `public/` — dashboard + login

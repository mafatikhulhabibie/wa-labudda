# WA Gateway — HTTP API

Semua endpoint di bawah `/api` (kecuali disebut lain) memakai 2 lapis keamanan:

1. **Autentikasi** (identitas caller),
2. **Otorisasi** (validasi hak akses role/scope resource).

Autentikasi dapat memakai:

- **Cookie sesi** `wg_session` (setelah login lewat dashboard), atau
- **Header** `Authorization: Bearer <jwt>`, atau
- **Header** `x-api-key: <device api key>` (kunci per-device; scope ke satu `session_id`).

Tanpa kredensial valid → **401** `{ "error": "Unauthorized" }`.
Jika role/scope tidak memenuhi → **403** `{ "error": "Forbidden" }`.

---

## Auth

### `POST /api/auth/login`

Body JSON:

```json
{ "email": "admin@example.com", "password": "…" }
```

Respons: set-cookie sesi + `{ "success": true, "user": { "id", "email", "role", "api_key_configured", "api_key_prefix" } }`.

### `POST /api/auth/logout`

Menghapus cookie sesi.

### `GET /api/auth/me`

Profil pengguna saat ini.

### `PATCH /api/auth/profile`

Update email akun login saat ini.

```json
{ "full_name": "Nama Baru", "email": "baru@example.com" }
```

### `PATCH /api/auth/password`

Ganti password akun login saat ini.

```json
{
  "current_password": "password_lama",
  "new_password": "password_baru_min_6_karakter"
}
```

---

## Dokumentasi (semua role)

### `GET /api/docs`

Isi Markdown referensi API (file ini).

---

## Device (member & admin)

### `GET /api/devices`

Daftar device milik pengguna. **Admin** boleh `?scope=all` untuk semua device + pemilik.

Jika autentikasi menggunakan `x-api-key` device, respons hanya berisi device milik API key tersebut.

### `POST /api/devices`

Mendaftarkan device baru dan memulai runtime WhatsApp.

```json
{ "session_id": "sales-01", "label": "Tim sales" }
```

`session_id`: 1–64 karakter, awal alfanumerik, `[a-zA-Z0-9_-]`.

### `POST /api/devices/:session_id/connect`

Menyalakan ulang socket Baileys untuk device yang sudah ada di database (misalnya setelah restart server).

### `POST /api/devices/:session_id/api-key`

Generate/rotate API key untuk device tersebut (plaintext ditampilkan sekali).

### `POST /api/devices/:session_id/disconnect`

Menghentikan runtime Baileys di memori; data auth di disk dan baris device **tidak** dihapus (bisa `connect` lagi).

### `DELETE /api/devices/:session_id`

Menghentikan sesi, menghapus file auth & QR di disk, dan menghapus baris device di MySQL.

---

## WhatsApp runtime (per device terdaftar)

### `GET /api/session/qr/:session_id`

PNG QR (default) atau `?mode=base64` untuk JSON base64.

### `GET /api/session/status/:session_id`

`{ "session_id", "status" }` — `connecting` | `connected` | `disconnected` (jika runtime tidak aktif).

### `DELETE /api/session/:session_id`

Alias perilaku sama dengan `DELETE /api/devices/:session_id`.

---

## Webhook per device

Webhook dapat diset berbeda untuk setiap `session_id` device.

### `GET /api/webhooks/:session_id`

Ambil konfigurasi webhook untuk satu device.

Contoh URL:

`http://localhost:3000/api/webhooks/sales-01`

### `PUT /api/webhooks/:session_id`

Buat/update webhook device.

```json
{
  "url": "https://example.com/hooks/wa/sales-01",
  "enabled": true
}
```

### `DELETE /api/webhooks/:session_id`

Hapus webhook untuk device.

### `POST /api/webhooks/:session_id/test`

Kirim test payload ke URL webhook aktif.

### Event payload format

Setiap event dikirim via `POST` JSON ke URL webhook.

**Bawaan (tanpa env):** format **fonnte** — satu objek berisi `event`, `session_id`, `sent_at`, `data` (detail wa-server), dan field root yang bisa langsung dibaca ala Fonnte / PHP (`device`, `sender`, `message`, `member`, `name`, `location`, `url`, `filename`, `extension`; yang kosong berupa string `""`).

```json
{
  "event": "message.incoming",
  "session_id": "sales-01",
  "sent_at": "2026-04-19T10:20:30.000Z",
  "data": {},
  "device": "sales-01",
  "sender": "6281234567890@s.whatsapp.net",
  "message": "hai",
  "member": "",
  "name": "Nama Pengirim",
  "location": "",
  "url": "",
  "filename": "",
  "extension": ""
}
```

**Hanya** jika env `WEBHOOK_PAYLOAD_MODE=default`, body dibatasi ke bentuk nested berikut (tanpa field root `device` / `sender` / dll.):

```json
{
  "event": "message.outgoing",
  "session_id": "sales-01",
  "sent_at": "2026-04-19T10:20:30.000Z",
  "data": {}
}
```

Keterangan field Fonnte-like:

- `device`: `session_id` device pengirim/penerima event
- `sender`: JID chat pengirim (incoming) atau nomor tujuan (outgoing)
- `name`: nama kontak dari WhatsApp (jika tersedia)
- `message`: isi pesan teks/caption
- `url`: URL media dari event incoming (jika tersedia dari payload WhatsApp)
- `filename`: nama file lampiran dokumen
- `extension`: ekstensi file (atau turunan dari MIME type)

Opsional, untuk format lebih mirip provider eksternal:

- `WEBHOOK_NORMALIZE_SENDER_DIGITS=true` → field `sender` dan `member` akan dinormalisasi jadi digit-only (mis. `628123...`) tanpa suffix `@s.whatsapp.net`.

### Balasan otomatis dari body response (opsional)

Jika di env gateway **`WEBHOOK_REPLY_FROM_BODY=true`**, setelah `POST` ke URL webhook device berhasil (HTTP **2xx**), gateway membaca body response sebagai JSON dan mencari **string** tidak kosong pada salah satu field: **`reply`**, **`reply_text`**, atau **`message`**. Teks itu dikirim ke **chat yang sama** (JID dari pesan masuk). Dengan mode ini skrip penerima **tidak perlu** memanggil `POST /api/send` (berguna jika otorisasi API atau jaringan mempersulit callback ke gateway).

- Jika balasan dari webhook **berhasil** dikirim, autoresponder dashboard untuk batch pesan itu **tidak** dijalankan.
- Opsi: **`WEBHOOK_REPLY_MAX_LEN`** (default 4000) membatasi panjang teks.
- Contoh skrip penerima: `docs/webhook_reply_body_example.php` atau server uji `scripts/webhook-reply-echo.mjs`.

Event yang tersedia:

- `message.outgoing` — ketika API/dashboard mengirim pesan
- `message.incoming` — ketika ada pesan masuk (ringkas dari `messages.upsert`)

Pada `message.incoming`, field `data.primary` berisi pesan masuk pertama yang **bukan** `fromMe` (JID chat, teks, `participant` untuk grup). Ini lebih stabil untuk integrasi webhook daripada mengandalkan `data.messages[0]` saja.
- `message.autoreply.sent` — ketika autoresponder mengirim balasan otomatis
- `webhook.test` — event uji koneksi

Contoh URL endpoint penerima (bebas milik Anda):

- `https://example.com/webhook/wa`
- `https://n8n.domain.tld/webhook/wa-gateway`
- `https://hooks.zapier.com/hooks/catch/...`

---

## Kirim pesan

### `POST /api/send`

**Teks (JSON)** — `Content-Type: application/json`

```json
{
  "session_id": "sales-01",
  "number": "6281234567890",
  "message": "Halo"
}
```

Endpoint kirim pesan sekarang **wajib user-level auth**:

- boleh: cookie sesi user / Bearer JWT user / user API key,
- tidak boleh: `x-api-key` device.

Jika memakai `x-api-key` device pada endpoint ini, respons **403**.

**Gambar atau dokumen (multipart)** — `Content-Type: multipart/form-data`

| Field | Wajib | Keterangan |
|--------|--------|------------|
| `session_id` | ya | ID sesi device |
| `number` | ya | Nomor tujuan (digit, tanpa `+`) |
| `file` | ya | Satu berkas (maks. 25 MB) |
| `message` | tidak | Caption / teks pendamping |
| `media_type` | tidak | `image` atau `document`. Jika dihilangkan: otomatis `image` jika MIME `image/*`, selain itu `document`. |

Untuk `media_type: image`, MIME harus `image/*` (mis. JPEG, PNG, GIF, WebP).

Device harus milik pengguna (atau admin mengakses device apa pun).

Respons sukses:

```json
{
  "success": true,
  "status": true,
  "message": "queued",
  "detail": {
    "session_id": "sales-01",
    "number": "6281234567890",
    "has_media": false,
    "message": "Halo",
    "message_id": "3EB0..."
  }
}
```

### `POST /api/send-bulk`

Kirim teks ke banyak nomor dalam 1 request (diproses berurutan).

```json
{
  "session_id": "sales-01",
  "numbers": ["6281234567890", "628998887776"],
  "message": "Halo dari gateway"
}
```

Respons sukses:

```json
{
  "success": true,
  "status": true,
  "message": "queued",
  "detail": {
    "session_id": "sales-01",
    "total": 2,
    "success": 1,
    "failed": 1,
    "results": [
      {
        "number": "6281234567890",
        "status": true,
        "message": "queued",
        "message_id": "3EB0..."
      },
      {
        "number": "628998887776",
        "status": false,
        "message": "Invalid phone number",
        "code": 400
      }
    ]
  }
}
```

---

## Auto-responder (per device)

Fitur ini membalas pesan masuk otomatis berdasarkan rule keyword per `session_id`.

### `GET /api/autoresponder/:session_id`

Ambil status autoresponder device + daftar rules.

### `PUT /api/autoresponder/:session_id`

Body:

```json
{
  "enabled": true,
  "default_reply_text": "Maaf, pesan Anda belum cocok keyword mana pun."
}
```

Menyalakan/mematikan autoresponder pada device tersebut.
`default_reply_text` bersifat opsional, dipakai jika tidak ada rule yang match.

### `POST /api/autoresponder/:session_id/rules`

Body:

```json
{
  "match_type": "contains",
  "keyword": "harga",
  "reply_text": "Halo, untuk info harga silakan kirim format: PRODUK <nama>",
  "case_sensitive": false,
  "priority": 100,
  "enabled": true
}
```

`match_type`: `exact` | `contains` | `starts_with` | `regex`.

Anda juga bisa isi `keyword` dengan banyak baris (1 baris = 1 keyword).
Server akan otomatis membuat banyak rule dengan `reply_text` yang sama.

### `PATCH /api/autoresponder/:session_id/rules/:id`

Body sama seperti create rule.

### `DELETE /api/autoresponder/:session_id/rules/:id`

Hapus satu rule autoresponder.

Catatan perilaku default:

- hanya memproses pesan **masuk** (`from_me=false`)
- melewati chat grup (`@g.us`)
- ada cooldown balasan per chat untuk mencegah spam/loop

---

## Grup kontak (per pengguna)

### `GET /api/contact-groups`

### `POST /api/contact-groups`

```json
{ "name": "Pelanggan VIP" }
```

### `PATCH /api/contact-groups/:id`

```json
{ "name": "Nama baru" }
```

### `DELETE /api/contact-groups/:id`

Menghapus grup; `group_id` pada kontak di grup tersebut menjadi `NULL`.

---

## Kontak (per pengguna, opsional `group_id`)

### `GET /api/contacts`

Query opsional: `?group_id=<id>` untuk filter ke satu grup.

### `POST /api/contacts`

```json
{
  "display_name": "Budi",
  "phone": "6281234567890",
  "group_id": 1
}
```

`group_id` boleh dihilangkan / `null` = tanpa grup. Nomor disimpan sebagai digit (tanpa `+`). Kombinasi `(user_id, phone)` unik.

### `PATCH /api/contacts/:id`

### `DELETE /api/contacts/:id`

---

## Admin saja

### `GET /api/admin/users`

Respons `{ "users": [ … ] }`. Setiap elemen menyertakan `device_count`, `last_login_at` (null jika belum pernah login lewat cookie/JWT), `messages_sent_today`, `messages_sent_7d` (jumlah baris log pengiriman tercatat untuk pemilik device tersebut).

### `POST /api/admin/users`

```json
{
  "full_name": "Nama Pengguna",
  "email": "member@example.com",
  "password": "…",
  "role": "member",
  "generate_api_key": true
}
```

Jika `generate_api_key: true`, respons menyertakan `api_key` **sekali** (simpan dengan aman).

### `DELETE /api/admin/users/:id`

Tidak boleh menghapus diri sendiri; tidak boleh menghapus admin terakhir.

### `POST /api/admin/users/:id/api-key`

Memutar API key pengguna; respons `{ "api_key": "wg_…" }` sekali.

### `GET /api/admin/devices`

Semua device dengan `owner_email` dan status runtime.

### `POST /api/broadcast`

```json
{
  "session_ids": ["a", "b"],
  "number": "628…",
  "message": "…"
}
```

Setiap `session_id` harus terdaftar di database.

Broadcast diproteksi guard anti-spam per device:

- menit: `BROADCAST_MAX_PER_MINUTE_PER_DEVICE`
- jam: `BROADCAST_MAX_PER_HOUR_PER_DEVICE`
- hari: `BROADCAST_MAX_PER_DAY_PER_DEVICE`

Jika melampaui batas, respons `429` + detail `checks`.

### `GET /api/broadcast/guard?session_ids=a,b,c`

Cek proyeksi batas aman broadcast per device untuk dashboard warning.

### `GET /api/broadcast/schedules`

Daftar jadwal broadcast milik user login (maks. 100 terbaru).

### `POST /api/broadcast/schedules`

```json
{
  "session_ids": ["device-a", "device-b"],
  "number": "6281234567890",
  "message": "Halo, ini pesan terjadwal",
  "scheduled_at": "2026-04-20T03:00:00.000Z"
}
```

`scheduled_at` harus waktu masa depan (minimal +30 detik).

### `DELETE /api/broadcast/schedules/:id`

Membatalkan jadwal yang masih `pending`/`processing`.

---

## WebSocket inbox (chat UI)

### `GET /ws/inbox` (upgrade ke WebSocket)

Autentikasi lewat **cookie sesi** yang sama seperti dashboard.

Setelah terhubung, kirim JSON:

```json
{ "type": "subscribe", "session_ids": ["session-id-anda"] }
```

Hanya device yang ada di database dan milik pengguna (admin boleh device apa pun) yang boleh di-subscribe.

Server mengirim event pesan ringkas, misalnya:

```json
{
  "type": "message",
  "session_id": "demo",
  "chat_jid": "628...@s.whatsapp.net",
  "message_id": "…",
  "from_me": false,
  "participant_jid": null,
  "text": "Halo",
  "ts": 1710000000
}
```

Halaman contoh UI: **`/wa.html`**.

---

## Health (tanpa auth)

### `GET /health`

`{ "ok": true }`

# Backend VPS Deploy Guide for LLM / OpenCode

Dokumen ini dibuat agar LLM yang berjalan langsung di VPS (mis. OpenCode) bisa membantu deploy backend project ini dengan aman dan konsisten.

## Scope
Guide ini hanya untuk **backend** di VPS.
Arsitektur yang diasumsikan:
- Frontend: Vercel
- Backend API: VPS
- Database/Auth: Supabase

Backend saat ini adalah:
- Node.js runtime
- Hono server via `@hono/node-server`
- entrypoint: `backend/server.ts`
- port internal default: `3001`

---

## 1. What the backend needs

Backend ini membutuhkan environment variable berikut:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
ENCRYPTION_KEY=your-32-char-encryption-key-here
```

Catatan:
- `SUPABASE_SERVICE_ROLE_KEY` hanya untuk server, jangan pernah expose ke frontend.
- `ENCRYPTION_KEY` wajib ada, minimal aman untuk production.
- Bila memakai AI provider di backend, tambahkan env sesuai provider yang kamu pakai.

---

## 2. Recommended VPS baseline

Minimum yang masih layak untuk project ini:
- 2 vCPU
- 2 GB RAM
- Ubuntu 22.04/24.04

Recommended software:
- Node.js 20+
- npm
- PM2
- Nginx
- Certbot

---

## 3. Expected repo layout

LLM harus mengasumsikan struktur ini:

- `package.json`
- `backend/server.ts`
- `backend/index.ts`
- `backend/.env.example`
- `supabase/migrations/*.sql`

Script yang relevan dari project:

```bash
npm install
npm run backend
npm run lint
```

Catatan penting:
- `npm run backend` menjalankan `tsx watch backend/server.ts`, cocok untuk dev, bukan ideal untuk production.
- Untuk production di VPS, lebih baik jalankan via PM2 dengan `tsx` atau compile strategy yang konsisten.

---

## 4. Recommended production strategy

Gunakan strategi ini di VPS:

1. clone/pull repo
2. install dependency
3. buat file env production lokal di server
4. jalankan backend dengan PM2
5. expose via Nginx reverse proxy
6. aktifkan HTTPS dengan Let's Encrypt

Backend listen di:
- `http://127.0.0.1:3001`

Public API domain yang direkomendasikan:
- `https://api.yourdomain.com`

---

## 5. Production env file

Buat file:

```bash
backend/.env
```

Isi minimal:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-me
ENCRYPTION_KEY=replace-me-with-a-long-random-secret
```

Jika frontend di Vercel, maka Vercel harus mengarah ke URL backend ini, misalnya:

```env
VITE_BACKEND_URL=https://api.yourdomain.com
```

---

## 6. PM2 recommendation

Karena backend ditulis dalam TypeScript dan entrypoint production sekarang adalah `backend/server.ts`, jalankan dengan salah satu pendekatan berikut.

### Option A — Simple and fast
Gunakan `tsx` langsung di production:

```bash
pm2 start "npx tsx backend/server.ts" --name memescout-backend
```

### Option B — Better long-term
Tambahkan build backend terpisah lalu jalankan JS hasil build.

Saat ini project belum punya script build backend khusus, jadi jika LLM diminta deploy cepat, gunakan **Option A** dulu.

Setelah start:

```bash
pm2 save
pm2 status
pm2 logs memescout-backend
```

Health check:

```bash
curl http://127.0.0.1:3001/health
```

Expected response:

```json
{"ok":true,"ts":1234567890}
```

---

## 7. Nginx reverse proxy example

Contoh config Nginx:

```nginx
server {
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Setelah itu aktifkan HTTPS:

```bash
sudo certbot --nginx -d api.yourdomain.com
```

---

## 8. CORS note

Backend saat ini memakai:

```ts
app.use("*", cors());
```

Artinya CORS masih permissive.
Untuk production yang lebih aman, LLM boleh menyarankan hardening agar hanya domain frontend Vercel yang diizinkan.

Contoh target allowlist:
- `https://your-frontend.vercel.app`
- `https://yourdomain.com`

Namun bila task user hanya deploy cepat, jangan ubah dulu kecuali diminta.

---

## 9. Supabase migration requirement

Sebelum semua fitur backend aktif penuh, migration Supabase harus sudah diaplikasikan.

Minimal file migration yang perlu ada:
- `supabase/migrations/001_initial.sql`
- `supabase/migrations/002_signal_tracking.sql`
- `supabase/migrations/003_signal_events.sql`

Jika LLM diminta menyelesaikan deploy end-to-end, LLM harus memastikan migration ini sudah dijalankan di project Supabase yang benar.

---

## 10. Post-deploy checks

Setelah backend online, LLM harus mengecek endpoint berikut:

```bash
curl https://api.yourdomain.com/health
curl https://api.yourdomain.com/api/scanner/boosted
curl "https://api.yourdomain.com/api/signals/ranked?limit=5"
curl https://api.yourdomain.com/api/signals/performance
curl "https://api.yourdomain.com/api/signals/events?limit=5"
```

Yang harus diverifikasi:
- response 200
- JSON valid
- tidak ada crash di PM2 logs
- backend bisa akses DexScreener / GeckoTerminal / RugCheck
- env Supabase valid

---

## 11. Common failure modes

### Missing env
Gejala:
- backend langsung crash saat start

Penyebab:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, atau `ENCRYPTION_KEY` belum diset

### Port unreachable
Gejala:
- `curl 127.0.0.1:3001/health` gagal

Penyebab:
- PM2 process belum jalan
- Nginx salah proxy
- firewall belum dibuka untuk 80/443

### External API timeout
Gejala:
- endpoint scanner atau signals lambat / 500

Penyebab:
- koneksi VPS ke API upstream lambat
- upstream rate limit / temporary issue

### Supabase features inactive
Gejala:
- performance/events kosong terus

Penyebab:
- migration belum dijalankan
- service role key salah

---

## 12. One-liner deploy from VPS

### First deploy

Setelah file ini ada di GitHub `main`, kamu bisa jalankan dari VPS dengan pola berikut:

```bash
curl -fsSL https://raw.githubusercontent.com/edodoyokz/solana/main/scripts/deploy-backend-vps.sh -o /tmp/deploy-backend-vps.sh && sudo bash /tmp/deploy-backend-vps.sh
```

Jika ingin langsung sekalian generate config Nginx untuk domain API:

```bash
curl -fsSL https://raw.githubusercontent.com/edodoyokz/solana/main/scripts/deploy-backend-vps.sh -o /tmp/deploy-backend-vps.sh && sudo PUBLIC_API_DOMAIN=api.yourdomain.com bash /tmp/deploy-backend-vps.sh
```

Jika ingin sekalian bootstrap HTTPS otomatis:

```bash
curl -fsSL https://raw.githubusercontent.com/edodoyokz/solana/main/scripts/deploy-backend-vps.sh -o /tmp/deploy-backend-vps.sh && sudo PUBLIC_API_DOMAIN=api.yourdomain.com ENABLE_SSL=1 EMAIL_SSL=you@example.com bash /tmp/deploy-backend-vps.sh
```

Perilaku script:
- install package dasar (`git`, `nginx`, `nodejs`, `pm2`) bila belum ada
- install `certbot` bila `ENABLE_SSL=1`
- clone/pull repo dari branch `main`
- install dependency
- buat `backend/.env` dari template jika belum ada
- berhenti kalau env masih placeholder
- jalankan atau restart backend via PM2
- cek health endpoint
- optional: tulis config Nginx bila `PUBLIC_API_DOMAIN` diisi
- optional: pasang HTTPS bila `ENABLE_SSL=1`

Catatan penting:
- script ini aman untuk **rerun / redeploy**
- kamu tetap harus edit `backend/.env` di VPS dengan secret asli jika file itu baru dibuat
- jika code tidak berubah, script tetap bisa dipakai untuk memastikan proses/backend tetap sehat

### Quick update / redeploy only

Setelah deploy pertama selesai, gunakan script update-only ini untuk deploy berikutnya:

```bash
curl -fsSL https://raw.githubusercontent.com/edodoyokz/solana/main/scripts/redeploy-backend-vps.sh -o /tmp/redeploy-backend-vps.sh && sudo bash /tmp/redeploy-backend-vps.sh
```

Perilaku script update-only:
- fetch + pull branch `main`
- `npm install`
- reload/restart PM2
- health check backend

### PM2 ecosystem file

Repo ini juga sekarang punya file:

```bash
ecosystem.config.cjs
```

Tujuannya agar process backend di PM2 lebih konsisten.
Script deploy utama akan otomatis memakainya jika file ada.

## 13. Exact prompt for OpenCode on VPS

Gunakan prompt ini di OpenCode pada VPS:

```text
You are deploying the backend of this project to this VPS.

Goal:
- run the backend in production on this server
- keep frontend separate (frontend is deployed on Vercel)
- use PM2 + Nginx
- do not expose any server secrets to frontend files

Requirements:
- inspect package.json and backend/server.ts first
- install dependencies if needed
- create or update backend/.env using server-side secrets only
- start backend on port 3001 with PM2
- configure Nginx reverse proxy for the chosen API domain
- verify /health and key /api endpoints
- if something fails, debug and fix it
- do not modify README.md unless explicitly required
- do not commit or push git changes unless explicitly required

Important backend facts:
- backend entrypoint is backend/server.ts
- required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_KEY
- health endpoint: /health
- recommended public domain shape: api.yourdomain.com
```

---

## 14. Safer deployment workflow for LLM

Urutan kerja yang sebaiknya diikuti LLM di VPS:

1. verify Node/npm version
2. verify repo path
3. inspect `package.json` and `backend/server.ts`
4. create `backend/.env`
5. run `npm install`
6. run local test with backend start
7. validate `http://127.0.0.1:3001/health`
8. start with PM2
9. configure Nginx
10. enable SSL
11. test public endpoints
12. inspect logs and stabilize

---

## 15. Deployment decision summary

Untuk project ini, backend di VPS adalah pilihan yang baik karena:
- menyimpan service-role key di server
- lebih fleksibel untuk endpoint signal yang agak berat
- lebih mudah untuk PM2, cron, dan troubleshooting dibanding full serverless

Jika frontend tetap di Vercel, setup yang direkomendasikan adalah:
- frontend -> Vercel
- backend -> VPS
- Supabase -> managed

Itu adalah target deployment yang harus diasumsikan oleh LLM.

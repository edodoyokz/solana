# MemeScout Solana Scanner

MemeScout adalah platform discovery dan analysis untuk memecoin Solana dengan fokus pada:
- live opportunity scanning
- risk filtering
- signal ranking
- LLM final reasoning
- signal tracking, performance, dan event timeline

Project ini memakai data live dari beberapa source seperti DexScreener, GeckoTerminal, RugCheck, Solana RPC, dan Supabase.

## Arsitektur

Rekomendasi deployment untuk project ini:
- **Frontend**: Vercel
- **Backend API**: VPS
- **Database/Auth**: Supabase

Kenapa model ini direkomendasikan:
- frontend dapat CDN dan deploy cepat dari Vercel
- backend lebih aman untuk menyimpan `SUPABASE_SERVICE_ROLE_KEY`
- endpoint signal/ranking lebih cocok dijalankan di proses Node yang stabil
- PM2, Nginx, health check, dan troubleshooting lebih mudah di VPS

## Tech Stack

- Vite
- React
- TypeScript
- Hono
- Supabase
- TanStack Query
- Tailwind CSS
- PM2 + Nginx untuk deploy backend VPS

## Fitur Utama

- ranked memecoin opportunities
- scanner dengan live sources
- RugCheck / risk review
- social monitor
- wallet/risk tracker
- LLM final recommendation
- signal performance tracking
- signal event timeline
- confidence v2 berbasis evidence, agreement, stability, dan historical edge

## Struktur Penting

- `src/` — frontend app
- `backend/` — backend API Hono
- `supabase/migrations/` — SQL migrations
- `scripts/deploy-backend-vps.sh` — first deploy backend ke VPS
- `scripts/redeploy-backend-vps.sh` — quick update/redeploy backend
- `README_DEPLOY_BACKEND_VPS.md` — panduan detail deploy backend untuk OpenCode/LLM di VPS

## Development

Install dependency:

```bash
npm install
```

Jalankan frontend + backend saat development:

```bash
./dev.sh
```

Atau jalankan terpisah:

```bash
npm run backend
npm run dev
```

Lint + typecheck:

```bash
npm run lint
```

Build frontend:

```bash
npm run build
```

## Environment

### Frontend (`.env.local`)
Minimal:

```env
VITE_BACKEND_URL=http://localhost:3001
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Backend (`backend/.env`)
Minimal:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ENCRYPTION_KEY=your-long-random-secret
```

Catatan penting:
- `SUPABASE_SERVICE_ROLE_KEY` hanya untuk backend/server
- jangan pernah expose secret backend ke frontend
- frontend production sebaiknya diarahkan ke domain API public, misalnya `https://api.yourdomain.com`

## Supabase Migrations

Sebelum fitur tracking dan timeline aktif penuh, jalankan migration berikut di Supabase:

- `supabase/migrations/001_initial.sql`
- `supabase/migrations/002_signal_tracking.sql`
- `supabase/migrations/003_signal_events.sql`

## Deploy Rekomendasi

### Frontend ke Vercel
Set env frontend di Vercel:

```env
VITE_BACKEND_URL=https://api.yourdomain.com
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Backend ke VPS
Project ini sudah punya toolkit deploy backend yang bisa langsung dipanggil dari VPS.

#### First deploy

```bash
curl -fsSL https://raw.githubusercontent.com/edodoyokz/solana/main/scripts/deploy-backend-vps.sh -o /tmp/deploy-backend-vps.sh && sudo bash /tmp/deploy-backend-vps.sh
```

#### First deploy + Nginx domain API

```bash
curl -fsSL https://raw.githubusercontent.com/edodoyokz/solana/main/scripts/deploy-backend-vps.sh -o /tmp/deploy-backend-vps.sh && sudo PUBLIC_API_DOMAIN=api.yourdomain.com bash /tmp/deploy-backend-vps.sh
```

#### First deploy + Nginx + HTTPS

```bash
curl -fsSL https://raw.githubusercontent.com/edodoyokz/solana/main/scripts/deploy-backend-vps.sh -o /tmp/deploy-backend-vps.sh && sudo PUBLIC_API_DOMAIN=api.yourdomain.com ENABLE_SSL=1 EMAIL_SSL=you@example.com bash /tmp/deploy-backend-vps.sh
```

#### Quick redeploy / update only

```bash
curl -fsSL https://raw.githubusercontent.com/edodoyokz/solana/main/scripts/redeploy-backend-vps.sh -o /tmp/redeploy-backend-vps.sh && sudo bash /tmp/redeploy-backend-vps.sh
```

## Deploy Toolkit yang Sudah Disediakan

- `scripts/deploy-backend-vps.sh`
  - install package dasar
  - clone/pull repo
  - install dependency
  - siapkan `backend/.env`
  - start/reload backend via PM2
  - health check
  - optional Nginx
  - optional HTTPS

- `scripts/redeploy-backend-vps.sh`
  - pull branch `main`
  - `npm install`
  - reload PM2
  - health check

- `ecosystem.config.cjs`
  - konfigurasi PM2 untuk backend production

## Health Check

Backend health endpoint:

```bash
/health
```

Contoh cek:

```bash
curl http://127.0.0.1:3001/health
curl https://api.yourdomain.com/health
```

## API Checks Setelah Deploy

Contoh endpoint penting untuk diverifikasi:

```bash
curl https://api.yourdomain.com/health
curl https://api.yourdomain.com/api/scanner/boosted
curl "https://api.yourdomain.com/api/signals/ranked?limit=5"
curl https://api.yourdomain.com/api/signals/performance
curl "https://api.yourdomain.com/api/signals/events?limit=5"
```

## Catatan Production

- backend saat ini masih permissive untuk CORS dan bisa di-hardening nanti bila diperlukan
- fitur performance/events baru meaningful setelah snapshot dan outcome mulai terisi
- VPS 2 vCPU / 2 GB RAM cukup untuk production awal dengan trafik ringan-menengah
- untuk detail deploy backend berbasis LLM/OpenCode di VPS, lihat:

```bash
README_DEPLOY_BACKEND_VPS.md
```

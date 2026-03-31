# MIGRATION PLAN: Blink → Local Project

## Status: Planning

---

## 1. Project Overview

**Nama**: MemeScout — Solana Meme Coin Early Detector  
**Stack**: Vite + React + TypeScript + Tailwind CSS + TanStack Router/Query  
**Backend**: Hono (proxy ke DexScreener, GeckoTerminal, RugCheck, Solana RPC)

---

## 2. Ketergantungan Blink yang Harus Dihapus

| # | File | Ketergantungan Blink | Solusi Lokal |
|---|------|---------------------|--------------|
| 1 | `index.html` | `<script src="https://blink.new/auto-engineer.js?projectId=...">` | Hapus script tag |
| 2 | `package.json` | `@blinkdotnew/sdk@2.4.0` | Hapus (tidak dipakai di kode) |
| 3 | `package.json` | `@blinkdotnew/ui@0.4.0` | Hapus, ganti komponen lokal |
| 4 | `src/main.tsx` | `BlinkUIProvider`, `Toaster` dari `@blinkdotnew/ui` | Ganti dengan setup theme lokal + react-hot-toast |
| 5 | `src/Shell.tsx` | `AppShell`, `AppShellSidebar`, `AppShellMain`, `MobileSidebarTrigger` | Hapus file (tidak dipakai App.tsx) |
| 6 | `src/index.css` | `@import '@blinkdotnew/ui/styles'` | Hapus import, tambah CSS vars lokal |
| 7 | `src/lib/api.ts` | `BACKEND = "https://p469vqxf.backend.blink.new"` | Ganti ke `http://localhost:3001` |
| 8 | `tailwind.config.cjs` | Content path `./node_modules/@blinkdotnew/ui/dist/index.mjs` | Hapus path Blink |
| 9 | `tailwind.config.cjs` | Comments referencing `@blinkdotnew/ui` | Update comments |
| 10 | `.env.local` | `VITE_BLINK_PROJECT_ID`, `VITE_BLINK_PUBLISHABLE_KEY` | Ganti dengan config lokal |

---

## 3. Yang TIDAK Pakai Blink (Aman, Tidak Perlu Diubah)

- `src/App.tsx` — TanStack Router murni
- `src/pages/Scanner.tsx` — React + TanStack Query murni
- `src/pages/SocialMonitor.tsx` — React + TanStack Query murni
- `src/pages/WalletTracker.tsx` — React + TanStack Query murni
- `src/pages/MultiAnalyzer.tsx` — React + TanStack Query murni
- `src/pages/Recommendation.tsx` — React + TanStack Query murni
- `src/components/layout/Sidebar.tsx` — React + Tailwind murni
- `src/components/layout/Header.tsx` — React + Tailwind murni
- `src/components/ui/RiskBadge.tsx` — React + Tailwind murni
- `src/lib/utils.ts` — clsx + tailwind-merge murni
- `src/types/index.ts` — Type definitions murni
- `backend/index.ts` — Hono murni, proxy ke external APIs

---

## 4. Langkah Implementasi

### Step 1: Clone `@blinkdotnew/ui` untuk Analisis
- Clone package `@blinkdotnew/ui@0.4.0`
- Identifikasi semua CSS variables yang didefinisikan
- Identifikasi implementasi `BlinkUIProvider`, `Toaster`, `AppShell` components
- **Goal**: Mengetahui CSS vars mana yang perlu di-recreate di `index.css`

### Step 2: Hapus Script Blink dari `index.html`
```diff
- <!-- CRITICAL: DO NOT REMOVE/MODIFY THIS COMMENT OR THE SCRIPT BELOW -->
- <script src="https://blink.new/auto-engineer.js?projectId=solana-meme-scout-p469vqxf" type="module"></script>
```

### Step 3: Update `package.json`
```diff
- "@blinkdotnew/sdk": "2.4.0",
- "@blinkdotnew/ui": "0.4.0",
```

Tambahkan (jika belum ada):
```diff
+ "react": "^19.0.0",
+ "react-dom": "^19.0.0",
```

Tambahkan devDependencies untuk backend:
```diff
+ "tsx": "^4.x",
```

### Step 4: Update `src/main.tsx`
Hapus BlinkUIProvider & Toaster, ganti dengan setup sederhana:
- Theme class management (dark mode via class toggle)
- Toast via `react-hot-toast` (sudah ada di dependencies)

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

const queryClient = new QueryClient()

// Apply dark mode class based on system preference
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.classList.add('dark')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  </React.StrictMode>,
)
```

### Step 5: Hapus `src/Shell.tsx`
File ini tidak dipakai oleh `App.tsx` (App.tsx menggunakan layout sendiri dengan Sidebar).

### Step 6: Update `src/index.css`
- Hapus `@import '@blinkdotnew/ui/styles'`
- Tambahkan CSS variables yang sebelumnya diset oleh Blink UI:
  - `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--radius-full`
  - `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl`, `--shadow-card`, `--shadow-2xs`, `--shadow-xs`, `--shadow-2xl`
  - `--font-size-xs`, `--font-size-sm`, `--font-size-base`, `--font-size-lg`, `--font-size-xl`, `--font-size-2xl`
  - `--line-height-tight`, `--line-height-normal`, `--line-height-relaxed`, `--line-height-heading`
  - `--duration-fast`, `--duration-normal`, `--duration-slow`
  - `--easing-default`, `--easing-smooth`, `--easing-bounce`
  - `--font-heading`
  - `--radius-sm` through `--radius-full`

### Step 7: Update `tailwind.config.cjs`
```diff
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
-   // Scan @blinkdotnew/ui so its Tailwind classes aren't purged
-   "./node_modules/@blinkdotnew/ui/dist/index.mjs",
  ],
```

Update comments:
```diff
- // ── Border radius — must match @blinkdotnew/ui's tailwind.config.ts ──
+ // ── Border radius ──
- // ── Box shadows — must match @blinkdotnew/ui's tailwind.config.ts ────
+ // ── Box shadows ──
```

### Step 8: Update `src/lib/api.ts`
```diff
- const BACKEND = "https://p469vqxf.backend.blink.new";
+ const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
```

### Step 9: Update `.env.local`
```diff
- VITE_BLINK_PROJECT_ID='solana-meme-scout-p469vqxf'
- VITE_BLINK_PUBLISHABLE_KEY='blnk_pk_o8N5ILZkbXSgJE2XD94xFDzaSS7Qx997'
+ VITE_BACKEND_URL=http://localhost:3001
```

### Step 10: Setup Backend Hono Lokal
- Tambah script di `package.json` untuk menjalankan backend:
  ```json
  "backend": "tsx watch backend/index.ts"
  ```
- Perlu tambah `@hono/node-server` agar Hono bisa jalan standalone:
  ```json
  "@hono/node-server": "^1.x"
  ```
- Buat file `backend/server.ts` yang wrap Hono app dengan Node server:
  ```ts
  import { serve } from '@hono/node-server'
  import app from './index'
  
  const port = 3001
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Backend running on http://localhost:${port}`)
  })
  ```

### Step 11: Update `vite.config.ts`
Tambah proxy agar frontend bisa akses backend tanpa CORS issues:
```ts
server: {
  port: 3000,
  strictPort: true,
  host: true,
  allowedHosts: true,
  proxy: {
    '/api': {
      target: 'http://localhost:3001',
      changeOrigin: true,
    },
  },
}
```

Jika proxy digunakan, update `api.ts` BACKEND menjadi kosong (relative path):
```ts
const BACKEND = "";  // Vite proxy handles /api routes
```

### Step 12: Install Deps & Verify
```bash
bun install
bun run dev        # Frontend di port 3000
bun run backend    # Backend di port 3001
bun run build      # Verify build sukses
```

---

## 5. File yang Akan Diubah

| File | Aksi |
|------|------|
| `index.html` | Edit (hapus script Blink) |
| `package.json` | Edit (hapus Blink deps, tambah deps) |
| `src/main.tsx` | Edit (hapus BlinkUIProvider, ganti Toaster) |
| `src/Shell.tsx` | **Hapus** |
| `src/index.css` | Edit (hapus import Blink, tambah CSS vars) |
| `src/lib/api.ts` | Edit (ganti BACKEND URL) |
| `tailwind.config.cjs` | Edit (hapus Blink content path, update comments) |
| `.env.local` | Edit (ganti ke config lokal) |
| `vite.config.ts` | Edit (tambah proxy) |
| `backend/server.ts` | **Buat baru** (Node server wrapper) |

---

## 6. Risks & Considerations

1. **CSS Variables**: Jika `@blinkdotnew/ui/styles` mendefinisikan CSS vars yang belum ada di `index.css`, perlu ditambahkan manual berdasarkan hasil clone analysis.

2. **AppShell Components**: `Shell.tsx` tidak dipakai, jadi aman dihapus. Tapi perlu konfirmasi tidak ada file lain yang import dari situ.

3. **Backend Hosting**: Backend sebelumnya hosted di Blink (`*.backend.blink.new`). Sekarang harus jalan lokal. Untuk production, perlu deploy ke VPS/server sendiri.

4. **`@blinkdotnew/sdk`**: Tidak ditemukan import langsung di source code manapun. Kemungkinan hanya dipakai oleh Blink build system. Aman dihapus.

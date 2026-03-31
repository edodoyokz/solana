# Next Improvement Plan — MemeScout

## Objective
Meningkatkan kualitas platform dari **signal discovery tool** menjadi **probability engine** untuk membantu memaksimalkan peluang menemukan memecoin yang akan terbang, dengan tetap menjaga disiplin risk filtering, speed, dan explainability.

---

## Strategic Goal Gap Today
Saat ini platform sudah kuat untuk:
- discovery awal,
- risk filtering,
- deep dive lintas halaman,
- LLM final reasoning.

Namun untuk benar-benar memaksimalkan probabilitas menemukan coin yang akan terbang, gap utamanya masih:
- belum ada **evidence layer** (signal belum divalidasi dengan outcome nyata),
- belum ada **signal evolution tracking** (snapshot tunggal belum cukup),
- scoring masih dominan heuristic/manual,
- confidence belum mewakili probabilitas real berbasis hasil historis.

Karena itu, prioritas next improvement difokuskan untuk menaikkan platform dari heuristic scanner menjadi probability engine yang belajar dari hasil nyata.

---

## Priority 1 — Signal Quality Validation (P0)

### 1.1 Signal Outcome Tracking
**Goal:** mengetahui kualitas signal real (bukan asumsi).

- Simpan snapshot signal periodik untuk token yang masuk Top Opportunities.
- Simpan hasil pergerakan harga setelah signal muncul (mis. +15m, +1h, +6h, +24h).
- Tandai outcome per signal:
  - hit
  - neutral
  - miss

**Deliverables:**
- tabel `signal_outcomes`
- job evaluator outcome
- endpoint ringkas untuk metrik performa

### 1.2 Signal Performance Dashboard
**Goal:** lihat performa engine secara objektif.

Metrik utama:
- hit rate per verdict (strong_buy/buy/watch)
- average return by horizon (15m/1h/6h/24h)
- false positive ratio
- drawdown after signal

**Deliverables:**
- panel “Signal Quality” di UI
- filter by date range + verdict + min score

---

## Priority 2 — Event Timeline & Alert Evolution (P1)

### 2.1 Verdict Transition Timeline
**Goal:** user tahu kapan signal membaik/memburuk.

- Track perubahan score/verdict untuk token watchlist.
- Event contoh:
  - WATCH → BUY
  - BUY → AVOID
  - confidence spike/drop

**Deliverables:**
- tabel `signal_events`
- endpoint `/api/signals/events`
- timeline UI di Recommendation/Wallet

### 2.2 Lean Alerts (Signal-Only)
**Goal:** notifikasi cepat tanpa auto-trade.

Alert triggers:
- score melewati threshold
- liquidity jatuh di bawah floor
- risk flag baru muncul

**Deliverables:**
- alert rules per user
- in-app notification feed

---

## Priority 3 — Scoring Engine Hardening (P1)

### 3.0 Probability Engine Upgrade
**Goal:** menaikkan kualitas ranking dari heuristic menjadi evidence-informed probability model.

- Tune bobot score berdasarkan hasil signal real.
- Bandingkan performa per score band (mis. 60–69, 70–79, 80+).
- Deteksi pola mana yang benar-benar leading untuk upside besar.
- Turunkan bobot sinyal yang sering menghasilkan false positive.

**Deliverables:**
- score weight tuning framework
- evaluation report per score bucket
- baseline vs tuned model comparison

### 3.1 Adaptive Thresholds

### 3.1 Adaptive Thresholds
**Goal:** threshold tidak statis di semua kondisi market.

- Mode market-aware (high-volatility vs normal).
- Penyesuaian bobot momentum/risk secara adaptif.

### 3.2 Better Risk Overrides
**Goal:** kurangi false buy.

- hard block tambahan untuk pola manipulatif (volume burst tanpa depth, buy/sell imbalance ekstrim berulang).
- safety veto jika data krusial tidak tersedia.

### 3.3 Explainability Upgrade
**Goal:** alasan keputusan lebih actionable.

- reason codes standardized (R1, R2, R3...)
- mapping reason → action suggestion
- reason dibagi menjadi:
  - upside thesis
  - invalidation
  - why this can fail

### 3.4 Confidence v2
**Goal:** confidence tidak hanya berarti “LLM yakin”, tapi lebih dekat ke probabilitas operasional.

Confidence baru dibangun dari:
- data completeness
- agreement antar sinyal (risk, flow, liquidity, social)
- historical precision untuk pola serupa
- stability score dari perubahan signal terbaru

---

## Priority 4 — Social & Execution Intelligence (P2)

### 4.1 Social Velocity Upgrade
**Goal:** mendeteksi coin yang mulai meledak lebih awal.

- ukur mention anomaly, bukan hanya sentiment statis
- track acceleration lintas platform
- cari signal penyebaran narasi yang mulai organik

### 4.2 LLM Final Reasoning Upgrade
**Goal:** final analyzer benar-benar membantu keputusan entry.

Format reasoning wajib mencakup:
- entry thesis
- invalidation
- next confirmation needed
- why this setup can fail

### 4.3 Entry State Model
**Goal:** membedakan coin bagus vs coin siap entry sekarang.

State contoh:
- not ready
- early
- confirmed
- overcrowded

---

## Priority 5 — UX Flow Optimization (P2)

### 4.1 One-Click Workflow
Scanner card actions:
1. Analyze
2. Risk Check
3. Final Reasoning
4. Add to Watchlist

### 4.2 Persistent Workspace
- simpan filter scanner per user
- restore token terakhir saat reopen app
- recent analyzed tokens list

### 4.3 Compact-by-Default Consistency
- semua halaman memakai compact mode default
- detail panjang hanya via expand

---

## Priority 6 — Reliability & Ops (P2)

### 5.1 Source Health Monitoring
- monitor status setiap data source (Dex/Gecko/RugCheck/LLM)
- fallback strategy saat source tertentu down

### 5.2 Latency Budget
Target:
- ranked signals refresh < 5 detik
- token deep analysis < 8 detik

### 5.3 Caching Strategy
- short TTL cache untuk query mahal
- dedupe request paralel per token

---

## Implementation Roadmap

### Sprint 1
- signal outcome tracking
- performance dashboard MVP
- baseline score bucket evaluation

### Sprint 2
- signal events timeline
- lean alert rules
- transition-based signal review

### Sprint 3
- probability engine tuning
- adaptive thresholds + risk override hardening
- confidence v2

### Sprint 4
- social velocity anomaly detection
- LLM final reasoning upgrade
- entry state model

### Sprint 5
- UX workflow polish
- reliability monitoring
- latency/caching optimization

---

## Definition of Done (Next Phase)
- kualitas signal terukur dengan metrik real outcome
- user bisa lihat perubahan verdict dari waktu ke waktu
- false positive turun secara terukur
- score tinggi terbukti outperform baseline secara konsisten
- confidence lebih dekat ke probabilitas operasional, bukan sekadar keyakinan LLM
- flow tetap cepat, ringkas, dan konsisten lintas halaman

import { supabase } from './supabase'
import type { TokenSignal } from './signal-engine'

const HORIZONS = [15, 60, 360, 1440]

function classifyOutcome(returnPct: number | null): string {
  if (returnPct == null) return 'pending'
  if (returnPct >= 15) return 'hit'
  if (returnPct <= -10) return 'miss'
  return 'neutral'
}

export async function persistSignalSnapshots(signals: TokenSignal[]): Promise<void> {
  if (!supabase || signals.length === 0) return

  const rows = signals.map(signal => ({
    token_address: signal.address,
    token_name: signal.name,
    token_symbol: signal.symbol,
    score: signal.score,
    verdict: signal.verdict,
    confidence: signal.confidence,
    liquidity_usd: signal.metrics.liquidityUsd,
    volume_24h: signal.metrics.volume24h,
    market_cap: signal.metrics.marketCap,
    price_usd: signal.metrics.priceUsd,
    price_change_24h: signal.metrics.priceChange24h,
    risk_flags: signal.metrics.riskFlags,
  }))

  await supabase.from('signal_snapshots').insert(rows)
}

async function fetchLatestPrice(tokenAddress: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`)
    if (!res.ok) return null
    const data = await res.json()
    const price = Number(data?.pairs?.[0]?.priceUsd ?? 0)
    return price > 0 ? price : null
  } catch {
    return null
  }
}

export async function evaluatePendingOutcomes(): Promise<void> {
  if (!supabase) return

  const { data: snapshots, error } = await supabase
    .from('signal_snapshots')
    .select('*')
    .order('snapshot_at', { ascending: false })
    .limit(50)

  if (error || !snapshots?.length) return

  const now = Date.now()

  for (const snapshot of snapshots) {
    for (const horizon of HORIZONS) {
      const snapshotTs = new Date(snapshot.snapshot_at).getTime()
      if ((now - snapshotTs) < horizon * 60 * 1000) continue

      const { data: existing } = await supabase
        .from('signal_outcomes')
        .select('id')
        .eq('snapshot_id', snapshot.id)
        .eq('horizon_minutes', horizon)
        .maybeSingle()

      if (existing) continue

      const latestPrice = await fetchLatestPrice(snapshot.token_address)
      const entryPrice = Number(snapshot.price_usd ?? 0)
      const returnPct = entryPrice > 0 && latestPrice
        ? ((latestPrice - entryPrice) / entryPrice) * 100
        : null

      await supabase.from('signal_outcomes').insert({
        snapshot_id: snapshot.id,
        token_address: snapshot.token_address,
        horizon_minutes: horizon,
        entry_price: entryPrice || null,
        latest_price: latestPrice,
        return_pct: returnPct,
        outcome: classifyOutcome(returnPct),
      })
    }
  }
}

export async function getSignalPerformanceSummary() {
  if (!supabase) {
    return {
      snapshots: 0,
      hitRate: 0,
      avgReturn1h: 0,
      avgReturn24h: 0,
      falsePositiveRate: 0,
    }
  }

  await evaluatePendingOutcomes()

  const [{ count: snapshots }, { data: outcomes1h }, { data: outcomes24h }] = await Promise.all([
    supabase.from('signal_snapshots').select('*', { count: 'exact', head: true }),
    supabase.from('signal_outcomes').select('return_pct,outcome').eq('horizon_minutes', 60),
    supabase.from('signal_outcomes').select('return_pct,outcome').eq('horizon_minutes', 1440),
  ])

  const oneHour = outcomes1h ?? []
  const day = outcomes24h ?? []

  const hitCount = day.filter(o => o.outcome === 'hit').length
  const missCount = day.filter(o => o.outcome === 'miss').length
  const avg1h = oneHour.length ? oneHour.reduce((a, b) => a + Number(b.return_pct ?? 0), 0) / oneHour.length : 0
  const avg24h = day.length ? day.reduce((a, b) => a + Number(b.return_pct ?? 0), 0) / day.length : 0

  return {
    snapshots: snapshots ?? 0,
    hitRate: day.length ? (hitCount / day.length) * 100 : 0,
    avgReturn1h: avg1h,
    avgReturn24h: avg24h,
    falsePositiveRate: day.length ? (missCount / day.length) * 100 : 0,
  }
}

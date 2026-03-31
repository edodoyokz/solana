import { supabase } from './supabase'

const DEX_BASE = 'https://api.dexscreener.com'
const RUGCHECK_BASE = 'https://api.rugcheck.xyz/v1'
const GECKO_BASE = 'https://api.geckoterminal.com/api/v2'

export type SignalVerdict = 'strong_buy' | 'buy' | 'watch' | 'avoid'

export interface TokenSignal {
  address: string
  name: string
  symbol: string
  pairAddress?: string
  dexUrl?: string
  score: number
  verdict: SignalVerdict
  confidence: number
  reasons: string[]
  breakdown: {
    liquidity: number
    onChainRisk: number
    momentumFlow: number
    socialVelocity: number
    marketStructure: number
    penalties: number
    evidenceQuality: number
    signalAgreement: number
    stability: number
    historicalEdge: number
  }
  metrics: {
    priceUsd: number
    liquidityUsd: number
    volume24h: number
    marketCap: number
    priceChange24h: number
    buys24h: number
    sells24h: number
    rugRiskScore: number | null
    riskFlags: number
    poolAgeHours: number | null
  }
}

interface DexPair {
  pairAddress?: string
  url?: string
  baseToken?: { address?: string; name?: string; symbol?: string }
  priceUsd?: string
  liquidity?: { usd?: number }
  volume?: { h24?: number }
  marketCap?: number
  fdv?: number
  priceChange?: { h1?: number; h6?: number; h24?: number }
  txns?: { h24?: { buys?: number; sells?: number } }
  pairCreatedAt?: number
  info?: { socials?: unknown[]; websites?: unknown[] }
}

interface RugSummary {
  score_normalised?: number
  risks?: Array<{ level?: string; name?: string }>
}

interface HistoricalEdge {
  hitRate: number
  avgReturn24h: number
  sampleSize: number
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n))
}

function timeout(ms: number) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(id) }
}

async function fetchJson(url: string, init?: RequestInit): Promise<any | null> {
  const { signal, clear } = timeout(9000)
  try {
    const res = await fetch(url, { ...init, signal })
    clear()
    if (!res.ok) return null
    return await res.json()
  } catch {
    clear()
    return null
  }
}

function toAddressFromGeckoTokenId(id?: string): string | null {
  if (!id) return null
  const parts = id.split('_')
  return parts.length > 1 ? parts[parts.length - 1] ?? null : null
}

async function getHistoricalEdge(address: string): Promise<HistoricalEdge> {
  if (!supabase) return { hitRate: 0, avgReturn24h: 0, sampleSize: 0 }

  const { data: snapshots } = await supabase
    .from('signal_snapshots')
    .select('id')
    .eq('token_address', address)
    .order('snapshot_at', { ascending: false })
    .limit(25)

  const snapshotIds = (snapshots ?? []).map(s => s.id)
  if (snapshotIds.length === 0) return { hitRate: 0, avgReturn24h: 0, sampleSize: 0 }

  const { data: outcomes } = await supabase
    .from('signal_outcomes')
    .select('outcome, return_pct')
    .eq('horizon_minutes', 1440)
    .in('snapshot_id', snapshotIds)

  const rows = outcomes ?? []
  const hitRate = rows.length ? (rows.filter(o => o.outcome === 'hit').length / rows.length) * 100 : 0
  const avgReturn24h = rows.length ? rows.reduce((sum, row) => sum + Number(row.return_pct ?? 0), 0) / rows.length : 0

  return { hitRate, avgReturn24h, sampleSize: rows.length }
}

function computeSignal(address: string, pair: DexPair | null, rug: RugSummary | null, historicalEdge: HistoricalEdge): TokenSignal | null {
  if (!pair?.baseToken?.address) return null

  const liquidityUsd = Number(pair.liquidity?.usd ?? 0)
  const volume24h = Number(pair.volume?.h24 ?? 0)
  const marketCap = Number(pair.marketCap ?? pair.fdv ?? 0)
  const priceUsd = Number(pair.priceUsd ?? 0)
  const ch1 = Number(pair.priceChange?.h1 ?? 0)
  const ch6 = Number(pair.priceChange?.h6 ?? 0)
  const ch24 = Number(pair.priceChange?.h24 ?? 0)
  const buys24h = Number(pair.txns?.h24?.buys ?? 0)
  const sells24h = Number(pair.txns?.h24?.sells ?? 0)
  const totalTx = buys24h + sells24h
  const buyPressure = totalTx > 0 ? buys24h / totalTx : 0.5

  const now = Date.now()
  const poolAgeHours = pair.pairCreatedAt ? (now - pair.pairCreatedAt) / (1000 * 60 * 60) : null

  const rugRiskRaw = rug?.score_normalised
  const rugSafe = rugRiskRaw == null ? 45 : clamp(100 - rugRiskRaw)
  const dangerFlags = (rug?.risks ?? []).filter(r => r.level === 'danger').length
  const warnFlags = (rug?.risks ?? []).filter(r => r.level === 'warn').length
  const riskFlags = dangerFlags + warnFlags

  const socialCount = Number(pair.info?.socials?.length ?? 0)
  const websiteCount = Number(pair.info?.websites?.length ?? 0)

  const liquidityScore = clamp((liquidityUsd / 250_000) * 100)
  const onChainRiskScore = clamp(rugSafe - (dangerFlags * 12) - (warnFlags * 4))
  const momentumScore = clamp(
    50 +
      (ch1 * 1.8) +
      (ch6 * 1.1) +
      (ch24 * 0.5) +
      ((buyPressure - 0.5) * 45) +
      (volume24h > 500_000 ? 8 : volume24h > 100_000 ? 4 : 0),
  )
  const socialScore = clamp((socialCount * 22) + (websiteCount * 12) + (socialCount > 0 ? 20 : 0))

  let structureScore = 50
  if (poolAgeHours != null) {
    if (poolAgeHours < 1) structureScore = 35
    else if (poolAgeHours < 6) structureScore = 50
    else if (poolAgeHours < 48) structureScore = 70
    else structureScore = 75
  }
  if (Math.abs(ch24) > 80) structureScore -= 18
  if (Math.abs(ch24) > 150) structureScore -= 12
  structureScore = clamp(structureScore)

  let penalties = 0
  const reasons: string[] = []

  if (liquidityUsd < 20_000) {
    penalties += 28
    reasons.push('Liquidity terlalu tipis (<$20k)')
  } else if (liquidityUsd < 50_000) {
    penalties += 15
    reasons.push('Liquidity masih rendah (<$50k)')
  }

  if (dangerFlags > 0) {
    penalties += 20
    reasons.push(`RugCheck danger flags: ${dangerFlags}`)
  }
  if (warnFlags >= 2) {
    penalties += 8
    reasons.push(`RugCheck warning flags: ${warnFlags}`)
  }

  if (buyPressure > 0.9 && totalTx > 120) {
    penalties += 8
    reasons.push('Buy pressure terlalu ekstrem (potensi spike tidak sehat)')
  }

  if (marketCap > 0 && liquidityUsd > 0 && (liquidityUsd / marketCap) < 0.03) {
    penalties += 10
    reasons.push('Liquidity/MarketCap ratio rendah')
  }

  const weighted =
    (liquidityScore * 0.25) +
    (onChainRiskScore * 0.25) +
    (momentumScore * 0.2) +
    (socialScore * 0.15) +
    (structureScore * 0.15)

  const historicalEdgeScore = historicalEdge.sampleSize > 0
    ? clamp((historicalEdge.hitRate * 0.7) + (Math.max(-20, Math.min(30, historicalEdge.avgReturn24h)) + 20))
    : 45

  const score = clamp(Math.round((weighted * 0.88) + (historicalEdgeScore * 0.12) - penalties))

  const hasBuyGuards = liquidityUsd >= 50_000 && dangerFlags === 0
  let verdict: SignalVerdict = 'avoid'
  if (score >= 80 && hasBuyGuards) verdict = 'strong_buy'
  else if (score >= 65 && hasBuyGuards) verdict = 'buy'
  else if (score >= 45) verdict = 'watch'

  if (reasons.length === 0) {
    if (liquidityScore >= 70) reasons.push('Liquidity sehat untuk entry')
    if (onChainRiskScore >= 70) reasons.push('Risk on-chain relatif rendah')
    if (momentumScore >= 65) reasons.push('Momentum dan flow mendukung')
    if (reasons.length === 0) reasons.push('Sinyal campuran, perlu konfirmasi tambahan')
  }

  const completeness = [pair ? 1 : 0, rug ? 1 : 0, socialCount > 0 ? 1 : 0].reduce((a, b) => a + b, 0) / 3
  const evidenceQuality = clamp((completeness * 100) - (dangerFlags * 10) - (warnFlags * 4) + (websiteCount > 0 ? 8 : 0))

  const agreementInputs = [liquidityScore, onChainRiskScore, momentumScore, socialScore, structureScore]
  const agreementSpread = Math.max(...agreementInputs) - Math.min(...agreementInputs)
  const signalAgreement = clamp(100 - agreementSpread)

  let stability = 55
  if (poolAgeHours != null) {
    if (poolAgeHours >= 6 && poolAgeHours <= 72) stability += 18
    else if (poolAgeHours > 72) stability += 10
    else stability -= 10
  }
  if (Math.abs(ch24) > 80) stability -= 15
  if (Math.abs(ch24) > 150) stability -= 15
  stability = clamp(stability)

  const confidence = clamp(Math.round(
    (evidenceQuality * 0.28) +
    (signalAgreement * 0.22) +
    (stability * 0.18) +
    (score * 0.2) +
    (historicalEdgeScore * 0.12) -
    Math.min(18, penalties * 0.18),
  ))

  return {
    address,
    name: pair.baseToken.name ?? address.slice(0, 8),
    symbol: pair.baseToken.symbol ?? '?',
    pairAddress: pair.pairAddress,
    dexUrl: pair.url,
    score,
    verdict,
    confidence,
    reasons: reasons.slice(0, 4),
    breakdown: {
      liquidity: Math.round(liquidityScore),
      onChainRisk: Math.round(onChainRiskScore),
      momentumFlow: Math.round(momentumScore),
      socialVelocity: Math.round(socialScore),
      marketStructure: Math.round(structureScore),
      penalties: Math.round(penalties),
      evidenceQuality: Math.round(evidenceQuality),
      signalAgreement: Math.round(signalAgreement),
      stability: Math.round(stability),
      historicalEdge: Math.round(historicalEdgeScore),
    },
    metrics: {
      priceUsd,
      liquidityUsd,
      volume24h,
      marketCap,
      priceChange24h: ch24,
      buys24h,
      sells24h,
      rugRiskScore: rugRiskRaw ?? null,
      riskFlags,
      poolAgeHours: poolAgeHours == null ? null : Number(poolAgeHours.toFixed(2)),
    },
  }
}

export async function getTokenSignal(address: string): Promise<TokenSignal | null> {
  const [dex, rug, historicalEdge] = await Promise.all([
    fetchJson(`${DEX_BASE}/latest/dex/tokens/${address}`),
    fetchJson(`${RUGCHECK_BASE}/tokens/${address}/report/summary`),
    getHistoricalEdge(address),
  ])

  const pair: DexPair | null = dex?.pairs?.[0] ?? null
  return computeSignal(address, pair, rug, historicalEdge)
}

export interface RankedSignalOptions {
  limit?: number
  minScore?: number
  minLiquidity?: number
  verdict?: SignalVerdict | 'all'
}

function passesPrefilter(pair: DexPair | null): boolean {
  if (!pair?.baseToken?.address) return false
  const liq = Number(pair.liquidity?.usd ?? 0)
  const vol = Number(pair.volume?.h24 ?? 0)
  const tx = Number(pair.txns?.h24?.buys ?? 0) + Number(pair.txns?.h24?.sells ?? 0)
  return liq >= 15_000 && vol >= 20_000 && tx >= 20
}

async function loadCandidateAddresses(max = 120): Promise<string[]> {
  const [boosted, latestProfiles, trending, fresh] = await Promise.all([
    fetchJson(`${DEX_BASE}/token-boosts/latest/v1`),
    fetchJson(`${DEX_BASE}/token-profiles/latest/v1`),
    fetchJson(`${GECKO_BASE}/networks/solana/trending_pools?include=base_token,dex&page=1`, {
      headers: { Accept: 'application/json;version=20230302' },
    }),
    fetchJson(`${GECKO_BASE}/networks/solana/new_pools?include=base_token,dex&page=1`, {
      headers: { Accept: 'application/json;version=20230302' },
    }),
  ])

  const addresses = new Set<string>()

  for (const token of boosted ?? []) {
    if (token?.chainId === 'solana' && token?.tokenAddress) addresses.add(token.tokenAddress)
  }
  for (const profile of latestProfiles ?? []) {
    if (profile?.chainId === 'solana' && profile?.tokenAddress) addresses.add(profile.tokenAddress)
  }
  for (const pool of trending?.data ?? []) {
    const id = pool?.relationships?.base_token?.data?.id
    const addr = toAddressFromGeckoTokenId(id)
    if (addr) addresses.add(addr)
  }
  for (const pool of fresh?.data ?? []) {
    const id = pool?.relationships?.base_token?.data?.id
    const addr = toAddressFromGeckoTokenId(id)
    if (addr) addresses.add(addr)
  }

  return Array.from(addresses).slice(0, max)
}

async function buildSignalFromAddress(address: string): Promise<TokenSignal | null> {
  const [dex, rug, historicalEdge] = await Promise.all([
    fetchJson(`${DEX_BASE}/latest/dex/tokens/${address}`),
    fetchJson(`${RUGCHECK_BASE}/tokens/${address}/report/summary`),
    getHistoricalEdge(address),
  ])
  const pair: DexPair | null = dex?.pairs?.[0] ?? null
  if (!passesPrefilter(pair)) return null
  return computeSignal(address, pair, rug, historicalEdge)
}

export async function getRankedSignals(options: RankedSignalOptions = {}): Promise<TokenSignal[]> {
  const safeLimit = clamp(options.limit ?? 20, 5, 50)
  const minScore = clamp(options.minScore ?? 0, 0, 100)
  const minLiquidity = Math.max(0, Number(options.minLiquidity ?? 0))
  const verdict = options.verdict ?? 'all'

  const candidateAddresses = await loadCandidateAddresses(140)
  const candidates = await Promise.all(candidateAddresses.map(a => buildSignalFromAddress(a)))

  return candidates
    .filter((s): s is TokenSignal => !!s)
    .filter(s => s.score >= minScore)
    .filter(s => s.metrics.liquidityUsd >= minLiquidity)
    .filter(s => {
      if (verdict === 'all') return true
      if (verdict === 'buy') return s.verdict === 'buy' || s.verdict === 'strong_buy'
      return s.verdict === verdict
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, safeLimit)
}

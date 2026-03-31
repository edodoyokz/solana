import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp, TrendingDown, Star, AlertTriangle,
  Search, RefreshCw, Clock, Users, DollarSign, Droplets,
  Zap, ExternalLink, ShieldCheck
} from 'lucide-react'
import Header from '../components/layout/Header'
import RiskBadge from '../components/ui/RiskBadge'
import {
  fetchBoostedTokens,
  fetchTrendingPools,
  fetchNewPools,
  fetchRankedSignals,
  fetchSignalPerformance,
  type DexBoostToken,
  type GeckoPool,
  type TokenSignal,
} from '../lib/api'
import { cn } from '../lib/utils'
import { persistTokenAddress } from '../lib/token-context'

// ─── helpers ─────────────────────────────────────────────────

function formatNum(n: number): string {
  if (!n || isNaN(n)) return '$0'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function formatPrice(p: number): string {
  if (!p || isNaN(p)) return '—'
  if (p < 0.000001) return p.toExponential(2)
  if (p < 0.001) return p.toFixed(8)
  if (p < 1) return p.toFixed(6)
  return p.toFixed(4)
}

function shortAddr(addr: string): string {
  return addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : ''
}

function getIconUrl(token: DexBoostToken): string | null {
  if (!token.icon) return null
  if (token.icon.startsWith('http')) return token.icon
  return `https://cdn.dexscreener.com/cms/images/${token.icon}?width=64&height=64&fit=crop&quality=95&format=auto`
}

function ageSince(ms: number): string {
  const secs = Math.floor((Date.now() - ms) / 1000)
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
  return `${Math.floor(secs / 86400)}d`
}

// ─── Boosted Token Card (DexScreener boosted = trending) ─────

function BoostedCard({ token, index }: { token: DexBoostToken; index: number }) {
  const iconUrl = getIconUrl(token)
  const hasTwitter = token.links?.some(l => l.type === 'twitter')
  const hasTelegram = token.links?.some(l => l.type === 'telegram')
  const boostAmount = token.totalAmount ?? 0
  const riskProxy = boostAmount > 100 ? 30 : boostAmount > 50 ? 50 : 70

  return (
    <div
      className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-all duration-200 cursor-pointer group hover:shadow-lg hover:-translate-y-0.5 animate-fade-in-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 border border-border flex items-center justify-center shrink-0 overflow-hidden">
            {iconUrl ? (
              <img src={iconUrl} alt="" className="w-10 h-10 rounded-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
            ) : (
              <Zap size={14} className="text-primary" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground text-sm leading-none truncate max-w-[140px]">
              {token.description?.slice(0, 24) || shortAddr(token.tokenAddress)}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono mt-1">{shortAddr(token.tokenAddress)}</p>
          </div>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-green-500/20 text-green-400 border-green-500/30 font-mono flex items-center gap-1">
          <TrendingUp size={9} />
          BOOSTED
        </span>
      </div>

      {/* Boost amount */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs text-muted-foreground">Boost Amount</p>
          <p className="text-sm font-mono font-bold text-accent">🔥 {boostAmount.toLocaleString()} pts</p>
        </div>
        <RiskBadge score={riskProxy} />
      </div>

      <div className="h-px bg-border mb-3" />

      {/* Social links */}
      <div className="flex items-center gap-2 flex-wrap">
        {hasTwitter && (
          <span className="text-[10px] bg-sky-400/10 text-sky-400 border border-sky-400/20 px-1.5 py-0.5 rounded font-mono">X/Twitter</span>
        )}
        {hasTelegram && (
          <span className="text-[10px] bg-blue-400/10 text-blue-400 border border-blue-400/20 px-1.5 py-0.5 rounded font-mono">Telegram</span>
        )}
        {(token.links?.length ?? 0) > 0 && (
          <span className="text-[10px] bg-muted text-muted-foreground border border-border px-1.5 py-0.5 rounded font-mono">{token.links!.length} links</span>
        )}
        <a
          href={token.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
          onClick={e => e.stopPropagation()}
        >
          <ExternalLink size={11} />
        </a>
      </div>
    </div>
  )
}

// ─── GeckoTerminal Pool Card ──────────────────────────────────

function PoolCard({ pool, index, type }: { pool: GeckoPool; index: number; type: 'trending' | 'new' }) {
  const a = pool.attributes
  const price = parseFloat(a.base_token_price_usd ?? '0')
  const vol24h = parseFloat(a.volume_usd?.h24 ?? '0')
  const liq = parseFloat(a.reserve_in_usd ?? '0')
  const mc = parseFloat(a.market_cap_usd ?? a.fdv_usd ?? '0')
  const ch24 = parseFloat(a.price_change_percentage?.h24 ?? '0')
  const buys24 = a.transactions?.h24?.buys ?? 0
  const sells24 = a.transactions?.h24?.sells ?? 0
  const holders = buys24 + sells24
  const created = a.pool_created_at ? new Date(a.pool_created_at).getTime() : 0
  const riskProxy = type === 'new' ? (liq < 50000 ? 75 : liq < 200000 ? 50 : 30) : 35

  // Name = "TOKEN / QUOTE"
  const nameParts = (a.name ?? '').split(' / ')
  const tokenName = nameParts[0] ?? a.name

  return (
    <div
      className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-all duration-200 cursor-pointer group hover:shadow-lg hover:-translate-y-0.5 animate-fade-in-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 border border-border flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-foreground">{tokenName.charAt(0)}</span>
          </div>
          <div>
            <p className="font-semibold text-foreground text-sm leading-none truncate max-w-[130px]">{tokenName}</p>
            <p className="text-[10px] text-muted-foreground font-mono mt-1">{shortAddr(a.address)}</p>
          </div>
        </div>
        <span className={cn(
          'text-[10px] font-bold px-2 py-0.5 rounded border font-mono flex items-center gap-1',
          type === 'trending'
            ? 'bg-green-500/20 text-green-400 border-green-500/30'
            : 'bg-accent/20 text-accent border-accent/30'
        )}>
          {type === 'trending' ? <><TrendingUp size={9} />TRENDING</> : <><Star size={9} />NEW</>}
        </span>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-mono text-sm font-bold text-foreground">${formatPrice(price)}</p>
          <div className={cn('flex items-center gap-0.5 text-xs font-mono font-bold mt-0.5', ch24 >= 0 ? 'text-green-400' : 'text-red-400')}>
            {ch24 >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {ch24 >= 0 ? '+' : ''}{ch24.toFixed(1)}%
          </div>
        </div>
        <RiskBadge score={riskProxy} />
      </div>

      <div className="h-px bg-border mb-3" />

      <div className="grid grid-cols-2 gap-2">
        <StatItem icon={DollarSign} label="Volume 24h" value={formatNum(vol24h)} />
        <StatItem icon={TrendingUp} label="Market Cap" value={formatNum(mc)} />
        <StatItem icon={Users} label="Txns 24h" value={`${holders.toLocaleString()}`} />
        <StatItem icon={Droplets} label="Liquidity" value={formatNum(liq)} />
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock size={10} />
          <span className="font-mono">{created ? `${ageSince(created)} ago` : 'Unknown'}</span>
        </div>
        <div className="flex gap-1 font-mono">
          <span className="bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded">B:{buys24}</span>
          <span className="bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">S:{sells24}</span>
        </div>
      </div>
    </div>
  )
}

function StatItem({ icon: Icon, label, value }: { icon: typeof DollarSign; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon size={11} className="text-muted-foreground shrink-0" />
      <div>
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-[11px] font-mono font-medium text-foreground">{value}</p>
      </div>
    </div>
  )
}

function verdictUi(v: TokenSignal['verdict']) {
  if (v === 'strong_buy') return { label: 'STRONG BUY', cls: 'text-green-400 bg-green-500/15 border-green-500/30' }
  if (v === 'buy') return { label: 'BUY', cls: 'text-green-300 bg-green-500/10 border-green-500/20' }
  if (v === 'watch') return { label: 'WATCH', cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' }
  return { label: 'AVOID', cls: 'text-red-400 bg-red-500/10 border-red-500/20' }
}

function SignalCard({ signal, index, onOpenPage }: { signal: TokenSignal; index: number; onOpenPage: (path: '/wallet' | '/analyzer' | '/recommendation', address: string) => void }) {
  const verdict = verdictUi(signal.verdict)
  return (
    <div
      className="bg-card border border-border rounded-xl p-4 hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 animate-fade-in-up"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-foreground text-sm leading-none truncate max-w-[170px]">{signal.name}</p>
          <p className="text-[10px] text-muted-foreground font-mono mt-1">${signal.symbol} · {shortAddr(signal.address)}</p>
        </div>
        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border font-mono', verdict.cls)}>
          {verdict.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-background/40 border border-border rounded-lg p-2 text-center">
          <p className="text-[9px] text-muted-foreground uppercase">Score</p>
          <p className="text-sm font-bold font-mono text-primary">{signal.score}</p>
        </div>
        <div className="bg-background/40 border border-border rounded-lg p-2 text-center">
          <p className="text-[9px] text-muted-foreground uppercase">Conf v2</p>
          <p className="text-sm font-bold font-mono text-accent">{signal.confidence}%</p>
        </div>
        <div className="bg-background/40 border border-border rounded-lg p-2 text-center">
          <p className="text-[9px] text-muted-foreground uppercase">Risk</p>
          <p className="text-sm font-bold font-mono text-foreground">{signal.metrics.riskFlags}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3 text-[10px] font-mono text-muted-foreground">
        <div className="bg-background/30 border border-border rounded-lg px-2 py-1.5">Evidence {signal.breakdown.evidenceQuality}</div>
        <div className="bg-background/30 border border-border rounded-lg px-2 py-1.5">Agreement {signal.breakdown.signalAgreement}</div>
        <div className="bg-background/30 border border-border rounded-lg px-2 py-1.5">Stability {signal.breakdown.stability}</div>
        <div className="bg-background/30 border border-border rounded-lg px-2 py-1.5">History {signal.breakdown.historicalEdge}</div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatItem icon={Droplets} label="Liquidity" value={formatNum(signal.metrics.liquidityUsd)} />
        <StatItem icon={DollarSign} label="Vol 24h" value={formatNum(signal.metrics.volume24h)} />
      </div>

      <div className="space-y-1.5 mb-3">
        {signal.reasons.slice(0, 2).map((reason, i) => (
          <p key={i} className="text-[11px] text-muted-foreground">• {reason}</p>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-[10px] text-muted-foreground font-mono">24h: {signal.metrics.priceChange24h >= 0 ? '+' : ''}{signal.metrics.priceChange24h.toFixed(1)}%</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenPage('/wallet', signal.address)}
            className="px-2 py-1 rounded-md border border-border bg-background/50 text-[10px] text-muted-foreground hover:text-foreground hover:border-primary/30"
          >
            Risk
          </button>
          <button
            onClick={() => onOpenPage('/analyzer', signal.address)}
            className="px-2 py-1 rounded-md border border-primary/30 bg-primary/10 text-[10px] text-primary hover:bg-primary/15"
          >
            Analyze
          </button>
          <button
            onClick={() => onOpenPage('/recommendation', signal.address)}
            className="px-2 py-1 rounded-md border border-accent/30 bg-accent/10 text-[10px] text-accent hover:bg-accent/15"
          >
            Final
          </button>
          {signal.dexUrl && (
            <a
              href={signal.dexUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────

type ViewMode = 'boosted' | 'trending' | 'new' | 'signals'

export default function Scanner() {
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState<ViewMode>('signals')
  const [searchQuery, setSearchQuery] = useState('')
  const [minScoreInput, setMinScoreInput] = useState(60)
  const [minLiquidityInput, setMinLiquidityInput] = useState(50000)
  const [minScore, setMinScore] = useState(60)
  const [minLiquidity, setMinLiquidity] = useState(50000)
  const [verdictFilter, setVerdictFilter] = useState<'all' | 'strong_buy' | 'buy' | 'watch' | 'avoid'>('all')

  const {
    data: boosted,
    isLoading: loadingBoosted,
    error: errorBoosted,
    refetch: refetchBoosted,
  } = useQuery({
    queryKey: ['scanner', 'boosted'],
    queryFn: fetchBoostedTokens,
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
  })

  const {
    data: trending,
    isLoading: loadingTrending,
    error: errorTrending,
    refetch: refetchTrending,
  } = useQuery({
    queryKey: ['scanner', 'trending'],
    queryFn: fetchTrendingPools,
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
  })

  const {
    data: newPools,
    isLoading: loadingNew,
    error: errorNew,
    refetch: refetchNew,
  } = useQuery({
    queryKey: ['scanner', 'new'],
    queryFn: fetchNewPools,
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
  })

  const {
    data: rankedSignals,
    isLoading: loadingSignals,
    error: errorSignals,
    refetch: refetchSignals,
  } = useQuery({
    queryKey: ['scanner', 'signals', minScore, minLiquidity],
    queryFn: () => fetchRankedSignals(20, {
      minScore,
      minLiquidity,
      verdict: 'all',
    }),
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 2,
  })

  const { data: signalPerformance } = useQuery({
    queryKey: ['scanner', 'signal-performance'],
    queryFn: fetchSignalPerformance,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  })

  const isLoading =
    viewMode === 'boosted'
      ? loadingBoosted
      : viewMode === 'trending'
        ? loadingTrending
        : viewMode === 'new'
          ? loadingNew
          : loadingSignals

  const activeError =
    viewMode === 'boosted'
      ? errorBoosted
      : viewMode === 'trending'
        ? errorTrending
        : viewMode === 'new'
          ? errorNew
          : errorSignals

  const handleRefresh = () => {
    if (viewMode === 'boosted') refetchBoosted()
    else if (viewMode === 'trending') refetchTrending()
    else if (viewMode === 'new') refetchNew()
    else refetchSignals()
  }

  const handleOpenPage = (path: '/wallet' | '/analyzer' | '/recommendation', address: string) => {
    persistTokenAddress(address, false)
    navigate({ to: path, search: { address } })
  }

  const clearSignalFilters = () => {
    setSearchQuery('')
    setMinScoreInput(60)
    setMinLiquidityInput(50000)
    setMinScore(60)
    setMinLiquidity(50000)
    setVerdictFilter('all')
  }

  useEffect(() => {
    const id = setTimeout(() => {
      setMinScore(minScoreInput)
      setMinLiquidity(minLiquidityInput)
    }, 350)
    return () => clearTimeout(id)
  }, [minScoreInput, minLiquidityInput])

  // Filtered items
  const boostedFiltered = (boosted ?? []).filter(t =>
    !searchQuery ||
    t.tokenAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.description ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  const trendingFiltered = (trending ?? []).filter(p =>
    !searchQuery || p.attributes.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const newFiltered = (newPools ?? []).filter(p =>
    !searchQuery || p.attributes.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const signalFiltered = (rankedSignals ?? [])
    .filter(s => {
      if (verdictFilter === 'all') return true
      if (verdictFilter === 'buy') return s.verdict === 'buy' || s.verdict === 'strong_buy'
      return s.verdict === verdictFilter
    })
    .filter(s =>
      !searchQuery ||
      s.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.symbol.toLowerCase().includes(searchQuery.toLowerCase())
    )

  const stats = {
    trending: trending?.length ?? 0,
    new: newPools?.length ?? 0,
    boosted: boosted?.length ?? 0,
    signals: rankedSignals?.length ?? 0,
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Coin Scanner" subtitle="Live Solana meme coins — DexScreener + GeckoTerminal" />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Signal Quality */}
        {signalPerformance && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'Tracked Signals', value: signalPerformance.snapshots, color: 'text-primary' },
              { label: 'Hit Rate', value: `${signalPerformance.hitRate.toFixed(1)}%`, color: 'text-green-400' },
              { label: 'Avg 1h', value: `${signalPerformance.avgReturn1h >= 0 ? '+' : ''}${signalPerformance.avgReturn1h.toFixed(1)}%`, color: signalPerformance.avgReturn1h >= 0 ? 'text-green-400' : 'text-red-400' },
              { label: 'False Positives', value: `${signalPerformance.falsePositiveRate.toFixed(1)}%`, color: 'text-yellow-400' },
            ].map(item => (
              <div key={item.label} className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className={cn('text-2xl font-bold font-mono mt-1', item.color)}>{item.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Top Opportunities', value: stats.signals, color: 'text-primary' },
            { label: 'Trending Pools', value: stats.trending, color: 'text-green-400' },
            { label: 'New Launches', value: stats.new, color: 'text-accent' },
            { label: 'Boosted Tokens', value: stats.boosted, color: 'text-yellow-400' },
          ].map((s, i) => (
            <div key={s.label} className={`bg-card border border-border rounded-xl p-4 animate-fade-in-up delay-${i}00`}>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={cn('text-2xl font-bold font-mono mt-1', s.color)}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 flex-1">
            <Search size={14} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Search by name, address..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1 font-mono"
            />
          </div>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {viewMode === 'signals' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
            <label className="bg-card border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground">
              Min Score
              <input
                type="number"
                min={0}
                max={100}
                value={minScoreInput}
                onChange={e => setMinScoreInput(Number(e.target.value) || 0)}
                className="w-full mt-1 bg-transparent text-sm text-foreground font-mono outline-none"
              />
            </label>
            <label className="bg-card border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground">
              Min Liquidity (USD)
              <input
                type="number"
                min={0}
                value={minLiquidityInput}
                onChange={e => setMinLiquidityInput(Number(e.target.value) || 0)}
                className="w-full mt-1 bg-transparent text-sm text-foreground font-mono outline-none"
              />
            </label>
            <label className="bg-card border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground">
              Verdict
              <select
                value={verdictFilter}
                onChange={e => setVerdictFilter(e.target.value as 'all' | 'strong_buy' | 'buy' | 'watch' | 'avoid')}
                className="w-full mt-1 bg-transparent text-sm text-foreground font-mono outline-none"
              >
                <option value="all">ALL</option>
                <option value="strong_buy">STRONG BUY</option>
                <option value="buy">BUY (+ STRONG BUY)</option>
                <option value="watch">WATCH</option>
                <option value="avoid">AVOID</option>
              </select>
            </label>
          </div>

            <div className="flex items-center justify-between mb-4 text-[11px]">
              <span className="text-muted-foreground font-mono">
                Filters: score ≥ {minScore}, liq ≥ ${minLiquidity.toLocaleString()}, verdict {verdictFilter.toUpperCase()}
              </span>
              <button
                onClick={clearSignalFilters}
                className="text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                Clear Filters
              </button>
            </div>
          </>
        )}

        {/* View mode tabs */}
        <div className="flex items-center gap-1 mb-5 bg-card border border-border rounded-xl p-1 w-fit">
          {([
            { id: 'signals', label: '🎯 Opportunities', count: stats.signals },
            { id: 'trending', label: '🔥 Trending', count: stats.trending },
            { id: 'new', label: '⚡ New Pools', count: stats.new },
            { id: 'boosted', label: '🚀 Boosted', count: stats.boosted },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setViewMode(tab.id)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5',
                viewMode === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={cn(
                  'text-[10px] font-mono px-1 rounded',
                  viewMode === tab.id ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-border text-muted-foreground'
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* LIVE indicator */}
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-green-400 font-mono">LIVE DATA</span>
          <span className="text-[10px] text-muted-foreground ml-auto font-mono">
            {viewMode === 'signals'
              ? 'via Signal Engine (Dex + Gecko + RugCheck)'
              : viewMode === 'trending'
                ? 'via GeckoTerminal'
                : viewMode === 'new'
                  ? 'via GeckoTerminal'
                  : 'via DexScreener'} · auto-refresh 30s
          </span>
        </div>

        {/* Loading skeletons */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-border" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-border rounded w-3/4" />
                    <div className="h-2 bg-border rounded w-1/2" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-border rounded" />
                  <div className="h-3 bg-border rounded w-4/5" />
                  <div className="h-3 bg-border rounded w-3/5" />
                </div>
              </div>
            ))}
          </div>
        )}

        {activeError && !isLoading && (
          <div className="col-span-full flex flex-col items-center justify-center py-14 text-red-400">
            <AlertTriangle size={28} className="mb-2 opacity-80" />
            <p className="text-sm font-medium">Failed to load live data</p>
            <p className="text-xs text-muted-foreground mt-1 mb-3">{(activeError as Error).message || 'Please try again.'}</p>
            <button
              onClick={handleRefresh}
              className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Token grids */}
        {!activeError && !isLoading && viewMode === 'signals' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {signalFiltered.map((signal, i) => (
              <SignalCard
                key={`${signal.address}-${signal.score}`}
                signal={signal}
                index={i}
                onOpenPage={handleOpenPage}
              />
            ))}
            {signalFiltered.length === 0 && <EmptyState />}
          </div>
        )}

        {!activeError && !isLoading && viewMode === 'boosted' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {boostedFiltered.map((token, i) => (
              <BoostedCard key={`${token.tokenAddress}-${i}`} token={token} index={i} />
            ))}
            {boostedFiltered.length === 0 && <EmptyState />}
          </div>
        )}

        {!activeError && !isLoading && viewMode === 'trending' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {trendingFiltered.map((pool, i) => (
              <PoolCard key={pool.id} pool={pool} index={i} type="trending" />
            ))}
            {trendingFiltered.length === 0 && <EmptyState />}
          </div>
        )}

        {!activeError && !isLoading && viewMode === 'new' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {newFiltered.map((pool, i) => (
              <PoolCard key={pool.id} pool={pool} index={i} type="new" />
            ))}
            {newFiltered.length === 0 && <EmptyState />}
          </div>
        )}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground">
      <ShieldCheck size={32} className="mb-3 opacity-40" />
      <p className="text-sm">No tokens found</p>
    </div>
  )
}


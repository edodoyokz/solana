import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Search, ShieldCheck, ShieldAlert, ShieldX,
  ExternalLink, CheckCircle, XCircle, AlertCircle,
  Clock, RefreshCw, Loader2, Activity
} from 'lucide-react'
import Header from '../components/layout/Header'
import { fetchRugReport, fetchSignalEvents, type RugReport, type RugRiskItem, type SignalEvent } from '../lib/api'
import { cn } from '../lib/utils'
import { getInitialTokenAddress, persistTokenAddress } from '../lib/token-context'

// ─── RugCheck Gauge ──────────────────────────────────────────

function formatEventLabel(eventType: string): string {
  return eventType.replace(/_/g, ' ').toUpperCase()
}

function SignalTimeline({ events }: { events: SignalEvent[] }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={14} className="text-primary" />
        <p className="text-sm font-semibold">Recent Signal Changes</p>
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground">No tracked signal transitions yet.</p>
      ) : (
        <div className="space-y-2">
          {events.slice(0, 4).map(event => (
            <div key={event.id} className="rounded-lg border border-border bg-background/60 px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold text-foreground">{formatEventLabel(event.event_type)}</span>
                <span className="text-[10px] text-muted-foreground font-mono">{new Date(event.created_at).toLocaleTimeString()}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-muted-foreground">
                {event.previous_verdict && event.current_verdict && <span>{event.previous_verdict} → {event.current_verdict}</span>}
                {typeof event.delta_score === 'number' && <span>Δ {event.delta_score >= 0 ? '+' : ''}{event.delta_score}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RugGauge({ result }: { result: RugReport }) {
  const displayScore = result.score_normalised ?? 0
  // 0 = very safe, 100 = very risky (rugcheck raw scale)
  const safeScore = 100 - Math.min(100, displayScore) // higher = safer for display

  const scoreColor = safeScore >= 70 ? 'text-green-400' : safeScore >= 40 ? 'text-yellow-400' : 'text-red-400'
  const strokeColor = safeScore >= 70 ? '#22c55e' : safeScore >= 40 ? '#eab308' : '#ef4444'

  const verdict: 'safe' | 'caution' | 'danger' =
    safeScore >= 70 ? 'safe' : safeScore >= 40 ? 'caution' : 'danger'

  const verdictConfig = {
    safe: { icon: ShieldCheck, color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/20', label: 'SAFE' },
    caution: { icon: ShieldAlert, color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20', label: 'CAUTION' },
    danger: { icon: ShieldX, color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20', label: 'DANGER' },
  }

  const vCfg = verdictConfig[verdict]
  const VIcon = vCfg.icon
  const circumference = 2 * Math.PI * 40
  const strokeDashoffset = circumference - (safeScore / 100) * circumference

  // Derive LP info from markets
  const lpLocked = result.markets?.some(m => (m.lp?.lpLockedPct ?? 0) > 0) ?? false
  const topHolderPct = result.topHolders?.slice(0, 5).reduce((s, h) => s + h.pct, 0) ?? 0

  const risks: RugRiskItem[] = result.risks ?? []
  const dangerRisks = risks.filter(r => r.level === 'danger')
  const warnRisks = risks.filter(r => r.level === 'warn')

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-foreground">RugCheck Score</p>
          <p className="text-[10px] text-muted-foreground font-mono mt-0.5">via rugcheck.xyz · live</p>
        </div>
        <span className={cn('text-xs font-bold px-2 py-1 rounded border font-mono flex items-center gap-1', vCfg.bg, vCfg.color)}>
          <VIcon size={11} />
          {vCfg.label}
        </span>
      </div>

      <div className="flex items-center gap-6 mb-4">
        {/* SVG gauge */}
        <div className="relative w-24 h-24 shrink-0">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="hsl(220 13% 18%)" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="40" fill="none"
              stroke={strokeColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn('text-xl font-bold font-mono', scoreColor)}>{safeScore}</span>
            <span className="text-[9px] text-muted-foreground">/ 100</span>
          </div>
        </div>

        {/* Key checks */}
        <div className="flex-1 space-y-2">
          {[
            { label: 'LP Locked', value: lpLocked, good: true },
            { label: 'Mint Authority', value: !!result.mintAuthority, good: false },
            { label: 'Freeze Authority', value: !!result.freezeAuthority, good: false },
          ].map(check => {
            const isGood = check.good ? check.value : !check.value
            return (
              <div key={check.label} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{check.label}</span>
                <div className={cn('flex items-center gap-1 text-xs font-mono font-bold', isGood ? 'text-green-400' : 'text-red-400')}>
                  {isGood ? <CheckCircle size={11} /> : <XCircle size={11} />}
                  {check.value ? 'YES' : 'NO'}
                </div>
              </div>
            )
          })}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Top 5 Holders</span>
            <span className={cn('text-xs font-mono font-bold', topHolderPct > 50 ? 'text-red-400' : topHolderPct > 30 ? 'text-yellow-400' : 'text-green-400')}>
              {topHolderPct.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Risks */}
      {risks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Risk Factors</p>
            <span className="text-[10px] font-mono text-red-400">{dangerRisks.length} danger</span>
            <span className="text-[10px] font-mono text-yellow-400">{warnRisks.length} warn</span>
          </div>
          {risks.slice(0, 6).map((risk, i) => (
            <div key={i} className={cn(
              'flex items-start justify-between gap-3 px-3 py-2 rounded-lg border',
              risk.level === 'danger' ? 'bg-red-400/5 border-red-400/20' :
              risk.level === 'warn' ? 'bg-yellow-400/5 border-yellow-400/20' :
              'bg-blue-400/5 border-blue-400/20'
            )}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">{risk.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{risk.description}</p>
              </div>
              <span className={cn(
                'text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0',
                risk.level === 'danger' ? 'text-red-400 bg-red-400/10 border-red-400/30' :
                risk.level === 'warn' ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30' :
                'text-blue-400 bg-blue-400/10 border-blue-400/30'
              )}>
                -{risk.score}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────

export default function WalletTracker() {
  const initialAddress = getInitialTokenAddress()
  const [searchAddress, setSearchAddress] = useState(initialAddress)
  const [activeAddress, setActiveAddress] = useState(initialAddress)
  const [activeTab, setActiveTab] = useState<'rugcheck' | 'trending'>('rugcheck')

  const handleAnalyze = () => {
    const trimmed = searchAddress.trim()
    if (trimmed.length > 20) {
      setActiveAddress(trimmed)
      persistTokenAddress(trimmed)
    }
  }

  // RugCheck for user-entered or default address
  const { data: rugData, isLoading: rugLoading, error: rugError, refetch: refetchRug } = useQuery({
    queryKey: ['rugcheck', activeAddress],
    queryFn: () => fetchRugReport(activeAddress),
    enabled: activeAddress.length > 20,
    staleTime: 60_000,
    retry: 2,
  })

  // GeckoTerminal trending pools for "smart money" section
  const {
    data: trendingPools,
    isLoading: trendingLoading,
    error: trendingError,
    refetch: refetchTrending,
  } = useQuery({
    queryKey: ['scanner', 'trending'],
    queryFn: () => import('../lib/api').then(m => m.fetchTrendingPools()),
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: 2,
  })

  const { data: signalEvents = [] } = useQuery({
    queryKey: ['wallet', 'signal-events', activeAddress],
    queryFn: () => fetchSignalEvents(activeAddress, 8),
    enabled: activeAddress.length > 20,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  })

  const tokenName = rugData?.tokenMeta?.name || activeAddress.slice(0, 10) + '...'
  const tokenSymbol = rugData?.tokenMeta?.symbol || ''

  return (
    <div className="flex flex-col h-full">
      <Header title="Wallet Tracker" subtitle="Risk-first view: authority, holders, and RugCheck" />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Address search */}
        <div className="bg-card border border-border rounded-xl p-4 mb-6">
          <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Analyze Token Contract</p>
          <div className="flex gap-3">
            <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2 flex-1">
              <Search size={14} className="text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Enter Solana token contract address..."
                value={searchAddress}
                onChange={e => setSearchAddress(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1 font-mono"
              />
            </div>
            <button
              onClick={handleAnalyze}
              disabled={rugLoading}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-60"
            >
              {rugLoading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              {rugLoading ? 'Checking...' : 'Analyze'}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 font-mono">
            Example: DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263 (BONK)
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-card border border-border rounded-xl p-1 w-fit mb-5">
          {([
            { id: 'rugcheck', label: 'RugCheck Analysis' },
            { id: 'trending', label: 'Active Pools' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-xs font-medium transition-colors',
                activeTab === tab.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* RugCheck tab */}
        {activeTab === 'rugcheck' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              {/* No address yet */}
              {!activeAddress && !rugLoading && (
                <div className="bg-card border border-border rounded-xl p-8 flex flex-col items-center justify-center gap-3">
                  <ShieldCheck size={40} className="text-muted-foreground opacity-30" />
                  <p className="text-sm font-medium text-muted-foreground">Enter a token address above to analyze</p>
                  <p className="text-xs text-muted-foreground opacity-60 text-center max-w-xs">
                    We'll fetch live data from RugCheck.xyz including risk score, LP lock status, and holder analysis
                  </p>
                </div>
              )}

              {/* Loading */}
              {rugLoading && (
                <div className="bg-card border border-border rounded-xl p-8 flex flex-col items-center justify-center gap-4">
                  <Loader2 size={32} className="text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground font-mono">Fetching RugCheck report...</p>
                </div>
              )}

              {/* Error */}
              {rugError && !rugLoading && (
                <div className="bg-card border border-red-500/20 rounded-xl p-6 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} className="text-red-400" />
                    <p className="text-sm font-semibold text-red-400">Analysis Failed</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Could not fetch rug check data. Make sure the address is a valid Solana token mint.</p>
                  <button onClick={() => refetchRug()} className="text-xs text-primary hover:underline flex items-center gap-1 w-fit">
                    <RefreshCw size={11} /> Try again
                  </button>
                </div>
              )}

              {/* Results */}
              {rugData && !rugLoading && (
                <RugGauge result={rugData} />
              )}
            </div>

            {/* Token info sidebar */}
            <div className="space-y-4">
              {rugData && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Token Details</p>
                  <div className="space-y-2.5">
                    {[
                      { label: 'Name', value: tokenName || '—' },
                      { label: 'Symbol', value: tokenSymbol ? `$${tokenSymbol}` : '—' },
                      { label: 'Decimals', value: rugData.token?.decimals?.toString() ?? '—' },
                      { label: 'Top Holder', value: `${(rugData.topHolders?.[0]?.pct ?? 0).toFixed(1)}%` },
                      { label: 'Risk Score', value: `${rugData.score_normalised}/100` },
                    ].map(item => (
                      <div key={item.label} className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{item.label}</span>
                        <span className="text-xs font-mono font-medium text-foreground">{item.value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t border-border">
                    <p className="text-[10px] text-muted-foreground font-mono mb-1">Contract</p>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-mono text-muted-foreground truncate flex-1">{activeAddress}</p>
                      <a href={`https://rugcheck.xyz/tokens/${activeAddress}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={10} className="text-muted-foreground hover:text-foreground transition-colors" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {activeAddress && <SignalTimeline events={signalEvents} />}

              {/* Top holders */}
              {(rugData?.topHolders?.length ?? 0) > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Top Holders</p>
                  <div className="space-y-2">
                    {rugData!.topHolders.slice(0, 5).map((h, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground font-mono w-4">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[10px] font-mono text-foreground truncate">{h.owner.slice(0, 8)}...</span>
                            <span className={cn('text-[10px] font-mono font-bold', h.pct > 10 ? 'text-red-400' : h.pct > 5 ? 'text-yellow-400' : 'text-green-400')}>
                              {h.pct.toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-1 bg-border rounded-full overflow-hidden">
                            <div
                              className={cn('h-full rounded-full', h.pct > 10 ? 'bg-red-400/60' : h.pct > 5 ? 'bg-yellow-400/60' : 'bg-green-400/60')}
                              style={{ width: `${Math.min(100, h.pct * 5)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              <div className="flex items-start gap-2 bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3">
                <AlertCircle size={13} className="text-yellow-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground">
                  Data from <span className="text-accent font-mono">rugcheck.xyz</span>. Not financial advice. Always DYOR.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Trending pools tab */}
        {activeTab === 'trending' && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <p className="text-sm font-semibold">Live Solana Pools</p>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock size={11} />
                <span className="font-mono">GeckoTerminal</span>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse ml-1" />
              </span>
            </div>

            {trendingLoading && (
              <div className="p-8 flex items-center justify-center">
                <Loader2 size={24} className="text-primary animate-spin" />
              </div>
            )}

            {!trendingLoading && trendingError && (
              <div className="p-8 flex flex-col items-center justify-center text-red-400">
                <AlertCircle size={22} className="mb-2" />
                <p className="text-sm font-medium">Failed to load active pools</p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">{(trendingError as Error).message || 'Please try again.'}</p>
                <button
                  onClick={() => refetchTrending()}
                  className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground"
                >
                  Retry
                </button>
              </div>
            )}

            {!trendingLoading && !trendingError && (
              <div className="divide-y divide-border">
                {(trendingPools ?? []).slice(0, 15).map((pool, i) => {
                  const a = pool.attributes
                  const price = parseFloat(a.base_token_price_usd ?? '0')
                  const vol24 = parseFloat(a.volume_usd?.h24 ?? '0')
                  const ch24 = parseFloat(a.price_change_percentage?.h24 ?? '0')
                  const liq = parseFloat(a.reserve_in_usd ?? '0')
                  const buys = a.transactions?.h24?.buys ?? 0
                  const sells = a.transactions?.h24?.sells ?? 0
                  const nameParts = (a.name ?? '').split(' / ')
                  const tokenName2 = nameParts[0] ?? a.name
                  const isPositive = ch24 >= 0

                  return (
                    <div key={pool.id} className="p-4 flex items-center gap-4 hover:bg-secondary/30 transition-colors">
                      <span className="text-[10px] font-mono text-muted-foreground w-4 shrink-0">{i + 1}</span>
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 border border-border flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-foreground">{tokenName2.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{tokenName2}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">{a.address.slice(0, 8)}...</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-mono font-bold text-foreground">${price < 0.001 ? price.toExponential(2) : price.toFixed(4)}</p>
                        <p className={cn('text-[11px] font-mono font-bold', isPositive ? 'text-green-400' : 'text-red-400')}>
                          {isPositive ? '+' : ''}{ch24.toFixed(1)}%
                        </p>
                      </div>
                      <div className="text-right shrink-0 hidden sm:block">
                        <p className="text-[10px] text-muted-foreground">Vol 24h</p>
                        <p className="text-xs font-mono text-foreground">{vol24 >= 1_000_000 ? `$${(vol24/1_000_000).toFixed(1)}M` : vol24 >= 1000 ? `$${(vol24/1000).toFixed(0)}K` : `$${vol24.toFixed(0)}`}</p>
                      </div>
                      <div className="shrink-0 text-right hidden md:block">
                        <div className="flex gap-1 text-[9px] font-mono">
                          <span className="bg-green-500/10 text-green-400 px-1 py-0.5 rounded">B:{buys}</span>
                          <span className="bg-red-500/10 text-red-400 px-1 py-0.5 rounded">S:{sells}</span>
                        </div>
                        <p className="text-[9px] text-muted-foreground mt-0.5">Liq: {liq >= 1_000_000 ? `$${(liq/1_000_000).toFixed(1)}M` : `$${(liq/1000).toFixed(0)}K`}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


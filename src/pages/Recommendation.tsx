import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Sparkles, TrendingUp, TrendingDown, Eye, AlertTriangle,
  CheckCircle, XCircle, BarChart2, Shield, MessageSquare,
  BrainCircuit, ExternalLink, RefreshCw, Zap, Activity
} from 'lucide-react'
import toast from 'react-hot-toast'
import Header from '../components/layout/Header'
import { getAccessToken } from '../lib/auth'
import { useAuth } from '../components/auth/AuthGuard'
import { fetchSignalEvents, type SignalEvent } from '../lib/api'
import { cn } from '../lib/utils'
import { buildAddressHref, getInitialTokenAddress, persistTokenAddress } from '../lib/token-context'

type OverallVerdict = 'strong_buy' | 'buy' | 'watch' | 'avoid' | 'strong_avoid'

interface AIVerdict {
  model: string
  verdict: 'buy' | 'watch' | 'avoid'
  confidence: number
  reasoning: string
  keyFactors: string[]
  priceTarget?: string
  riskWarnings: string[]
}

interface AIAnalysisResponse {
  verdict: AIVerdict
  onChainData: any
  providerName: string
}

const ANALYSIS_CACHE_KEY = 'memescout:latest-ai-analysis'

function formatNum(n: number): string {
  if (!n || isNaN(n)) return '$—'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

async function fetchAIAnalysis(address: string): Promise<AIAnalysisResponse> {
  const token = await getAccessToken()
  const res = await fetch('/api/ai/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ address }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Analysis failed')
  return data
}

function buildReportFromAI(address: string, ai: AIAnalysisResponse) {
  const pair = ai.onChainData?.dex?.pairs?.[0]
  const rug = ai.onChainData?.rug

  const safeScore = rug ? Math.max(0, 100 - (rug.score_normalised ?? 50)) : 50
  const vol24 = pair?.volume?.h24 ?? 0
  const liqUsd = pair?.liquidity?.usd ?? 0
  const ch24 = pair?.priceChange?.h24 ?? 0
  const buys = pair?.txns?.h24?.buys ?? 0
  const sells = pair?.txns?.h24?.sells ?? 0
  const mc = pair?.marketCap ?? pair?.fdv ?? 0

  const dangerRisks = (rug?.risks ?? []).filter((r: any) => r.level === 'danger').map((r: any) => r.name)
  const warnRisks = (rug?.risks ?? []).filter((r: any) => r.level === 'warn').map((r: any) => r.name)

  // Derive overall verdict from AI verdict + on-chain
  const aiConf = ai.verdict.confidence
  const socialScore = Math.min(100, 40 + (buys > 100 ? 30 : 10) + (sells < buys ? 15 : 0) + (vol24 > 500_000 ? 15 : 0))
  const confScore = Math.round((safeScore * 0.3) + (aiConf * 0.3) + (socialScore * 0.2) + (liqUsd > 100_000 ? 10 : 3) + (ch24 > 0 ? 10 : 0))

  let overallVerdict: OverallVerdict
  if (ai.verdict.verdict === 'buy' && confScore >= 65) overallVerdict = 'strong_buy'
  else if (ai.verdict.verdict === 'buy') overallVerdict = 'buy'
  else if (ai.verdict.verdict === 'watch') overallVerdict = 'watch'
  else if (confScore >= 30) overallVerdict = 'avoid'
  else overallVerdict = 'strong_avoid'

  const actions: string[] = ai.verdict.riskWarnings.map(w => `⚠️ ${w}`)
  if (dangerRisks.length > 0) actions.push(`Address danger flags: ${dangerRisks.slice(0, 2).join(', ')}`)
  actions.push('Max allocation: 0.5–1% of portfolio for meme coins')
  if (liqUsd < 50_000) actions.push('Low liquidity — use limit orders, not market orders')

  const priceRaw = parseFloat(pair?.priceUsd ?? '0')
  const priceStr = priceRaw < 0.001 ? priceRaw.toExponential(3) : priceRaw.toFixed(6)

  return {
    address,
    tokenName: pair?.baseToken?.name ?? `Token ${address.slice(0, 8)}`,
    tokenSymbol: pair?.baseToken?.symbol ?? '?',
    overallVerdict,
    confidenceScore: confScore,
    safetyScore: safeScore,
    socialScore,
    riskScore: 100 - safeScore,
    summary: ai.verdict.reasoning,
    actionItems: actions.slice(0, 6),
    rugScore: rug?.score_normalised ?? 50,
    modelVerdicts: [{ model: ai.providerName, verdict: ai.verdict.verdict.toUpperCase(), conf: aiConf }],
    price: priceStr,
    vol24h: formatNum(vol24),
    marketCap: formatNum(mc),
    liquidity: formatNum(liqUsd),
    priceChange24h: ch24,
    dexUrl: pair?.url ?? `https://dexscreener.com/solana/${address}`,
    dangerRisks,
    warnRisks,
    pair,
    rug,
    buys,
    sells,
  }
}

type Report = ReturnType<typeof buildReportFromAI>

const verdictConfig = {
  strong_buy: { label: 'STRONG BUY', icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-400/15', border: 'border-green-400/40', desc: 'High conviction entry opportunity' },
  buy: { label: 'BUY', icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/30', desc: 'Favorable risk/reward setup' },
  watch: { label: 'WATCH', icon: Eye, color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30', desc: 'Monitor before entering' },
  avoid: { label: 'AVOID', icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/30', desc: 'Risk outweighs reward' },
  strong_avoid: { label: 'STRONG AVOID', icon: XCircle, color: 'text-red-400', bg: 'bg-red-400/15', border: 'border-red-400/40', desc: 'High rug risk — avoid' },
}

const modelColors: Record<string, string> = { 'GPT-4o': 'text-green-400', 'Claude 3.5': 'text-amber-400', 'Gemini 1.5': 'text-blue-400' }

function formatEventLabel(eventType: string): string {
  return eventType.replace(/_/g, ' ').toUpperCase()
}

function SignalTimeline({ events }: { events: SignalEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Activity size={14} className="text-primary" />
          <p className="text-sm font-semibold">Signal Timeline</p>
        </div>
        <p className="text-xs text-muted-foreground">Belum ada perubahan signal yang terekam untuk token ini.</p>
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={14} className="text-primary" />
        <p className="text-sm font-semibold">Signal Timeline</p>
      </div>
      <div className="space-y-2">
        {events.slice(0, 5).map(event => (
          <div key={event.id} className="rounded-lg border border-border bg-background/60 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-semibold text-foreground">{formatEventLabel(event.event_type)}</span>
              <span className="text-[10px] text-muted-foreground font-mono">{new Date(event.created_at).toLocaleTimeString()}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-mono text-muted-foreground">
              {event.previous_verdict && event.current_verdict && <span>{event.previous_verdict} → {event.current_verdict}</span>}
              {typeof event.delta_score === 'number' && <span>Δ score {event.delta_score >= 0 ? '+' : ''}{event.delta_score}</span>}
              {typeof event.confidence === 'number' && <span>conf {event.confidence}%</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ScoreRing({ value, label, color }: { value: number; label: string; color: string }) {
  const r = 32
  const circ = 2 * Math.PI * r
  const offset = circ - (value / 100) * circ
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={r} fill="none" stroke="hsl(220 13% 18%)" strokeWidth="6" />
          <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset} className="transition-all duration-700" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold font-mono" style={{ color }}>{value}</span>
        </div>
      </div>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider text-center">{label}</span>
    </div>
  )
}

export default function Recommendation() {
  const { user } = useAuth()
  const initialAddress = getInitialTokenAddress()
  const [address, setAddress] = useState(initialAddress)
  const [activeAddress, setActiveAddress] = useState(initialAddress)

  const [cachedResult, setCachedResult] = useState<AIAnalysisResponse | null>(null)

  const {
    data: aiResult,
    isLoading,
    error: aiError,
    refetch,
  } = useQuery({
    queryKey: ['recommendation', activeAddress],
    queryFn: () => fetchAIAnalysis(activeAddress),
    enabled: activeAddress.length > 20 && !cachedResult,
    staleTime: 60_000,
    retry: false,
  })

  const { data: signalEvents = [] } = useQuery({
    queryKey: ['recommendation', 'signal-events', activeAddress],
    queryFn: () => fetchSignalEvents(activeAddress, 10),
    enabled: activeAddress.length > 20,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  })

  const resolvedResult = cachedResult ?? aiResult ?? null
  const report: Report | null = resolvedResult ? buildReportFromAI(activeAddress, resolvedResult) : null
  const verdict = report ? verdictConfig[report.overallVerdict] : null

  useEffect(() => {
    if (aiError && !isLoading) {
      toast.error((aiError as Error).message ?? 'AI analysis failed')
    }
  }, [aiError, isLoading])

  useEffect(() => {
    if (!activeAddress) return
    try {
      const raw = window.sessionStorage.getItem(ANALYSIS_CACHE_KEY)
      if (!raw) {
        setCachedResult(null)
        return
      }
      const parsed = JSON.parse(raw) as { address?: string; ts?: number; result?: AIAnalysisResponse }
      const isFresh = typeof parsed.ts === 'number' && (Date.now() - parsed.ts) < 10 * 60 * 1000
      if (parsed.address === activeAddress && parsed.result && isFresh) {
        setCachedResult(parsed.result)
      } else {
        setCachedResult(null)
      }
    } catch {
      setCachedResult(null)
    }
  }, [activeAddress])

  const handleAnalyze = () => {
    if (address.length > 20) {
      const normalized = address.trim()
      setActiveAddress(normalized)
      persistTokenAddress(normalized)
    } else {
      toast.error('Enter a valid token address')
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Final Recommendation" subtitle="LLM final analyzer: expert reasoning dari semua sinyal & risk" />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Input */}
        <div className="bg-card border border-border rounded-xl p-4 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Token Address</p>
              <div className="flex gap-2">
                <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2 flex-1">
                  <Zap size={13} className="text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    placeholder="Solana mint address..."
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                    className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1 font-mono"
                  />
                </div>
              </div>
            </div>
            <button
              onClick={handleAnalyze}
              disabled={isLoading || address.length < 20}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
            >
              {isLoading ? <><RefreshCw size={16} className="animate-spin" />Generating...</> : <><Sparkles size={16} />Generate Report</>}
            </button>
          </div>
        </div>

        {/* Generating animation */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mb-4 animate-pulse">
              <Sparkles size={28} className="text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground">Generating Final Report...</p>
            <p className="text-xs text-muted-foreground mt-2 text-center max-w-xs">Fetching on-chain data and running AI analysis</p>
          </div>
        )}

        {/* Report */}
        {report && verdict && !isLoading && (
          <div className="space-y-6 animate-fade-in-up">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart2 size={14} className="text-primary" />
                <p className="text-sm font-semibold">Executive Entry Brief</p>
                {cachedResult && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-mono">
                    Synced from Analyzer
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground font-mono">{new Date().toLocaleTimeString()}</span>
                <a href={report.dexUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={11} className="text-muted-foreground hover:text-foreground transition-colors" />
                </a>
                <button
                  onClick={() => {
                    setCachedResult(null)
                    refetch()
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Recompute with latest LLM run"
                >
                  <RefreshCw size={11} />
                </button>
              </div>
            </div>

            {/* Main verdict banner */}
            <div className={cn('rounded-2xl border p-6 relative overflow-hidden', verdict.bg, verdict.border)}>
              <div className="absolute top-0 right-0 opacity-5 pointer-events-none">
                <verdict.icon size={192} className={verdict.color} />
              </div>
              <div className="relative">
                <div className="flex items-start justify-between mb-4 flex-wrap gap-4">
                  <div>
                    <div className={cn('inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border font-mono font-bold text-sm mb-3', verdict.bg, verdict.border, verdict.color)}>
                      <verdict.icon size={14} />
                      {verdict.label}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 border border-border flex items-center justify-center">
                        <span className="text-sm font-bold text-foreground">{report.tokenSymbol.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="font-bold text-lg text-foreground">{report.tokenName}</p>
                        <p className="text-sm text-muted-foreground font-mono">${report.tokenSymbol}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground mb-1">Confidence Score</p>
                    <p className={cn('text-3xl font-bold font-mono', verdict.color)}>{report.confidenceScore}%</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{verdict.desc}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Confidence v2: evidence, agreement, stability, and historical edge</p>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-4 gap-3 py-3 border-y border-white/10 mb-4">
                  {[
                    { label: 'Price', value: `$${report.price}` },
                    { label: 'Vol 24h', value: report.vol24h },
                    { label: 'Market Cap', value: report.marketCap },
                    { label: 'Liquidity', value: report.liquidity },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <p className="text-[9px] text-muted-foreground uppercase">{s.label}</p>
                      <p className="text-xs font-mono font-bold text-foreground">{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Score rings */}
                <div className="flex justify-around py-3 border-b border-white/10 mb-4">
                  <ScoreRing value={report.safetyScore} label="Safety" color="#22c55e" />
                  <ScoreRing value={report.socialScore} label="Social" color="#895AF6" />
                  <ScoreRing value={report.confidenceScore} label="AI Conf." color="#eab308" />
                  <ScoreRing value={Math.max(0, 100 - report.riskScore)} label="Risk Profile" color="#38bdf8" />
                </div>

                <p className="text-sm text-foreground/90 leading-relaxed">{report.summary}</p>
              </div>
            </div>

            {/* AI model verdicts */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <BrainCircuit size={14} className="text-accent" />
                <p className="text-sm font-semibold">LLM Final Reasoning</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {report.modelVerdicts.map(mv => {
                  const vColor = mv.verdict === 'BUY' ? 'text-green-400' : mv.verdict === 'WATCH' ? 'text-yellow-400' : 'text-red-400'
                  const vBg = mv.verdict === 'BUY' ? 'bg-green-400/10 border-green-400/20' : mv.verdict === 'WATCH' ? 'bg-yellow-400/10 border-yellow-400/20' : 'bg-red-400/10 border-red-400/20'
                  const mColor = modelColors[mv.model] || 'text-foreground'
                  return (
                    <div key={mv.model} className={cn('rounded-xl border p-3', vBg)}>
                      <div className="flex items-center justify-between mb-2">
                        <span className={cn('text-xs font-semibold', mColor)}>{mv.model}</span>
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono', vBg, vColor)}>{mv.verdict}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', vColor.replace('text-', 'bg-'))} style={{ width: `${mv.conf}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">{mv.conf}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Action checklist */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle size={14} className="text-primary" />
                <p className="text-sm font-semibold">Action Checklist</p>
              </div>
              <div className="space-y-2.5">
                {report.actionItems.slice(0, 3).map((item, i) => (
                  <div key={i} className="flex items-start gap-3 animate-fade-in-up" style={{ animationDelay: `${i * 80}ms` }}>
                    <div className="w-5 h-5 rounded-full border border-primary/40 bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[9px] font-bold text-primary font-mono">{i + 1}</span>
                    </div>
                    <p className="text-sm text-foreground/90">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <SignalTimeline events={signalEvents} />

            {/* Executive highlights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Shield size={14} className="text-yellow-400" />
                  <p className="text-sm font-semibold">Top Risk Flags</p>
                </div>
                <div className="space-y-1.5">
                  {(report.rug?.risks?.slice(0, 3) ?? []).map((r: any, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground truncate pr-2">{r.name}</span>
                      <span className={cn('text-[10px] font-mono', r.level === 'danger' ? 'text-red-400' : 'text-yellow-400')}>
                        {r.level.toUpperCase()}
                      </span>
                    </div>
                  ))}
                  {(report.rug?.risks?.length ?? 0) === 0 && (
                    <p className="text-xs text-green-400">No major risk flag detected</p>
                  )}
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare size={14} className="text-accent" />
                  <p className="text-sm font-semibold">Market Snapshot</p>
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: 'Buy Pressure', value: `${report.pair?.txns?.h24?.buys ?? 0} buys` },
                    { label: 'Sell Pressure', value: `${report.pair?.txns?.h24?.sells ?? 0} sells` },
                    { label: '24h Change', value: `${report.priceChange24h >= 0 ? '+' : ''}${report.priceChange24h.toFixed(1)}%` },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{s.label}</span>
                      <span className="text-xs font-mono font-bold text-foreground">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Cross-page actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <a href={buildAddressHref('/scanner', activeAddress)} className="bg-card border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground">Back to Opportunities</a>
              <a href={buildAddressHref('/wallet', activeAddress)} className="bg-card border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground">Open Risk Checks</a>
              <a href={buildAddressHref('/social', activeAddress)} className="bg-card border border-border rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground">Open Social Pulse</a>
            </div>

            {/* Disclaimer */}
            <div className="flex items-start gap-2 bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-3">
              <AlertTriangle size={14} className="text-yellow-400 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                <strong className="text-yellow-400">DISCLAIMER:</strong> LLM final analyzer memberi expert reasoning berbasis data live, tetap bukan financial advice.
              </p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!report && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Sparkles size={40} className="mb-4 opacity-30" />
            <p className="text-sm font-medium">Enter a token address to generate a live report</p>
            <p className="text-xs mt-1 opacity-60">Fetches real-time on-chain data + AI analysis</p>
            {!user && (
              <p className="text-xs mt-2 text-yellow-400/70">Sign in to use AI analysis features</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

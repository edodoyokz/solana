import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BrainCircuit, Sparkles, TrendingUp, TrendingDown, Eye,
  Loader2, CheckCircle, AlertTriangle, ChevronDown, ChevronUp,
  Cpu, Zap, RefreshCw, ExternalLink
} from 'lucide-react'
import toast from 'react-hot-toast'
import Header from '../components/layout/Header'
import { fetchAnalysis, type AnalysisResult } from '../lib/api'
import { getAccessToken } from '../lib/auth'
import { useAuth } from '../components/auth/AuthGuard'
import { cn } from '../lib/utils'
import { buildAddressHref, getInitialTokenAddress, persistTokenAddress } from '../lib/token-context'

function formatNum(n: number): string {
  if (!n || isNaN(n)) return '—'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

// ─── Types ──────────────────────────────────────────────────

type Verdict = 'buy' | 'watch' | 'avoid'

interface AIVerdict {
  model: string
  verdict: Verdict
  confidence: number
  reasoning: string
  keyFactors: string[]
  priceTarget?: string
  riskWarnings: string[]
}

interface AIAnalysisResponse {
  verdict: AIVerdict
  onChainData: AnalysisResult
  providerName: string
}

const ANALYSIS_CACHE_KEY = 'memescout:latest-ai-analysis'

// ─── AI Analysis Fetch ──────────────────────────────────────

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

// ─── Config ──────────────────────────────────────────────────

const verdictConfig = {
  buy: { icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-400/15', border: 'border-green-400/30', label: 'BUY' },
  watch: { icon: Eye, color: 'text-yellow-400', bg: 'bg-yellow-400/15', border: 'border-yellow-400/30', label: 'WATCH' },
  avoid: { icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-400/15', border: 'border-red-400/30', label: 'AVOID' },
}

function ConfBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color.replace('text-', 'bg-'))} style={{ width: `${value}%` }} />
      </div>
      <span className={cn('text-xs font-mono font-bold w-8 text-right', color)}>{value}%</span>
    </div>
  )
}

function ModelCard({ analysis, index }: { analysis: AIVerdict; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const v = verdictConfig[analysis.verdict]
  const VIcon = v.icon

  const modelColor = 'text-primary'
  const modelBg = 'bg-primary/5'
  const modelBorder = 'border-primary/20'

  return (
    <div className={cn('border rounded-xl overflow-hidden animate-fade-in-up', modelBg, modelBorder)} style={{ animationDelay: `${index * 120}ms` }}>
      <div className="p-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-xl border flex items-center justify-center', modelBg, modelBorder)}>
            <Cpu size={18} className={modelColor} />
          </div>
          <div>
            <p className={cn('font-semibold text-sm', modelColor)}>{analysis.model}</p>
            <p className="text-[10px] text-muted-foreground font-mono">AI Analysis</p>
          </div>
        </div>
        <span className={cn('text-xs font-bold px-2.5 py-1 rounded-lg border font-mono flex items-center gap-1', v.bg, v.color)}>
          <VIcon size={11} />{v.label}
        </span>
      </div>

      <div className="px-4 pb-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Confidence</p>
        <ConfBar value={analysis.confidence} color={modelColor} />
      </div>

      <div className="px-4 pb-3">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Key Factors</p>
        <div className="flex flex-wrap gap-1.5">
          {analysis.keyFactors.slice(0, 3).map((f, i) => (
            <span key={i} className={cn('text-[10px] px-2 py-0.5 rounded border font-mono', modelBg, modelBorder, modelColor)}>{f}</span>
          ))}
        </div>
      </div>

      {analysis.priceTarget && (
        <div className="mx-4 mb-3 px-3 py-2 bg-background/40 rounded-lg border border-border">
          <span className="text-[10px] text-muted-foreground">Target: </span>
          <span className="text-xs font-mono font-bold text-foreground">{analysis.priceTarget}</span>
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border/50"
      >
        <span>Full Analysis</span>
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/30">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 mt-3">Reasoning</p>
            <p className="text-xs text-foreground/80 leading-relaxed">{analysis.reasoning}</p>
          </div>
          {analysis.riskWarnings.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Warnings</p>
              <div className="space-y-1.5">
                {analysis.riskWarnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <AlertTriangle size={10} className="text-yellow-400 shrink-0 mt-0.5" />
                    <span className="text-xs text-yellow-400/80">{w}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────

export default function MultiAnalyzer() {
  const { user } = useAuth()
  const initialAddress = getInitialTokenAddress()
  const [address, setAddress] = useState(initialAddress)
  const [activeAddress, setActiveAddress] = useState(initialAddress)

  // Fetch on-chain data (existing)
  const { data: analysis, isLoading: dataLoading, refetch: refetchData } = useQuery({
    queryKey: ['analyze', activeAddress],
    queryFn: () => fetchAnalysis(activeAddress),
    enabled: activeAddress.length > 20,
    staleTime: 60_000,
  })

  // Fetch AI analysis (new)
  const {
    data: aiResult,
    isLoading: aiLoading,
    error: aiError,
    refetch: refetchAI,
  } = useQuery({
    queryKey: ['ai-analyze', activeAddress],
    queryFn: () => fetchAIAnalysis(activeAddress),
    enabled: !!analysis && activeAddress.length > 20,
    staleTime: 60_000,
    retry: false,
  })

  const isLoading = dataLoading || aiLoading
  const aiVerdicts = aiResult ? [aiResult.verdict] : []
  const pair = analysis?.dex?.pairs?.[0]

  const handleAnalyze = () => {
    if (address.length > 20) {
      const normalized = address.trim()
      setActiveAddress(normalized)
      persistTokenAddress(normalized)
    } else {
      toast.error('Enter a valid token address (20+ characters)')
    }
  }

  const handleRefresh = () => {
    refetchData()
    refetchAI()
  }

  useEffect(() => {
    if (aiError && !aiLoading) {
      toast.error((aiError as Error).message ?? 'AI analysis failed')
    }
  }, [aiError, aiLoading])

  useEffect(() => {
    if (!aiResult || !activeAddress) return
    try {
      window.sessionStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify({
        address: activeAddress,
        ts: Date.now(),
        result: aiResult,
      }))
    } catch {
      // noop
    }
  }, [aiResult, activeAddress])

  return (
    <div className="flex flex-col h-full">
      <Header title="AI Analyzer" subtitle="Live on-chain data analyzed by your configured AI provider" />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Token input */}
        <div className="bg-card border border-border rounded-xl p-4 mb-6">
          <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">Enter Token Address</p>
          <div className="flex gap-3 flex-col sm:flex-row">
            <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2 flex-1">
              <Zap size={14} className="text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder="Solana token mint address..."
                value={address}
                onChange={e => setAddress(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1 font-mono"
              />
            </div>
            <button
              onClick={handleAnalyze}
              disabled={isLoading || address.length < 20}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
            >
              {isLoading ? <><Loader2 size={16} className="animate-spin" />Analyzing...</> : <><BrainCircuit size={16} />Analyze Token</>}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 font-mono">
            Fetches live data from DexScreener + RugCheck, then runs AI analysis via your configured provider
          </p>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="bg-card border border-border rounded-xl p-8 flex flex-col items-center justify-center gap-3 mb-6 animate-fade-in">
            <Cpu size={24} className="text-primary animate-pulse" />
            <p className="text-sm font-semibold text-foreground">
              {dataLoading ? 'Fetching on-chain data...' : `Analyzing with ${aiResult?.providerName ?? 'AI'}...`}
            </p>
            <p className="text-xs text-muted-foreground">This may take a few seconds</p>
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {aiResult && !isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={14} className="text-primary" />
                <p className="text-sm font-semibold">Analysis Complete</p>
                {pair && (
                  <span className="text-[10px] font-mono text-muted-foreground ml-auto flex items-center gap-1">
                    <Zap size={10} />{pair.baseToken.name} · {pair.baseToken.symbol}
                  </span>
                )}
              </div>

              {/* Token summary bar */}
              {pair && (
                <div className="bg-card border border-border rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: 'Price', value: `$${parseFloat(pair.priceUsd ?? '0') < 0.001 ? parseFloat(pair.priceUsd ?? '0').toExponential(2) : parseFloat(pair.priceUsd ?? '0').toFixed(6)}` },
                    { label: 'Vol 24h', value: formatNum(pair.volume?.h24 ?? 0) },
                    { label: 'Market Cap', value: formatNum(pair.marketCap ?? pair.fdv ?? 0) },
                    { label: 'Liquidity', value: formatNum(pair.liquidity?.usd ?? 0) },
                  ].map(s => (
                    <div key={s.label} className="text-center">
                      <p className="text-[9px] text-muted-foreground uppercase">{s.label}</p>
                      <p className="text-xs font-mono font-bold text-foreground">{s.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {aiVerdicts.map((v, i) => <ModelCard key={v.model} analysis={v} index={i} />)}
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              {/* Verdict Summary */}
              <div className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles size={14} className="text-accent" />
                  <p className="text-sm font-semibold">AI Verdict</p>
                </div>
                <div className="space-y-3">
                  <div className={cn(
                    'text-center py-3 rounded-xl border',
                    verdictConfig[aiResult.verdict.verdict].bg,
                    verdictConfig[aiResult.verdict.verdict].border,
                  )}>
                    <p className={cn('text-2xl font-bold font-mono', verdictConfig[aiResult.verdict.verdict].color)}>
                      {verdictConfig[aiResult.verdict.verdict].label}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Confidence</span>
                      <span className="font-mono font-bold text-foreground">{aiResult.verdict.confidence}%</span>
                    </div>
                    <div className="h-2 bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${aiResult.verdict.confidence}%` }} />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Provider: <span className="text-foreground font-mono">{aiResult.providerName}</span>
                  </p>
                </div>
              </div>

              {/* RugCheck summary */}
              {analysis?.rug && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3">Safety</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">RugCheck Score</span>
                      <span className={cn('text-xs font-mono font-bold', (100 - analysis.rug.score_normalised) >= 70 ? 'text-green-400' : (100 - analysis.rug.score_normalised) >= 40 ? 'text-yellow-400' : 'text-red-400')}>
                        {100 - analysis.rug.score_normalised}/100
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Risk Flags</span>
                      <span className="text-xs font-mono font-bold text-red-400">{analysis.rug.risks?.length ?? 0}</span>
                    </div>
                    {(analysis.rug.risks ?? []).slice(0, 3).map((r, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <AlertTriangle size={10} className="text-yellow-400 shrink-0 mt-0.5" />
                        <span className="text-[10px] text-muted-foreground">{r.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Next actions */}
              {pair && (
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={buildAddressHref('/wallet', activeAddress)}
                    className="flex items-center justify-center gap-2 bg-card border border-border rounded-xl p-3 text-xs text-muted-foreground hover:text-foreground transition-all"
                  >
                    <AlertTriangle size={12} />
                    Risk Check
                  </a>
                  <a
                    href={buildAddressHref('/recommendation', activeAddress)}
                    className="flex items-center justify-center gap-2 bg-card border border-border rounded-xl p-3 text-xs text-primary hover:text-primary hover:border-primary/30 transition-all"
                  >
                    <Sparkles size={12} />
                    Final Reasoning
                  </a>
                </div>
              )}

              {/* DexScreener link */}
              {pair && (
                <a
                  href={pair.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-card border border-border rounded-xl p-3 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
                >
                  <ExternalLink size={12} />
                  View on DexScreener
                </a>
              )}

              {/* Refetch */}
              <button
                onClick={handleRefresh}
                className="w-full flex items-center justify-center gap-2 bg-card border border-border rounded-xl p-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw size={12} />
                Refresh Data
              </button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!aiResult && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <BrainCircuit size={40} className="mb-4 opacity-30" />
            <p className="text-sm font-medium">Enter a token address to run live analysis</p>
            <p className="text-xs mt-1 opacity-60">AI will analyze real on-chain data from your configured provider</p>
            {!user && (
              <p className="text-xs mt-2 text-yellow-400/70">Sign in to use AI analysis features</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MessageCircle, Hash, TrendingUp, TrendingDown, Minus, Zap, Activity, BarChart2, ExternalLink, RefreshCw, Globe, MessageSquareText } from 'lucide-react'
import Header from '../components/layout/Header'
import { fetchSocialProfiles, fetchBoostedTokens, type DexProfile } from '../lib/api'
import { cn } from '../lib/utils'
import { getInitialTokenAddress, persistTokenAddress } from '../lib/token-context'

// Platform detection from link type/url
function detectPlatform(url: string, type?: string): 'twitter' | 'telegram' | 'discord' | 'website' | 'other' {
  if (type === 'twitter' || url.includes('twitter.com') || url.includes('x.com')) return 'twitter'
  if (type === 'telegram' || url.includes('t.me')) return 'telegram'
  if (type === 'discord' || url.includes('discord')) return 'discord'
  if (url.includes('http')) return 'website'
  return 'other'
}

const platformConfig = {
  twitter: { Icon: MessageSquareText, color: 'text-sky-400', bg: 'bg-sky-400/10 border-sky-400/20', label: 'X / Twitter' },
  telegram: { Icon: MessageCircle, color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20', label: 'Telegram' },
  discord: { Icon: Hash, color: 'text-indigo-400', bg: 'bg-indigo-400/10 border-indigo-400/20', label: 'Discord' },
  website: { Icon: Globe, color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/20', label: 'Website' },
  other: { Icon: ExternalLink, color: 'text-muted-foreground', bg: 'bg-border/50', label: 'Link' },
}

// Naive sentiment: positive keywords
function getSentiment(text: string): 'bullish' | 'bearish' | 'neutral' {
  const t = (text ?? '').toLowerCase()
  const bullWords = ['moon', 'pump', '🚀', 'gem', 'early', 'buy', 'launch', 'trending', 'ath', 'bullish', '100x', '10x', 'fire', '🔥', 'alpha']
  const bearWords = ['rug', 'scam', 'avoid', 'warning', 'caution', 'dump', 'sell', 'bearish', 'warn', '⚠️', 'danger']
  const bullScore = bullWords.filter(w => t.includes(w)).length
  const bearScore = bearWords.filter(w => t.includes(w)).length
  if (bearScore > bullScore) return 'bearish'
  if (bullScore > 0) return 'bullish'
  return 'neutral'
}

const sentimentConfig = {
  bullish: { icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/20', label: 'BULLISH' },
  bearish: { icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20', label: 'BEARISH' },
  neutral: { icon: Minus, color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/20', label: 'NEUTRAL' },
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function ProfileCard({ profile, index }: { profile: DexProfile; index: number }) {
  const sentiment = getSentiment(profile.description ?? '')
  const sentConf = sentimentConfig[sentiment]
  const SentIcon = sentConf.icon

  const socialLinks = (profile.links ?? []).filter(l => ['twitter', 'telegram', 'discord'].includes(l.type ?? detectPlatform(l.url)))
  const hasSocial = socialLinks.length > 0

  return (
    <div
      className={cn(
        'bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-all animate-fade-in-up',
        sentiment === 'bearish' && 'border-red-500/20 hover:border-red-500/40'
      )}
      style={{ animationDelay: `${index * 70}ms` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          {profile.icon && (
            <img
              src={profile.icon.startsWith('http') ? profile.icon : `https://cdn.dexscreener.com/cms/images/${profile.icon}?width=40&height=40&fit=crop&quality=95&format=auto`}
              alt=""
              className="w-8 h-8 rounded-full object-cover border border-border shrink-0"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}
          <div>
            <p className="text-xs font-semibold text-foreground font-mono">{shortAddr(profile.tokenAddress)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {hasSocial ? socialLinks.map(l => l.type ?? 'link').join(', ') : 'New Launch'}
            </p>
          </div>
        </div>
        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border font-mono flex items-center gap-1', sentConf.bg, sentConf.color)}>
          <SentIcon size={9} />
          {sentConf.label}
        </span>
      </div>

      {/* Description */}
      {profile.description && (
        <p className="text-sm text-foreground/90 leading-relaxed mb-3 line-clamp-3">
          {profile.description}
        </p>
      )}

      {/* Links */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(profile.links ?? []).slice(0, 4).map((link, i) => {
            const platform = detectPlatform(link.url, link.type)
            const conf = platformConfig[platform]
            const PIcon = conf.Icon
            return (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn('p-1 rounded border transition-colors hover:opacity-80', conf.bg)}
              >
                <PIcon size={11} className={conf.color} />
              </a>
            )
          })}
        </div>
        <a
          href={profile.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] font-mono text-muted-foreground hover:text-accent transition-colors flex items-center gap-1"
        >
          DexScreener <ExternalLink size={9} />
        </a>
      </div>
    </div>
  )
}

function SentimentMeter({ bullish, bearish, neutral }: { bullish: number; bearish: number; neutral: number }) {
  const total = Math.max(bullish + bearish + neutral, 1)
  const bullPct = (bullish / total) * 100
  const bearPct = (bearish / total) * 100
  const neutPct = (neutral / total) * 100
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Activity size={14} className="text-primary" />
        <p className="text-sm font-semibold">Sentiment Distribution</p>
      </div>
      <div className="h-3 rounded-full overflow-hidden flex mb-3">
        <div className="bg-green-500 transition-all duration-700" style={{ width: `${bullPct}%` }} />
        <div className="bg-yellow-500 transition-all duration-700" style={{ width: `${neutPct}%` }} />
        <div className="bg-red-500 transition-all duration-700" style={{ width: `${bearPct}%` }} />
      </div>
      <div className="flex justify-between text-xs">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-green-400 font-mono font-bold">{bullPct.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-500" />
          <span className="text-yellow-400 font-mono font-bold">{neutPct.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-red-400 font-mono font-bold">{bearPct.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  )
}

type SentimentFilter = 'all' | 'bullish' | 'bearish' | 'neutral'
type PlatformFilter = 'all' | 'twitter' | 'telegram' | 'discord'

export default function SocialMonitor() {
  const initialAddress = getInitialTokenAddress().toLowerCase()
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('all')
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all')

  const {
    data: profiles,
    isLoading,
    error: profilesError,
    refetch,
  } = useQuery({
    queryKey: ['social', 'profiles'],
    queryFn: fetchSocialProfiles,
    refetchInterval: 45_000,
    staleTime: 30_000,
    retry: 2,
  })

  const {
    data: boosted,
    error: boostedError,
  } = useQuery({
    queryKey: ['scanner', 'boosted'],
    queryFn: fetchBoostedTokens,
    staleTime: 30_000,
    retry: 2,
  })

  const enriched = (profiles ?? []).map(p => ({
    ...p,
    _sentiment: getSentiment(p.description ?? ''),
  }))

  const filtered = enriched
    .filter(p => !initialAddress || p.tokenAddress.toLowerCase() === initialAddress)
    .filter(p => sentimentFilter === 'all' || p._sentiment === sentimentFilter)
    .filter(p => {
      if (platformFilter === 'all') return true
      return (p.links ?? []).some(l => detectPlatform(l.url, l.type) === platformFilter)
    })

  const bullish = enriched.filter(p => p._sentiment === 'bullish').length
  const bearish = enriched.filter(p => p._sentiment === 'bearish').length
  const neutral = enriched.filter(p => p._sentiment === 'neutral').length

  // Top tokens from boosted
  const topTokens = (boosted ?? [])
    .slice(0, 6)
    .map(t => t.tokenAddress)

  return (
    <div className="flex flex-col h-full">
      <Header title="Social Monitor" subtitle="Signal pendukung: social pulse ringkas" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main feed */}
          <div className="lg:col-span-2 space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
                {(['all', 'twitter', 'telegram', 'discord'] as PlatformFilter[]).map(p => (
                  <button
                    key={p}
                    onClick={() => setPlatformFilter(p)}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors',
                      platformFilter === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >{p}</button>
                ))}
              </div>
              <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
                {(['all', 'bullish', 'bearish', 'neutral'] as SentimentFilter[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setSentimentFilter(s)}
                    className={cn(
                      'px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors',
                      sentimentFilter === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >{s}</button>
                ))}
              </div>
              <button
                onClick={() => refetch()}
                disabled={isLoading}
                className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
                {isLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {/* Live indicator */}
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[10px] text-green-400 font-mono">LIVE · {filtered.length} signals</span>
            </div>

            {/* Skeletons */}
            {isLoading && (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-full bg-border" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-border rounded w-1/3" />
                        <div className="h-2 bg-border rounded w-1/4" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 bg-border rounded" />
                      <div className="h-3 bg-border rounded w-4/5" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Cards */}
            {!isLoading && (profilesError || boostedError) && (
              <div className="flex flex-col items-center py-12 text-red-400">
                <Activity size={28} className="mb-2 opacity-80" />
                <p className="text-sm font-medium">Failed to load social signals</p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">{((profilesError || boostedError) as Error).message || 'Please try again.'}</p>
                <button
                  onClick={() => refetch()}
                  className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {!isLoading && !profilesError && !boostedError && (
              <div className="space-y-3">
                {filtered.slice(0, 12).map((profile, i) => (
                  <ProfileCard key={profile.tokenAddress} profile={profile} index={i} />
                ))}
                {filtered.length > 12 && (
                  <p className="text-[10px] text-muted-foreground text-center">Showing 12/{filtered.length} social signals (compact mode)</p>
                )}
                {filtered.length === 0 && (
                  <div className="flex flex-col items-center py-16 text-muted-foreground">
                    <MessageCircle size={32} className="mb-3 opacity-30" />
                    <p className="text-sm">No signals matching current filters</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <SentimentMeter bullish={bullish} bearish={bearish} neutral={neutral} />

            {/* Platform activity */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 size={14} className="text-accent" />
                <p className="text-sm font-semibold">Platform Breakdown</p>
              </div>
              <div className="space-y-2">
                {(['twitter', 'telegram', 'discord'] as const).map(platform => {
                  const count = (profiles ?? []).filter(p =>
                    (p.links ?? []).some(l => detectPlatform(l.url, l.type) === platform)
                  ).length
                  const conf = platformConfig[platform]
                  const PIcon = conf.Icon
                  return (
                    <div key={platform} className="flex items-center gap-3">
                      <span className={cn('p-1 rounded border', conf.bg)}>
                        <PIcon size={10} className={conf.color} />
                      </span>
                      <span className="text-xs capitalize flex-1 text-muted-foreground">{platform}</span>
                      <span className="text-xs font-mono font-bold text-foreground">{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Trending token list */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap size={14} className="text-yellow-400" />
                <p className="text-sm font-semibold">Top Boosted</p>
              </div>
              <div className="space-y-2">
                {topTokens.map((addr, i) => (
                  <a
                    key={i}
                    href={`/social?address=${addr}`}
                    onClick={() => persistTokenAddress(addr, false)}
                    className="flex items-center gap-2"
                  >
                    <span className="text-[10px] text-muted-foreground font-mono w-4">{i + 1}</span>
                    <span className="text-[11px] font-mono text-accent truncate flex-1">{addr.slice(0, 8)}...</span>
                    <span className="text-[9px] bg-green-500/10 text-green-400 px-1 rounded font-mono">LIVE</span>
                  </a>
                ))}
                {topTokens.length === 0 && <p className="text-xs text-muted-foreground">Loading...</p>}
              </div>
            </div>

            {/* Data source */}
            <div className="bg-card border border-border rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Data Sources</p>
              <div className="space-y-1.5">
                {['DexScreener token profiles', 'Token social links', 'Auto-refresh 45s'].map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-primary" />
                    <span className="text-[10px] text-muted-foreground">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


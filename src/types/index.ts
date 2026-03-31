export interface MemeToken {
  id: string
  name: string
  symbol: string
  address: string
  price: number
  priceChange24h: number
  volume24h: number
  marketCap: number
  holders: number
  liquidity: number
  age: string
  logoUrl?: string
  riskScore: number
  rugScore?: number
  socialScore?: number
  status: 'new' | 'trending' | 'watched' | 'flagged'
}

export interface SocialSignal {
  id: string
  platform: 'twitter' | 'telegram' | 'discord' | 'reddit'
  content: string
  author: string
  timestamp: string
  engagement: number
  sentiment: 'bullish' | 'bearish' | 'neutral'
  mentionedTokens: string[]
}

export interface WalletActivity {
  id: string
  address: string
  label?: string
  type: 'buy' | 'sell' | 'transfer' | 'add_liquidity' | 'remove_liquidity'
  amount: number
  token: string
  timestamp: string
  txHash: string
  usdValue: number
}

export interface RugCheckResult {
  tokenAddress: string
  score: number
  risks: RugRisk[]
  lpLocked: boolean
  mintAuthority: boolean
  freezeAuthority: boolean
  topHoldersConcentration: number
  liquidityUsd: number
  verdict: 'safe' | 'caution' | 'danger'
}

export interface RugRisk {
  name: string
  description: string
  level: 'low' | 'medium' | 'high'
  score: number
}

export interface LLMAnalysis {
  model: 'gpt-4o' | 'claude-3-5-sonnet' | 'gemini-1-5-pro'
  verdict: 'buy' | 'watch' | 'avoid'
  confidence: number
  reasoning: string
  keyFactors: string[]
  priceTarget?: string
  riskWarnings: string[]
  timestamp: string
}

export interface FinalRecommendation {
  tokenAddress: string
  token: MemeToken
  overallVerdict: 'strong_buy' | 'buy' | 'watch' | 'avoid' | 'strong_avoid'
  confidenceScore: number
  llmAnalyses: LLMAnalysis[]
  rugCheckResult: RugCheckResult
  socialSentiment: number
  summary: string
  actionItems: string[]
  generatedAt: string
}

export type RiskLevel = 'safe' | 'caution' | 'danger'

// ── AI Provider ─────────────────────────────────────────────

export interface AIProvider {
  id: string
  user_id: string
  name: string
  base_url: string
  api_key_encrypted: string | null
  model_id: string
  is_default: boolean
  max_tokens: number
  temperature: number
  created_at: string
  updated_at: string
}

export interface AIVerdict {
  model: string
  verdict: 'buy' | 'watch' | 'avoid'
  confidence: number
  reasoning: string
  keyFactors: string[]
  priceTarget?: string
  riskWarnings: string[]
}

// ── Supabase Tables ─────────────────────────────────────────

export interface Profile {
  id: string
  display_name: string | null
  preferences: Record<string, any>
  created_at: string
  updated_at: string
}

export interface AIAnalysisRecord {
  id: string
  user_id: string | null
  token_address: string
  provider_id: string | null
  verdict: 'buy' | 'watch' | 'avoid'
  confidence: number
  reasoning: string
  key_factors: string[]
  price_target: string | null
  risk_warnings: string[]
  raw_response: any
  created_at: string
}

export interface WatchlistWallet {
  id: string
  user_id: string
  wallet_address: string
  label: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ScannedToken {
  id: string
  user_id: string | null
  token_address: string
  token_name: string | null
  token_symbol: string | null
  price_usd: number | null
  price_change_24h: number | null
  volume_24h: number | null
  market_cap: number | null
  liquidity_usd: number | null
  source: string
  raw_data: any
  created_at: string
}


/**
 * Live API layer — all calls go through our backend edge function
 * which proxies DexScreener, GeckoTerminal, RugCheck, and Solana RPC.
 */

const BACKEND = "";  // Vite proxy handles /api routes

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
  return res.json();
}

// ── DexScreener / GeckoTerminal ────────────────────────────

export async function fetchBoostedTokens(): Promise<DexBoostToken[]> {
  const data = await apiFetch<{ tokens: DexBoostToken[] }>("/api/scanner/boosted?limit=40");
  return data.tokens ?? [];
}

export async function fetchLatestProfiles(): Promise<DexProfile[]> {
  const data = await apiFetch<{ profiles: DexProfile[] }>("/api/scanner/latest-profiles");
  return data.profiles ?? [];
}

export async function fetchTrendingPools(): Promise<GeckoPool[]> {
  const data = await apiFetch<{ data: GeckoPool[] }>("/api/scanner/trending");
  return data.data ?? [];
}

export async function fetchNewPools(): Promise<GeckoPool[]> {
  const data = await apiFetch<{ data: GeckoPool[] }>("/api/scanner/new-pools");
  return data.data ?? [];
}

export async function fetchPairData(address: string): Promise<DexPairsResponse> {
  return apiFetch<DexPairsResponse>(`/api/scanner/pair?address=${address}`);
}

export async function fetchSocialProfiles(): Promise<DexProfile[]> {
  const data = await apiFetch<{ profiles: DexProfile[] }>("/api/social/latest");
  return data.profiles ?? [];
}

// ── RugCheck ────────────────────────────────────────────────

export async function fetchRugReport(mint: string): Promise<RugReport> {
  return apiFetch<RugReport>(`/api/rugcheck/${mint}`);
}

export async function fetchRugSummary(mint: string): Promise<RugSummary> {
  return apiFetch<RugSummary>(`/api/rugcheck/${mint}/summary`);
}

export async function fetchRecentlyChecked(): Promise<RugRecentToken[]> {
  const data = await apiFetch<RugRecentToken[]>("/api/rugcheck/recent");
  return Array.isArray(data) ? data : [];
}

// ── Solana RPC ──────────────────────────────────────────────

export async function fetchWalletTx(address: string): Promise<SolanaSignature[]> {
  const data = await apiFetch<{ result: SolanaSignature[] }>(`/api/wallet/transactions?address=${address}`);
  return data.result ?? [];
}

// ── Combined analyzer ───────────────────────────────────────

export async function fetchAnalysis(address: string): Promise<AnalysisResult> {
  return apiFetch<AnalysisResult>(`/api/analyze?address=${address}`);
}

export interface RankedSignalFilters {
  minScore?: number
  minLiquidity?: number
  verdict?: SignalVerdict | 'all'
}

export async function fetchRankedSignals(limit = 20, filters: RankedSignalFilters = {}): Promise<TokenSignal[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (typeof filters.minScore === 'number') params.set('min_score', String(filters.minScore))
  if (typeof filters.minLiquidity === 'number') params.set('min_liquidity', String(filters.minLiquidity))
  if (filters.verdict && filters.verdict !== 'all') params.set('verdict', filters.verdict)

  const data = await apiFetch<{ signals: TokenSignal[] }>(`/api/signals/ranked?${params.toString()}`)
  return data.signals ?? []
}

export async function fetchTokenSignal(address: string): Promise<TokenSignal> {
  const data = await apiFetch<{ signal: TokenSignal }>(`/api/signals/${address}`)
  return data.signal
}

export interface SignalPerformanceSummary {
  snapshots: number
  hitRate: number
  avgReturn1h: number
  avgReturn24h: number
  falsePositiveRate: number
}

export async function fetchSignalPerformance(): Promise<SignalPerformanceSummary> {
  const data = await apiFetch<{ summary: SignalPerformanceSummary }>(`/api/signals/performance`)
  return data.summary
}

export interface SignalEvent {
  id: string
  token_address: string
  event_type: string
  previous_verdict: string | null
  current_verdict: string | null
  previous_score: number | null
  current_score: number | null
  delta_score: number | null
  confidence: number | null
  created_at: string
}

export async function fetchSignalEvents(tokenAddress?: string, limit = 10): Promise<SignalEvent[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (tokenAddress) params.set('token_address', tokenAddress)
  const data = await apiFetch<{ events: SignalEvent[] }>(`/api/signals/events?${params.toString()}`)
  return data.events ?? []
}

// ── Types ───────────────────────────────────────────────────

export interface DexBoostToken {
  chainId: string;
  tokenAddress: string;
  url: string;
  description?: string;
  icon?: string;
  header?: string;
  links?: DexLink[];
  totalAmount?: number;
  amount?: number;
}

export interface DexProfile {
  chainId: string;
  tokenAddress: string;
  url: string;
  description?: string;
  icon?: string;
  header?: string;
  openGraph?: string;
  links?: DexLink[];
  cto?: boolean;
}

export interface DexLink {
  type?: string;
  label?: string;
  url: string;
}

export interface DexPairsResponse {
  schemaVersion: string;
  pairs: DexPair[] | null;
}

export interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceNative: string;
  priceUsd?: string;
  txns: { m5: TxCount; h1: TxCount; h6: TxCount; h24: TxCount };
  volume: { h24: number; h6: number; h1: number; m5: number };
  priceChange: { m5?: number; h1?: number; h6?: number; h24?: number };
  liquidity?: { usd: number; base: number; quote: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string; websites?: any[]; socials?: any[] };
}

interface TxCount { buys: number; sells: number }

export interface GeckoPool {
  id: string;
  type: string;
  attributes: {
    base_token_price_usd: string;
    base_token_price_native_currency: string;
    quote_token_price_usd: string;
    name: string;
    address: string;
    token_price_usd?: string;
    reserve_in_usd: string;
    fdv_usd: string | null;
    market_cap_usd: string | null;
    price_change_percentage: { m5: string; h1: string; h6: string; h24: string };
    transactions: {
      m5: { buys: number; sells: number; buyers: number; sellers: number };
      h1: { buys: number; sells: number; buyers: number; sellers: number };
      h24: { buys: number; sells: number; buyers: number; sellers: number };
    };
    volume_usd: { m5: string; h1: string; h6: string; h24: string };
    pool_created_at: string;
  };
  relationships?: {
    base_token?: { data: { id: string; type: string } };
    dex?: { data: { id: string; type: string } };
  };
}

export interface RugReport {
  mint: string;
  score: number;
  score_normalised: number;
  risks: RugRiskItem[];
  topHolders: RugHolder[];
  mintAuthority: string | null;
  freezeAuthority: string | null;
  tokenMeta?: { name: string; symbol: string; uri: string; mutable: boolean };
  markets?: RugMarket[];
  token?: { supply: number; decimals: number };
}

export interface RugSummary {
  mint: string;
  score: number;
  score_normalised: number;
  risks: RugRiskItem[];
}

export interface RugRiskItem {
  name: string;
  description: string;
  value: string;
  score: number;
  level: "danger" | "warn" | "info";
}

export interface RugHolder {
  address: string;
  amount: number;
  decimals: number;
  pct: number;
  uiAmount: number;
  insider: boolean;
  owner: string;
}

export interface RugMarket {
  pubkey: string;
  marketType: string;
  lp?: {
    lpLocked: number;
    lpUnlocked: number;
    lpLockedPct: number;
    lpLockedUSD: number;
    liquidityA?: string;
    liquidityB?: string;
  };
}

export interface RugRecentToken {
  mint: string;
  score: number;
  score_normalised: number;
  name?: string;
  symbol?: string;
}

export interface SolanaSignature {
  signature: string;
  slot: number;
  err: any;
  memo: string | null;
  blockTime: number | null;
}

export interface AnalysisResult {
  dex: DexPairsResponse | null;
  rug: RugSummary | null;
  gecko: any;
}

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


import { getDefaultProvider, getProvider, decryptApiKey, type AIProviderRecord } from './ai-providers';
import { supabase } from './supabase';

const DEX_BASE = "https://api.dexscreener.com";
const RUGCHECK_BASE = "https://api.rugcheck.xyz/v1";
const GECKO_BASE = "https://api.geckoterminal.com/api/v2";

// ── Types ───────────────────────────────────────────────────

interface AIVerdict {
  model: string;
  verdict: 'buy' | 'watch' | 'avoid';
  confidence: number;
  reasoning: string;
  keyFactors: string[];
  priceTarget?: string;
  riskWarnings: string[];
}

interface OnChainData {
  dex: any;
  rug: any;
  gecko: any;
}

// ── Fetch on-chain data ─────────────────────────────────────

async function fetchOnChainData(address: string): Promise<OnChainData> {
  function timeout(ms: number) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, clear: () => clearTimeout(id) };
  }

  const [dexRes, rugRes, geckoRes] = await Promise.allSettled([
    fetch(`${DEX_BASE}/latest/dex/tokens/${address}`, { signal: timeout(8000).signal }),
    fetch(`${RUGCHECK_BASE}/tokens/${address}/report/summary`, { signal: timeout(8000).signal }),
    fetch(`${GECKO_BASE}/networks/solana/tokens/${address}`, {
      signal: timeout(8000).signal,
      headers: { Accept: "application/json;version=20230302" },
    }),
  ]);

  const dex = dexRes.status === "fulfilled" && dexRes.value.ok
    ? await dexRes.value.json().catch(() => null)
    : null;
  const rug = rugRes.status === "fulfilled" && rugRes.value.ok
    ? await rugRes.value.json().catch(() => null)
    : null;
  const gecko = geckoRes.status === "fulfilled" && geckoRes.value.ok
    ? await geckoRes.value.json().catch(() => null)
    : null;

  return { dex, rug, gecko };
}

// ── Build analysis prompt ───────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a senior Solana memecoin risk analyst. Analyze the provided market + on-chain data and return a strict JSON verdict for ENTRY DECISION SUPPORT.

You MUST respond with ONLY valid JSON matching this exact schema:
{
  "verdict": "buy" | "watch" | "avoid",
  "confidence": <number 0-100>,
  "reasoning": "<string: 2-4 sentence analysis>",
  "keyFactors": ["<factor1>", "<factor2>", "<factor3>", "<factor4>"],
  "priceTarget": "<string or null>",
  "riskWarnings": ["<warning1>", "<warning2>"]
}

Decision framework:
- "buy" = favorable risk/reward AND no critical red flags.
- "watch" = mixed setup, insufficient confirmation, or moderate risk.
- "avoid" = high rug/manipulation risk, poor structure, or severe uncertainty.

Hard-risk rules (apply strictly):
- If RugCheck has danger-level risks or authority-related critical flags, bias strongly to "avoid".
- If liquidity is very low relative to market cap, bias to "avoid".
- If buy pressure is extreme with weak liquidity/depth signal, treat as possible manipulation and avoid aggressive "buy".
- If core data is missing/contradictory, prefer conservative verdict ("watch" or "avoid").

Reasoning rules:
- Use concrete numbers from the payload (liquidity, volume, txns, price changes, RugCheck score).
- Mention both upside context and invalidation risk in concise form.
- confidence must decrease when data quality is low or signals conflict.
- keyFactors must be 3-5 short quantitative points.
- riskWarnings must call out practical execution risks (slippage, liquidity traps, concentration risk, authority/mint risks).

Do NOT output markdown. Output JSON only.`;
}

function buildUserPrompt(data: OnChainData, address: string): string {
  const pair = data.dex?.pairs?.[0];
  const rug = data.rug;

  const sections: string[] = [];
  sections.push(`Token Address: ${address}`);

  if (pair) {
    const buys24 = Number(pair.txns?.h24?.buys ?? 0);
    const sells24 = Number(pair.txns?.h24?.sells ?? 0);
    const total24 = buys24 + sells24;
    const buyPressure24 = total24 > 0 ? ((buys24 / total24) * 100).toFixed(1) : '50.0';
    const liquidity = Number(pair.liquidity?.usd ?? 0);
    const marketCap = Number(pair.marketCap ?? pair.fdv ?? 0);
    const liqToMc = marketCap > 0 ? ((liquidity / marketCap) * 100).toFixed(2) : 'N/A';

    sections.push(`\n## DexScreener Data
- Name: ${pair.baseToken?.name ?? 'Unknown'} (${pair.baseToken?.symbol ?? '?'})
- Price USD: ${pair.priceUsd ?? 'N/A'}
- Price Change: 5m=${pair.priceChange?.m5 ?? 'N/A'}%, 1h=${pair.priceChange?.h1 ?? 'N/A'}%, 6h=${pair.priceChange?.h6 ?? 'N/A'}%, 24h=${pair.priceChange?.h24 ?? 'N/A'}%
- Volume 24h: $${pair.volume?.h24 ?? 0}
- Market Cap: $${pair.marketCap ?? pair.fdv ?? 0}
- FDV: $${pair.fdv ?? 0}
- Liquidity: $${pair.liquidity?.usd ?? 0}
- Liquidity/MarketCap Ratio: ${liqToMc}%
- Transactions 24h: buys=${buys24}, sells=${sells24}, buyPressure=${buyPressure24}%
- Transactions 1h: buys=${pair.txns?.h1?.buys ?? 0}, sells=${pair.txns?.h1?.sells ?? 0}
- Pair Created: ${pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : 'Unknown'}`);
  }

  if (rug) {
    const risks = (rug.risks ?? []).map((r: any) => `  - ${r.name} (${r.level}): ${r.description}`).join('\n');
    const dangerCount = (rug.risks ?? []).filter((r: any) => r.level === 'danger').length;
    const warnCount = (rug.risks ?? []).filter((r: any) => r.level === 'warn').length;
    sections.push(`\n## RugCheck Data
- Score: ${rug.score ?? 'N/A'} (normalized: ${rug.score_normalised ?? 'N/A'})
- Risk Summary: danger=${dangerCount}, warn=${warnCount}
- Risks:\n${risks || '  None detected'}`);
  }

  if (data.gecko?.data?.attributes) {
    const attr = data.gecko.data.attributes;
    sections.push(`\n## GeckoTerminal Data
- Pool Address: ${attr.address ?? 'N/A'}
- Price USD: ${attr.base_token_price_usd ?? 'N/A'}
- Reserve USD: ${attr.reserve_in_usd ?? 'N/A'}
- FDV: $${attr.fdv_usd ?? 'N/A'}
- Market Cap: $${attr.market_cap_usd ?? 'N/A'}
- Pool Created: ${attr.pool_created_at ?? 'N/A'}`);
  }

  const completeness = {
    hasDex: !!pair,
    hasRug: !!rug,
    hasGecko: !!data.gecko?.data?.attributes,
  };
  sections.push(`\n## Data Quality
- hasDex=${completeness.hasDex}
- hasRug=${completeness.hasRug}
- hasGecko=${completeness.hasGecko}`);

  return sections.join('\n');
}

// ── Call AI Provider ────────────────────────────────────────

async function callAI(provider: AIProviderRecord, systemPrompt: string, userPrompt: string): Promise<AIVerdict> {
  const apiKey = decryptApiKey(provider.api_key_encrypted);
  if (!apiKey) throw new Error('Provider has no API key configured');

  const baseUrl = provider.base_url.replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model_id,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: provider.max_tokens,
      temperature: provider.temperature,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI provider error (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from AI provider');

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('AI provider returned invalid JSON');
  }

  return {
    model: provider.name,
    verdict: ['buy', 'watch', 'avoid'].includes(parsed.verdict) ? parsed.verdict : 'watch',
    confidence: Math.min(100, Math.max(0, Math.round(Number(parsed.confidence) || 50))),
    reasoning: String(parsed.reasoning || 'No reasoning provided'),
    keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors.map(String) : [],
    priceTarget: parsed.priceTarget ? String(parsed.priceTarget) : undefined,
    riskWarnings: Array.isArray(parsed.riskWarnings) ? parsed.riskWarnings.map(String) : [],
  };
}

// ── Save analysis to DB ─────────────────────────────────────

async function saveAnalysis(
  userId: string | null,
  tokenAddress: string,
  providerId: string | null,
  result: AIVerdict,
  rawData: any,
) {
  const { error } = await supabase.from('ai_analyses').insert({
    user_id: userId,
    token_address: tokenAddress,
    provider_id: providerId,
    verdict: result.verdict,
    confidence: result.confidence,
    reasoning: result.reasoning,
    key_factors: result.keyFactors,
    price_target: result.priceTarget ?? null,
    risk_warnings: result.riskWarnings,
    raw_response: rawData,
  });
  if (error) console.error('[ai-service] Failed to save analysis:', error.message);
}

// ── Public API ──────────────────────────────────────────────

export async function analyzeToken(
  address: string,
  userId: string | null,
  providerId?: string,
): Promise<{ verdict: AIVerdict; onChainData: OnChainData; providerName: string }> {
  // Resolve provider
  let provider: AIProviderRecord | null;
  if (providerId) {
    provider = await getProvider(providerId);
  } else if (userId) {
    provider = await getDefaultProvider(userId);
  } else {
    throw new Error('No AI provider configured. Please add one in Settings.');
  }

  if (!provider) {
    throw new Error('No AI provider found. Please add one in Settings.');
  }

  // Fetch on-chain data in parallel with AI call preparation
  const [onChainData] = await Promise.all([
    fetchOnChainData(address),
  ]);

  // Build prompts and call AI
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(onChainData, address);
  const verdict = await callAI(provider, systemPrompt, userPrompt);

  // Save to DB
  await saveAnalysis(userId, address, provider.id, verdict, onChainData);

  return { verdict, onChainData, providerName: provider.name };
}

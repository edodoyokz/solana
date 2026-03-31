import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  listProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  getProvider,
  testProviderConnection,
} from "./ai-providers";
import { analyzeToken } from "./ai-service";
import { getSignalEvents, persistSignalEvents } from "./signal-events";
import { getSignalPerformanceSummary, persistSignalSnapshots } from "./signal-performance";
import { getRankedSignals, getTokenSignal } from "./signal-engine";
import { supabase, getProfile, updateProfile } from "./supabase";

const app = new Hono();
app.use("*", cors());

const DEX_BASE = "https://api.dexscreener.com";
const RUGCHECK_BASE = "https://api.rugcheck.xyz/v1";
const GECKO_BASE = "https://api.geckoterminal.com/api/v2";

function timeout(ms: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(id) };
}

// ────────────────────────────────────────────────────────────
// Health
// ────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({ ok: true, ts: Date.now() }));

// ────────────────────────────────────────────────────────────
// SCANNER: Latest boosted tokens (DexScreener free, no key)
//   GET /api/scanner/boosted?limit=30
// ────────────────────────────────────────────────────────────
app.get("/api/scanner/boosted", async (c) => {
  const limit = Number(c.req.query("limit") ?? 30);
  const { signal, clear } = timeout(8000);
  try {
    const res = await fetch(`${DEX_BASE}/token-boosts/latest/v1`, { signal });
    clear();
    if (!res.ok) return c.json({ error: "DexScreener error", status: res.status }, 502);
    const raw: any[] = await res.json();
    // Filter Solana only
    const solana = raw
      .filter((t: any) => t.chainId === "solana")
      .slice(0, limit);
    return c.json({ tokens: solana });
  } catch (e: any) {
    clear();
    return c.json({ error: e.message ?? "fetch failed" }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// SCANNER: Token pair details from DexScreener
//   GET /api/scanner/pair?address=<tokenAddress>
// ────────────────────────────────────────────────────────────
app.get("/api/scanner/pair", async (c) => {
  const address = c.req.query("address");
  if (!address) return c.json({ error: "address required" }, 400);
  const { signal, clear } = timeout(8000);
  try {
    const res = await fetch(`${DEX_BASE}/latest/dex/tokens/${address}`, { signal });
    clear();
    if (!res.ok) return c.json({ error: "DexScreener error" }, 502);
    const data = await res.json();
    return c.json(data);
  } catch (e: any) {
    clear();
    return c.json({ error: e.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// SCANNER: Latest token profiles (new launches)
//   GET /api/scanner/latest-profiles
// ────────────────────────────────────────────────────────────
app.get("/api/scanner/latest-profiles", async (c) => {
  const { signal, clear } = timeout(8000);
  try {
    const res = await fetch(`${DEX_BASE}/token-profiles/latest/v1`, { signal });
    clear();
    if (!res.ok) return c.json({ error: "DexScreener error" }, 502);
    const raw: any[] = await res.json();
    const solana = raw.filter((t: any) => t.chainId === "solana").slice(0, 50);
    return c.json({ profiles: solana });
  } catch (e: any) {
    clear();
    return c.json({ error: e.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// SCANNER: GeckoTerminal trending pools on Solana
//   GET /api/scanner/trending
// ────────────────────────────────────────────────────────────
app.get("/api/scanner/trending", async (c) => {
  const { signal, clear } = timeout(8000);
  try {
    const res = await fetch(
      `${GECKO_BASE}/networks/solana/trending_pools?include=base_token,dex&page=1`,
      {
        signal,
        headers: { Accept: "application/json;version=20230302" },
      }
    );
    clear();
    if (!res.ok) return c.json({ error: "GeckoTerminal error" }, 502);
    const data = await res.json();
    return c.json(data);
  } catch (e: any) {
    clear();
    return c.json({ error: e.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// SCANNER: New pools on Solana (GeckoTerminal)
//   GET /api/scanner/new-pools
// ────────────────────────────────────────────────────────────
app.get("/api/scanner/new-pools", async (c) => {
  const { signal, clear } = timeout(8000);
  try {
    const res = await fetch(
      `${GECKO_BASE}/networks/solana/new_pools?include=base_token,dex`,
      {
        signal,
        headers: { Accept: "application/json;version=20230302" },
      }
    );
    clear();
    if (!res.ok) return c.json({ error: "GeckoTerminal error" }, 502);
    const data = await res.json();
    return c.json(data);
  } catch (e: any) {
    clear();
    return c.json({ error: e.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// SOCIAL: DexScreener latest token profiles (has links/twitter/telegram)
//   GET /api/social/latest
// ────────────────────────────────────────────────────────────
app.get("/api/social/latest", async (c) => {
  const { signal, clear } = timeout(8000);
  try {
    const res = await fetch(`${DEX_BASE}/token-profiles/latest/v1`, { signal });
    clear();
    if (!res.ok) return c.json({ error: "DexScreener error" }, 502);
    const raw: any[] = await res.json();
    // Only tokens that have social links
    const withSocials = raw
      .filter((t: any) => t.chainId === "solana" && t.links && t.links.length > 0)
      .slice(0, 40);
    return c.json({ profiles: withSocials });
  } catch (e: any) {
    clear();
    return c.json({ error: e.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// RUGCHECK: Recent new tokens
//   GET /api/rugcheck/recent
// ────────────────────────────────────────────────────────────
app.get("/api/rugcheck/recent", async (c) => {
  const { signal, clear } = timeout(8000);
  try {
    const res = await fetch(`${RUGCHECK_BASE}/stats/new_tokens`, { signal });
    clear();
    if (!res.ok) return c.json({ error: "RugCheck error", status: res.status }, 502);
    const data = await res.json();
    return c.json(data);
  } catch (e: any) {
    clear();
    return c.json({ error: e.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// RUGCHECK: Token safety report
//   GET /api/rugcheck/:mint
// ────────────────────────────────────────────────────────────
app.get("/api/rugcheck/:mint", async (c) => {
  const mint = c.req.param("mint");
  const { signal, clear } = timeout(10000);
  try {
    const res = await fetch(`${RUGCHECK_BASE}/tokens/${mint}/report`, { signal });
    clear();
    if (!res.ok) return c.json({ error: "RugCheck error", status: res.status }, 502);
    const data = await res.json();
    return c.json(data);
  } catch (e: any) {
    clear();
    return c.json({ error: e.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// RUGCHECK: Summary (lighter endpoint)
//   GET /api/rugcheck/:mint/summary
// ────────────────────────────────────────────────────────────
app.get("/api/rugcheck/:mint/summary", async (c) => {
  const mint = c.req.param("mint");
  const { signal, clear } = timeout(8000);
  try {
    const res = await fetch(`${RUGCHECK_BASE}/tokens/${mint}/report/summary`, { signal });
    clear();
    if (!res.ok) return c.json({ error: "RugCheck error" }, 502);
    const data = await res.json();
    return c.json(data);
  } catch (e: any) {
    clear();
    return c.json({ error: e.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// WALLET: Solana account transactions via public RPC
//   GET /api/wallet/transactions?address=<wallet>
// ────────────────────────────────────────────────────────────
app.get("/api/wallet/transactions", async (c) => {
  const address = c.req.query("address");
  if (!address) return c.json({ error: "address required" }, 400);
  const { signal, clear } = timeout(10000);
  try {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "getSignaturesForAddress",
      params: [address, { limit: 20 }],
    };
    const res = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    clear();
    if (!res.ok) return c.json({ error: "Solana RPC error" }, 502);
    const data = await res.json();
    return c.json(data);
  } catch (e: any) {
    clear();
    return c.json({ error: e.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// WALLET: Token holders from Solana RPC
//   GET /api/wallet/token-accounts?mint=<mintAddress>
// ────────────────────────────────────────────────────────────
app.get("/api/wallet/token-accounts", async (c) => {
  const mint = c.req.query("mint");
  if (!mint) return c.json({ error: "mint required" }, 400);
  const { signal, clear } = timeout(10000);
  try {
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "getTokenLargestAccounts",
      params: [mint],
    };
    const res = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    clear();
    if (!res.ok) return c.json({ error: "Solana RPC error" }, 502);
    const data = await res.json();
    return c.json(data);
  } catch (e: any) {
    clear();
    return c.json({ error: e.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// GECKOTERMINAL: Token info
//   GET /api/gecko/token?network=solana&address=<addr>
// ────────────────────────────────────────────────────────────
app.get("/api/gecko/token", async (c) => {
  const network = c.req.query("network") ?? "solana";
  const address = c.req.query("address");
  if (!address) return c.json({ error: "address required" }, 400);
  const { signal, clear } = timeout(8000);
  try {
    const res = await fetch(
      `${GECKO_BASE}/networks/${network}/tokens/${address}`,
      {
        signal,
        headers: { Accept: "application/json;version=20230302" },
      }
    );
    clear();
    if (!res.ok) return c.json({ error: "GeckoTerminal error" }, 502);
    const data = await res.json();
    return c.json(data);
  } catch (e: any) {
    clear();
    return c.json({ error: e.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// COMBINED ANALYZER: Fetch all data for a token in parallel
//   GET /api/analyze?address=<mintAddress>
// ────────────────────────────────────────────────────────────
app.get("/api/analyze", async (c) => {
  const address = c.req.query("address");
  if (!address) return c.json({ error: "address required" }, 400);

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

  return c.json({ dex, rug, gecko });
});

// ────────────────────────────────────────────────────────────
// SIGNAL ENGINE: Ranked entry signals
//   GET /api/signals/ranked?limit=20
// ────────────────────────────────────────────────────────────
app.get("/api/signals/ranked", async (c) => {
  try {
    const limit = Number(c.req.query("limit") ?? 20);
    const minScore = Number(c.req.query("min_score") ?? 0);
    const minLiquidity = Number(c.req.query("min_liquidity") ?? 0);
    const verdict = (c.req.query("verdict") ?? "all") as "all" | "strong_buy" | "buy" | "watch" | "avoid";

    const signals = await getRankedSignals({
      limit,
      minScore,
      minLiquidity,
      verdict,
    });

    const normalizedSignals = verdict === 'buy'
      ? signals.filter(s => s.verdict === 'buy' || s.verdict === 'strong_buy')
      : signals;

    await persistSignalSnapshots(normalizedSignals);
    await persistSignalEvents(normalizedSignals);

    return c.json({ signals: normalizedSignals, total: normalizedSignals.length });
  } catch (e: any) {
    return c.json({ error: e.message ?? "Failed to build ranked signals" }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// SIGNAL ENGINE: Single token signal
//   GET /api/signals/:address
// ────────────────────────────────────────────────────────────
app.get("/api/signals/:address", async (c) => {
  const address = c.req.param("address");
  if (!address) return c.json({ error: "address required" }, 400);
  try {
    const signal = await getTokenSignal(address);
    if (!signal) return c.json({ error: "Signal unavailable for this token" }, 404);
    return c.json({ signal });
  } catch (e: any) {
    return c.json({ error: e.message ?? "Failed to compute token signal" }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// SIGNAL ENGINE: Performance summary
//   GET /api/signals/performance
// ────────────────────────────────────────────────────────────
app.get("/api/signals/performance", async (c) => {
  try {
    const summary = await getSignalPerformanceSummary();
    return c.json({ summary });
  } catch (e: any) {
    return c.json({ error: e.message ?? "Failed to load signal performance" }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// SIGNAL ENGINE: Signal events timeline
//   GET /api/signals/events?token_address=<addr>&limit=10
// ────────────────────────────────────────────────────────────
app.get("/api/signals/events", async (c) => {
  try {
    const tokenAddress = c.req.query("token_address")?.trim();
    const limit = Number(c.req.query("limit") ?? 20);
    const events = await getSignalEvents(tokenAddress || undefined, limit);
    return c.json({ events });
  } catch (e: any) {
    return c.json({ error: e.message ?? "Failed to load signal events" }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// AUTH: Verify token and get user
//   Helper: extract user from Authorization header
// ────────────────────────────────────────────────────────────

async function getUserFromHeader(c: any): Promise<string | null> {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user.id;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────
// AUTH: Get current user profile
//   GET /api/auth/me
// ────────────────────────────────────────────────────────────
app.get("/api/auth/me", async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const profile = await getProfile(userId);
  return c.json({ user: { id: userId }, profile });
});

// ────────────────────────────────────────────────────────────
// AI PROVIDERS: CRUD
// ────────────────────────────────────────────────────────────

// List providers
app.get("/api/ai-providers", async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  try {
    const providers = await listProviders(userId);
    // Mask API keys in response
    return c.json({
      providers: providers.map(p => ({
        ...p,
        api_key_encrypted: p.api_key_encrypted ? '***' : null,
      })),
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Create provider
app.post("/api/ai-providers", async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const { name, base_url, api_key, model_id, is_default, max_tokens, temperature } = body;
    if (!name || !base_url || !api_key || !model_id) {
      return c.json({ error: "name, base_url, api_key, and model_id are required" }, 400);
    }
    const provider = await createProvider(userId, {
      name,
      base_url,
      api_key,
      model_id,
      is_default: !!is_default,
      max_tokens: max_tokens ?? 2048,
      temperature: temperature ?? 0.7,
    });
    return c.json({ provider: { ...provider, api_key_encrypted: '***' } }, 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Update provider
app.put("/api/ai-providers/:id", async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const provider = await updateProvider(id, userId, body);
    return c.json({ provider: { ...provider, api_key_encrypted: provider.api_key_encrypted ? '***' : null } });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Delete provider
app.delete("/api/ai-providers/:id", async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  try {
    const id = c.req.param("id");
    await deleteProvider(id, userId);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Test provider connection
app.post("/api/ai-providers/:id/test", async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  try {
    const id = c.req.param("id");
    const provider = await getProvider(id);
    if (!provider || provider.user_id !== userId) {
      return c.json({ error: "Provider not found" }, 404);
    }
    const result = await testProviderConnection(provider);
    return c.json(result);
  } catch (e: any) {
    return c.json({ success: false, message: e.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// AI ANALYSIS: Real LLM-based token analysis
//   POST /api/ai/analyze
// ────────────────────────────────────────────────────────────
app.post("/api/ai/analyze", async (c) => {
  const userId = await getUserFromHeader(c);
  try {
    const body = await c.req.json();
    const { address, provider_id } = body;
    if (!address) return c.json({ error: "address is required" }, 400);

    const { verdict, onChainData, providerName } = await analyzeToken(
      address.trim(),
      userId,
      provider_id,
    );

    return c.json({
      verdict,
      onChainData,
      providerName,
    });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// AI ANALYSES: History
//   GET /api/ai/analyses?limit=50&token_address=<addr>
// ────────────────────────────────────────────────────────────
app.get("/api/ai/analyses", async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  try {
    const limit = Number(c.req.query("limit") ?? 50);
    const tokenAddress = c.req.query("token_address");

    let query = supabase
      .from('ai_analyses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (tokenAddress) {
      query = query.eq('token_address', tokenAddress);
    }

    const { data, error } = await query;
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ analyses: data ?? [] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// WATCHLIST: CRUD
// ────────────────────────────────────────────────────────────

app.get("/api/watchlist", async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { data, error } = await supabase
      .from('watchlist_wallets')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ wallets: data ?? [] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.post("/api/watchlist", async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    if (!body.wallet_address) return c.json({ error: "wallet_address is required" }, 400);
    const { data, error } = await supabase
      .from('watchlist_wallets')
      .insert({ user_id: userId, wallet_address: body.wallet_address, label: body.label ?? null, notes: body.notes ?? null })
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ wallet: data }, 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.put("/api/watchlist/:id", async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const { data, error } = await supabase
      .from('watchlist_wallets')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', c.req.param("id"))
      .eq('user_id', userId)
      .select()
      .single();
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ wallet: data });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

app.delete("/api/watchlist/:id", async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  try {
    const { error } = await supabase
      .from('watchlist_wallets')
      .delete()
      .eq('id', c.req.param("id"))
      .eq('user_id', userId);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// ────────────────────────────────────────────────────────────
// USER PREFERENCES
//   GET /api/preferences
//   PUT /api/preferences
// ────────────────────────────────────────────────────────────

app.get("/api/preferences", async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  const profile = await getProfile(userId);
  return c.json({ preferences: profile?.preferences ?? {} });
});

app.put("/api/preferences", async (c) => {
  const userId = await getUserFromHeader(c);
  if (!userId) return c.json({ error: "Unauthorized" }, 401);
  try {
    const body = await c.req.json();
    const profile = await updateProfile(userId, { preferences: body.preferences ?? {} });
    return c.json({ preferences: profile?.preferences ?? {} });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

export default app;


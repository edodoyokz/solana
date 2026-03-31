-- ============================================================
-- MemeScout — Initial Schema
-- ============================================================

-- ── Profiles (1:1 with auth.users) ────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── AI Providers ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_providers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  base_url         TEXT NOT NULL,
  api_key_encrypted TEXT,
  model_id         TEXT NOT NULL DEFAULT 'gpt-4o',
  is_default       BOOLEAN NOT NULL DEFAULT false,
  max_tokens       INTEGER NOT NULL DEFAULT 2048,
  temperature      FLOAT NOT NULL DEFAULT 0.7,
  created_at       TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_providers_select_own"
  ON public.ai_providers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "ai_providers_insert_own"
  ON public.ai_providers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ai_providers_update_own"
  ON public.ai_providers FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "ai_providers_delete_own"
  ON public.ai_providers FOR DELETE
  USING (auth.uid() = user_id);

-- ── Scanned Tokens ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scanned_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  token_address   TEXT NOT NULL,
  token_name      TEXT,
  token_symbol    TEXT,
  price_usd       NUMERIC(24, 12),
  price_change_24h NUMERIC(12, 4),
  volume_24h      NUMERIC(24, 2),
  market_cap      NUMERIC(24, 2),
  liquidity_usd   NUMERIC(24, 2),
  source          TEXT DEFAULT 'dexscreener',
  raw_data        JSONB,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.scanned_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scanned_tokens_select_own"
  ON public.scanned_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "scanned_tokens_insert_own"
  ON public.scanned_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── AI Analyses ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_analyses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  token_address  TEXT NOT NULL,
  provider_id    UUID REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  verdict        TEXT NOT NULL CHECK (verdict IN ('buy', 'watch', 'avoid')),
  confidence     INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  reasoning      TEXT NOT NULL,
  key_factors    JSONB DEFAULT '[]'::jsonb,
  price_target   TEXT,
  risk_warnings  JSONB DEFAULT '[]'::jsonb,
  raw_response   JSONB,
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.ai_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_analyses_select_own"
  ON public.ai_analyses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "ai_analyses_insert_own"
  ON public.ai_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── Watchlist Wallets ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.watchlist_wallets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  label          TEXT,
  notes          TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at     TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.watchlist_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "watchlist_wallets_select_own"
  ON public.watchlist_wallets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "watchlist_wallets_insert_own"
  ON public.watchlist_wallets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "watchlist_wallets_update_own"
  ON public.watchlist_wallets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "watchlist_wallets_delete_own"
  ON public.watchlist_wallets FOR DELETE
  USING (auth.uid() = user_id);

-- ── Indexes ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_scanned_tokens_address ON public.scanned_tokens (token_address);
CREATE INDEX IF NOT EXISTS idx_scanned_tokens_user ON public.scanned_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_address ON public.ai_analyses (token_address);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_user ON public.ai_analyses (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_providers_user ON public.ai_providers (user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_wallets_user ON public.watchlist_wallets (user_id);

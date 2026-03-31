CREATE TABLE IF NOT EXISTS public.signal_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address TEXT NOT NULL,
  token_name TEXT,
  token_symbol TEXT,
  score INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  liquidity_usd NUMERIC(24, 2),
  volume_24h NUMERIC(24, 2),
  market_cap NUMERIC(24, 2),
  price_usd NUMERIC(24, 12),
  price_change_24h NUMERIC(12, 4),
  risk_flags INTEGER DEFAULT 0,
  snapshot_source TEXT DEFAULT 'ranked_signals',
  snapshot_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.signal_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL REFERENCES public.signal_snapshots(id) ON DELETE CASCADE,
  token_address TEXT NOT NULL,
  horizon_minutes INTEGER NOT NULL,
  entry_price NUMERIC(24, 12),
  latest_price NUMERIC(24, 12),
  return_pct NUMERIC(12, 4),
  outcome TEXT,
  evaluated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (snapshot_id, horizon_minutes)
);

CREATE INDEX IF NOT EXISTS idx_signal_snapshots_address ON public.signal_snapshots (token_address);
CREATE INDEX IF NOT EXISTS idx_signal_snapshots_time ON public.signal_snapshots (snapshot_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_snapshot ON public.signal_outcomes (snapshot_id);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_token ON public.signal_outcomes (token_address);

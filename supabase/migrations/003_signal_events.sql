CREATE TABLE IF NOT EXISTS public.signal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address TEXT NOT NULL,
  previous_snapshot_id UUID REFERENCES public.signal_snapshots(id) ON DELETE SET NULL,
  current_snapshot_id UUID REFERENCES public.signal_snapshots(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  previous_verdict TEXT,
  current_verdict TEXT,
  previous_score INTEGER,
  current_score INTEGER,
  delta_score INTEGER,
  confidence INTEGER,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signal_events_token ON public.signal_events (token_address);
CREATE INDEX IF NOT EXISTS idx_signal_events_time ON public.signal_events (created_at DESC);

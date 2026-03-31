import { supabase } from './supabase'
import type { TokenSignal } from './signal-engine'

export interface SignalEventRow {
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

function classifyEvent(prev: { verdict?: string | null; score?: number | null }, next: TokenSignal): string | null {
  const prevVerdict = prev.verdict ?? null
  const prevScore = Number(prev.score ?? 0)
  const nextScore = next.score

  if (prevVerdict && prevVerdict !== next.verdict) {
    return `${prevVerdict}_to_${next.verdict}`
  }

  const delta = nextScore - prevScore
  if (delta >= 15) return 'score_spike'
  if (delta <= -15) return 'score_drop'
  if (Math.abs(delta) >= 8) return 'confidence_shift'
  return null
}

export async function persistSignalEvents(signals: TokenSignal[]): Promise<void> {
  if (!supabase || signals.length === 0) return

  for (const signal of signals) {
    const { data: snapshots } = await supabase
      .from('signal_snapshots')
      .select('id, verdict, score')
      .eq('token_address', signal.address)
      .order('snapshot_at', { ascending: false })
      .limit(2)

    if (!snapshots || snapshots.length < 2) continue

    const current = snapshots[0]
    const previous = snapshots[1]
    const eventType = classifyEvent(previous, signal)
    if (!eventType) continue

    await supabase.from('signal_events').insert({
      token_address: signal.address,
      previous_snapshot_id: previous.id,
      current_snapshot_id: current.id,
      event_type: eventType,
      previous_verdict: previous.verdict,
      current_verdict: signal.verdict,
      previous_score: previous.score,
      current_score: signal.score,
      delta_score: signal.score - Number(previous.score ?? 0),
      confidence: signal.confidence,
    })
  }
}

export async function getSignalEvents(tokenAddress?: string, limit = 20): Promise<SignalEventRow[]> {
  if (!supabase) return []
  let query = supabase
    .from('signal_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (tokenAddress) query = query.eq('token_address', tokenAddress)
  const { data, error } = await query
  if (error) return []
  return data ?? []
}

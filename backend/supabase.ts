import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const isConfigured = supabaseUrl.length > 0 && supabaseServiceKey.length > 0;

if (!isConfigured) {
  console.warn('[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — database features disabled');
}

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null as any;

export function isSupabaseReady(): boolean {
  return isConfigured;
}

// ── Helpers ─────────────────────────────────────────────────

export async function getProfile(userId: string) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

export async function updateProfile(userId: string, updates: Record<string, any>) {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

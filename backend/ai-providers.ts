import { supabase } from './supabase';
import { encrypt, decrypt } from './crypto';

const OPENAI_ONLY_MODEL_PREFIXES = ['gpt-5', 'gpt-4o', 'o1', 'o3', 'o4', 'codex'];

function isOpenAIBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === 'api.openai.com' || host.endsWith('.openai.com');
  } catch {
    return false;
  }
}

function requiresOpenAIProvider(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  return OPENAI_ONLY_MODEL_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

function validateProviderCompatibility(baseUrl: string, modelId: string): void {
  if (requiresOpenAIProvider(modelId) && !isOpenAIBaseUrl(baseUrl)) {
    throw new Error(
      `Model "${modelId}" requires OpenAI provider. Use base_url "https://api.openai.com/v1" for GPT-5/GPT-4o/o-series/Codex models.`,
    );
  }
}

export interface AIProviderRecord {
  id: string;
  user_id: string;
  name: string;
  base_url: string;
  api_key_encrypted: string | null;
  model_id: string;
  is_default: boolean;
  max_tokens: number;
  temperature: number;
  created_at: string;
  updated_at: string;
}

export interface AIProviderInput {
  name: string;
  base_url: string;
  api_key: string;
  model_id: string;
  is_default?: boolean;
  max_tokens?: number;
  temperature?: number;
}

export async function listProviders(userId: string): Promise<AIProviderRecord[]> {
  const { data, error } = await supabase
    .from('ai_providers')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to list providers: ${error.message}`);
  return data ?? [];
}

export async function getProvider(id: string): Promise<AIProviderRecord | null> {
  const { data, error } = await supabase
    .from('ai_providers')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

export async function getDefaultProvider(userId: string): Promise<AIProviderRecord | null> {
  const { data, error } = await supabase
    .from('ai_providers')
    .select('*')
    .eq('user_id', userId)
    .eq('is_default', true)
    .single();
  if (error && error.code !== 'PGRST116') return null;
  return data;
}

export async function createProvider(userId: string, input: AIProviderInput): Promise<AIProviderRecord> {
  validateProviderCompatibility(input.base_url, input.model_id);

  // If setting as default, unset all other defaults first
  if (input.is_default) {
    await supabase
      .from('ai_providers')
      .update({ is_default: false })
      .eq('user_id', userId);
  }

  // If this is the first provider, make it default automatically
  if (!input.is_default) {
    const existing = await listProviders(userId);
    if (existing.length === 0) {
      input.is_default = true;
    }
  }

  const api_key_encrypted = input.api_key ? encrypt(input.api_key) : null;

  const { data, error } = await supabase
    .from('ai_providers')
    .insert({
      user_id: userId,
      name: input.name,
      base_url: input.base_url.replace(/\/+$/, ''),
      api_key_encrypted,
      model_id: input.model_id,
      is_default: input.is_default ?? false,
      max_tokens: input.max_tokens ?? 2048,
      temperature: input.temperature ?? 0.7,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create provider: ${error.message}`);
  return data;
}

export async function updateProvider(id: string, userId: string, input: Partial<AIProviderInput>): Promise<AIProviderRecord> {
  if (input.base_url || input.model_id) {
    const existing = await getProvider(id);
    if (!existing || existing.user_id !== userId) {
      throw new Error('Provider not found');
    }
    validateProviderCompatibility(input.base_url ?? existing.base_url, input.model_id ?? existing.model_id);
  }

  // If setting as default, unset all other defaults first
  if (input.is_default) {
    await supabase
      .from('ai_providers')
      .update({ is_default: false })
      .eq('user_id', userId)
      .neq('id', id);
  }

  const updates: Record<string, any> = {
    ...input,
    updated_at: new Date().toISOString(),
  };

  // Remove api_key from updates, handle separately
  if ('api_key' in updates) {
    if (input.api_key) {
      updates.api_key_encrypted = encrypt(input.api_key);
    }
    delete updates.api_key;
  }

  const { data, error } = await supabase
    .from('ai_providers')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update provider: ${error.message}`);
  return data;
}

export async function deleteProvider(id: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('ai_providers')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(`Failed to delete provider: ${error.message}`);
}

export function decryptApiKey(encrypted: string | null): string {
  if (!encrypted) return '';
  return decrypt(encrypted);
}

export async function testProviderConnection(provider: AIProviderRecord): Promise<{ success: boolean; message: string }> {
  const apiKey = decryptApiKey(provider.api_key_encrypted);
  if (!apiKey) {
    return { success: false, message: 'No API key configured' };
  }

  const baseUrl = provider.base_url.replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model_id,
        messages: [
          { role: 'user', content: 'Say "Connection successful" in 5 words or less.' },
        ],
        max_tokens: 20,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { success: false, message: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }

    return { success: true, message: 'Connection successful' };
  } catch (e: any) {
    return { success: false, message: e.message ?? 'Connection failed' };
  }
}

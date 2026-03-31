import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../components/auth/AuthGuard'
import { getAccessToken } from '../lib/auth'
import toast from 'react-hot-toast'
import Header from '../components/layout/Header'
import {
  Settings, Plus, Trash2, TestTube, Loader2, CheckCircle,
  XCircle, Star, Eye, EyeOff, Cpu, Save
} from 'lucide-react'
import { cn } from '../lib/utils'

// ─── Types ──────────────────────────────────────────────────

interface AIProvider {
  id: string
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

// ─── Helpers ────────────────────────────────────────────────

const BACKEND = ""

async function authFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAccessToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> ?? {}),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BACKEND}${path}`, { ...options, headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
  return data
}

// ─── Provider Form ──────────────────────────────────────────

function ProviderForm({
  provider,
  defaultValues,
  onSave,
  onCancel,
}: {
  provider?: AIProvider
  defaultValues?: { name?: string; base_url?: string; model_id?: string }
  onSave: (data: any) => Promise<void>
  onCancel: () => void
}) {
  const isEdit = !!provider
  const [name, setName] = useState(provider?.name ?? defaultValues?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(provider?.base_url ?? defaultValues?.base_url ?? 'https://api.openai.com/v1')
  const [apiKey, setApiKey] = useState('')
  const [modelId, setModelId] = useState(provider?.model_id ?? defaultValues?.model_id ?? 'gpt-4o')
  const [maxTokens, setMaxTokens] = useState(String(provider?.max_tokens ?? 2048))
  const [temperature, setTemperature] = useState(String(provider?.temperature ?? 0.7))
  const [isDefault, setIsDefault] = useState(provider?.is_default ?? false)
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !baseUrl || (!isEdit && !apiKey)) return
    setSaving(true)
    try {
      const payload: any = { name, base_url: baseUrl, model_id: modelId, is_default: isDefault, max_tokens: Number(maxTokens), temperature: Number(temperature) }
      if (apiKey) payload.api_key = apiKey
      await onSave(payload)
      toast.success(isEdit ? 'Provider updated' : 'Provider added')
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save')
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-4 space-y-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">
        {isEdit ? `Edit: ${provider.name}` : 'Add New Provider'}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="My GPT Provider"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            required
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Model ID</label>
          <input
            type="text"
            value={modelId}
            onChange={e => setModelId(e.target.value)}
            placeholder="gpt-4o"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none font-mono"
            required
          />
        </div>
      </div>

      <div>
        <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Base URL</label>
        <input
          type="text"
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none font-mono"
          required
        />
      </div>

      <div>
        <label className="text-[10px] text-muted-foreground uppercase mb-1 block">
          API Key {isEdit && <span className="text-muted-foreground/60">(leave blank to keep existing)</span>}
        </label>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={isEdit ? '••••••••' : 'sk-...'}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 pr-10 text-sm text-foreground placeholder:text-muted-foreground outline-none font-mono"
            required={!isEdit}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Max Tokens</label>
          <input
            type="number"
            value={maxTokens}
            onChange={e => setMaxTokens(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Temperature</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={temperature}
            onChange={e => setTemperature(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none font-mono"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 cursor-pointer bg-background border border-border rounded-lg px-3 py-2 w-full">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs text-foreground flex items-center gap-1">
              <Star size={11} className="text-primary" /> Default
            </span>
          </label>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving || !name || !baseUrl || (!isEdit && !apiKey)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {isEdit ? 'Update' : 'Add Provider'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground border border-border transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ─── Main Settings Page ─────────────────────────────────────

export default function SettingsPage() {
  const { user, isConfigured, loading: authLoading } = useAuth()
  const [providers, setProviders] = useState<AIProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editProvider, setEditProvider] = useState<AIProvider | undefined>()
  const [presetValues, setPresetValues] = useState<{ name?: string; base_url?: string; model_id?: string } | undefined>()
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({})

  const fetchProviders = useCallback(async () => {
    try {
      const data = await authFetch<{ providers: AIProvider[] }>('/api/ai-providers')
      setProviders(data.providers ?? [])
    } catch (e: any) {
      console.error('Failed to fetch providers:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) fetchProviders()
    else setLoading(false)
  }, [user, fetchProviders])

  const handleSave = async (data: any) => {
    if (editProvider) {
      await authFetch(`/api/ai-providers/${editProvider.id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      })
    } else {
      await authFetch('/api/ai-providers', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    }
    setShowForm(false)
    setEditProvider(undefined)
    await fetchProviders()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this provider?')) return
    try {
      await authFetch(`/api/ai-providers/${id}`, { method: 'DELETE' })
      toast.success('Provider deleted')
      await fetchProviders()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    setTestResults(prev => ({ ...prev, [id]: { success: false, message: 'Testing...' } }))
    try {
      const result = await authFetch<{ success: boolean; message: string }>(`/api/ai-providers/${id}/test`, {
        method: 'POST',
      })
      setTestResults(prev => ({ ...prev, [id]: result }))
      toast.success(result.success ? 'Connection successful!' : `Failed: ${result.message}`)
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [id]: { success: false, message: e.message } }))
      toast.error(e.message)
    }
    setTestingId(null)
  }

  if (authLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Settings" subtitle="Loading..." />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-primary" size={24} />
        </div>
      </div>
    )
  }

  if (!isConfigured || !user) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Settings" subtitle="Authentication required" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <Settings size={32} className="opacity-30" />
          <p className="text-sm">Sign in to manage your settings</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Settings" subtitle="AI providers, preferences, and account" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* AI Providers Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Cpu size={14} className="text-primary" />
              <p className="text-sm font-semibold">AI Providers</p>
              <span className="text-[10px] text-muted-foreground font-mono bg-background px-2 py-0.5 rounded border border-border">
                {providers.length} configured
              </span>
            </div>
            {!showForm && !editProvider && (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                <Plus size={14} /> Add Provider
              </button>
            )}
          </div>

          {/* Add/Edit Form */}
          {(showForm || editProvider) && (
            <div className="mb-4 animate-fade-in">
              <ProviderForm
                key={editProvider?.id ?? presetValues?.base_url ?? 'new'}
                provider={editProvider}
                defaultValues={presetValues}
                onSave={handleSave}
                onCancel={() => { setShowForm(false); setEditProvider(undefined); setPresetValues(undefined) }}
              />
            </div>
          )}

          {/* Provider List */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-muted-foreground" size={20} />
            </div>
          ) : providers.length === 0 && !showForm ? (
            <div className="bg-card border border-border rounded-xl p-6 text-center">
              <Cpu size={24} className="text-muted-foreground mx-auto mb-2 opacity-30" />
              <p className="text-sm text-muted-foreground">No AI providers configured</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Add an OpenAI-compatible provider to enable AI analysis
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {providers.map(p => {
                const test = testResults[p.id]
                return (
                  <div
                    key={p.id}
                    className={cn(
                      'bg-card border rounded-xl p-3 flex items-center gap-3',
                      p.is_default ? 'border-primary/30' : 'border-border'
                    )}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                        p.is_default ? 'bg-primary/10 border border-primary/30' : 'bg-background border border-border'
                      )}>
                        <Cpu size={16} className={p.is_default ? 'text-primary' : 'text-muted-foreground'} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold truncate">{p.name}</p>
                          {p.is_default && (
                            <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono font-bold shrink-0">DEFAULT</span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground font-mono truncate">{p.model_id} · {p.base_url}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {test && (
                        <span className={cn(
                          'text-[10px] px-2 py-0.5 rounded font-mono flex items-center gap-1',
                          test.success ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'
                        )}>
                          {test.success ? <CheckCircle size={10} /> : <XCircle size={10} />}
                          {test.message.slice(0, 20)}
                        </span>
                      )}
                      <button
                        onClick={() => handleTest(p.id)}
                        disabled={testingId === p.id}
                        className="p-1.5 text-muted-foreground hover:text-primary rounded-lg hover:bg-primary/5 transition-colors"
                        title="Test connection"
                      >
                        {testingId === p.id ? <Loader2 size={14} className="animate-spin" /> : <TestTube size={14} />}
                      </button>
                      <button
                        onClick={() => { setEditProvider(p); setPresetValues(undefined) }}
                        className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-background transition-colors"
                        title="Edit"
                      >
                        <Settings size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="p-1.5 text-muted-foreground hover:text-red-400 rounded-lg hover:bg-red-400/5 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Preset Providers — click to auto-fill form */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Quick Presets</p>
          <div className="flex flex-wrap gap-2">
            {[
              { name: 'OpenAI', url: 'https://api.openai.com/v1', model: 'gpt-4o' },
              { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o' },
              { name: 'Groq', url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
              { name: 'Together AI', url: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70b-Instruct-Turbo' },
              { name: 'Ollama', url: 'http://localhost:11434/v1', model: 'llama3' },
              { name: 'DeepSeek', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
              { name: 'Gemini (via OpenRouter)', url: 'https://openrouter.ai/api/v1', model: 'google/gemini-2.0-flash-001' },
            ].map(p => (
              <button
                key={p.name}
                type="button"
                onClick={() => {
                  setPresetValues({ name: p.name, base_url: p.url, model_id: p.model })
                  setShowForm(true)
                  setEditProvider(undefined)
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-background border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

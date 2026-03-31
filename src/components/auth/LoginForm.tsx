import { useState } from 'react'
import { signInWithPassword, signInWithOtp, signUp, signOut } from '../../lib/auth'
import { useAuth } from './AuthGuard'
import { Loader2, Mail, Lock, Eye, EyeOff, LogOut, UserPlus, Zap } from 'lucide-react'
import toast from 'react-hot-toast'

type Mode = 'login' | 'register' | 'magic'

export default function LoginForm() {
  const { user, isConfigured } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!isConfigured) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <Zap size={32} className="text-primary mb-4 opacity-40" />
        <p className="text-sm font-semibold mb-2">Supabase Not Configured</p>
        <p className="text-xs text-muted-foreground max-w-sm">
          Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local to enable authentication.
        </p>
      </div>
    )
  }

  if (user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mb-4">
          <span className="text-lg font-bold text-primary">{user.email?.charAt(0).toUpperCase()}</span>
        </div>
        <p className="text-sm font-semibold mb-1">{user.email}</p>
        <p className="text-xs text-muted-foreground mb-4">Signed in</p>
        <button
          onClick={async () => {
            await signOut()
            toast.success('Signed out')
          }}
          className="flex items-center gap-2 bg-card border border-border px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)

    try {
      if (mode === 'login') {
        if (!password) return
        const { error } = await signInWithPassword(email, password)
        if (error) { toast.error(error); setLoading(false); return }
        toast.success('Signed in!')
      } else if (mode === 'register') {
        if (!password || password.length < 6) { toast.error('Password must be at least 6 characters'); setLoading(false); return }
        const { error } = await signUp(email, password)
        if (error) { toast.error(error); setLoading(false); return }
        toast.success('Check your email to confirm signup')
      } else {
        const { error } = await signInWithOtp(email)
        if (error) { toast.error(error); setLoading(false); return }
        toast.success('Magic link sent to your email!')
      }
    } catch {
      toast.error('Something went wrong')
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto mb-3">
            <Zap size={20} className="text-primary" />
          </div>
          <p className="text-sm font-semibold">Welcome to MemeScout</p>
          <p className="text-xs text-muted-foreground mt-1">Sign in to save your analyses and watchlists</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2.5">
            <Mail size={14} className="text-muted-foreground shrink-0" />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
              required
            />
          </div>

          {mode !== 'magic' && (
            <div className="flex items-center gap-2 bg-background border border-border rounded-lg px-3 py-2.5">
              <Lock size={14} className="text-muted-foreground shrink-0" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={mode === 'register' ? 'Create password (min 6 chars)' : 'Password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
                required
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : mode === 'register' ? <><UserPlus size={16} />Create Account</> : <><Mail size={16} />{mode === 'magic' ? 'Send Magic Link' : 'Sign In'}</>}
          </button>
        </form>

        <div className="flex items-center gap-2 mt-4 justify-center">
          {(['login', 'register', 'magic'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${mode === m ? 'bg-primary/10 text-primary font-semibold border border-primary/20' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {m === 'login' ? 'Password' : m === 'register' ? 'Register' : 'Magic Link'}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

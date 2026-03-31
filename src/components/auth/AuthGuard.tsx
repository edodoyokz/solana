import { useEffect, useState, createContext, useContext, type ReactNode } from 'react'
import { onAuthStateChange, getCurrentUser } from '../../lib/auth'
import { isSupabaseConfigured } from '../../lib/supabase'
import type { User } from '@supabase/supabase-js'

interface AuthContextValue {
  user: User | null
  loading: boolean
  isConfigured: boolean
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  isConfigured: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const configured = isSupabaseConfigured()

  useEffect(() => {
    if (!configured) {
      setLoading(false)
      return
    }

    getCurrentUser().then(u => {
      setUser(u)
      setLoading(false)
    })

    const unsubscribe = onAuthStateChange(u => {
      setUser(u)
      setLoading(false)
    })

    return unsubscribe
  }, [configured])

  return (
    <AuthContext.Provider value={{ user, loading, isConfigured: configured }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

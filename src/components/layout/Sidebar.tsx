import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import {
  Radar,
  MessageSquare,
  Wallet,
  BrainCircuit,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Zap,
  TrendingUp,
  Settings,
  LogOut,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAuth } from '../auth/AuthGuard'
import { signOut } from '../../lib/auth'
import toast from 'react-hot-toast'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const navItems = [
  {
    href: '/scanner',
    icon: Radar,
    label: 'Coin Scanner',
    badge: 'LIVE',
    badgeColor: 'bg-green-500/20 text-green-400',
  },
  {
    href: '/social',
    icon: MessageSquare,
    label: 'Social Monitor',
    badge: null,
    badgeColor: null,
  },
  {
    href: '/wallet',
    icon: Wallet,
    label: 'Wallet Tracker',
    badge: null,
    badgeColor: null,
  },
  {
    href: '/analyzer',
    icon: BrainCircuit,
    label: 'Multi Analyzer',
    badge: 'AI',
    badgeColor: 'bg-accent/20 text-accent',
  },
  {
    href: '/recommendation',
    icon: Sparkles,
    label: 'Recommendation',
    badge: null,
    badgeColor: null,
  },
]

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const handleSignOut = async () => {
    await signOut()
    toast.success('Signed out')
    navigate({ to: '/login' })
  }

  return (
    <aside
      className={cn(
        'h-screen flex flex-col border-r border-border bg-sidebar transition-all duration-300 ease-in-out relative',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className={cn(
        'h-16 flex items-center border-b border-border px-4 shrink-0',
        collapsed ? 'justify-center' : 'gap-3'
      )}>
        <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0 animate-pulse-glow">
          <TrendingUp size={16} className="text-primary" />
        </div>
        {!collapsed && (
          <div>
            <p className="text-sm font-bold text-foreground leading-none">MemeScout</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">SOLANA NETWORK</p>
          </div>
        )}
      </div>

      {/* Live indicator */}
      {!collapsed && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-md bg-green-500/10 border border-green-500/20 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
          <span className="text-xs text-green-400 font-medium">Network Active</span>
          <Zap size={10} className="text-green-400 ml-auto" />
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.href
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative',
                isActive
                  ? 'bg-primary/15 text-primary border border-primary/30'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground border border-transparent',
                collapsed && 'justify-center'
              )}
            >
              <Icon
                size={18}
                className={cn(
                  'shrink-0 transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                )}
              />
              {!collapsed && (
                <>
                  <span className="text-sm font-medium flex-1">{item.label}</span>
                  {item.badge && (
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded font-mono', item.badgeColor)}>
                      {item.badge}
                    </span>
                  )}
                </>
              )}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2 py-1 bg-card border border-border rounded text-xs text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  {item.label}
                </div>
              )}
            </Link>
          )
        })}

        {/* Settings link */}
        <Link
          to="/settings"
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative',
            location.pathname === '/settings'
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground border border-transparent',
            collapsed && 'justify-center'
          )}
        >
          <Settings size={18} className={cn(
            'shrink-0 transition-colors',
            location.pathname === '/settings' ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
          )} />
          {!collapsed && (
            <span className="text-sm font-medium flex-1">Settings</span>
          )}
          {collapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-card border border-border rounded text-xs text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
              Settings
            </div>
          )}
        </Link>
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3 space-y-2">
        {/* User info + sign out */}
        {user ? (
          <div className={cn(
            'flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent transition-colors cursor-default',
            collapsed && 'justify-center px-0'
          )}>
            <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-primary">
                {user.email?.charAt(0).toUpperCase() ?? '?'}
              </span>
            </div>
            {!collapsed && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{user.email}</p>
                  <p className="text-[10px] text-muted-foreground">Signed in</p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/5 transition-colors shrink-0"
                  title="Sign out"
                >
                  <LogOut size={14} />
                </button>
              </>
            )}
          </div>
        ) : (
          <Link
            to="/login"
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-primary/10 transition-colors text-muted-foreground hover:text-primary"
          >
            <div className="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center shrink-0">
              <span className="text-xs text-muted-foreground">?</span>
            </div>
            {!collapsed && (
              <span className="text-xs font-medium">Sign in</span>
            )}
          </Link>
        )}

        <div className="flex items-center gap-2">
          {!collapsed && (
            <p className="text-[10px] text-muted-foreground font-mono flex-1">v1.0.0</p>
          )}
          <button
            onClick={onToggle}
            className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-sidebar-accent transition-colors text-muted-foreground hover:text-foreground"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </div>
    </aside>
  )
}


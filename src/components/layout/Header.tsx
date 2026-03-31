import { Bell, Search, Settings, RefreshCw } from 'lucide-react'
import { Link } from '@tanstack/react-router'

interface HeaderProps {
  title: string
  subtitle?: string
}

export default function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="h-16 border-b border-border flex items-center px-6 gap-4 shrink-0 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex-1">
        <h1 className="text-base font-semibold text-foreground leading-none">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>

      {/* Search */}
      <div className="hidden md:flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5 w-56">
        <Search size={14} className="text-muted-foreground shrink-0" />
        <input
          type="text"
          placeholder="Search token..."
          className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1 font-mono"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button className="w-8 h-8 rounded-lg border border-border hover:bg-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors group">
          <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
        </button>
        <button className="w-8 h-8 rounded-lg border border-border hover:bg-card flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors relative">
          <Bell size={14} />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-primary rounded-full" />
        </button>
        <Link
          to="/settings"
          className="w-8 h-8 rounded-lg border border-border hover:bg-card flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
          title="Settings"
        >
          <Settings size={14} />
        </Link>
      </div>
    </header>
  )
}


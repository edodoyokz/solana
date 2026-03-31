import { useState } from 'react'
import {
  createRouter,
  createRoute,
  createRootRoute,
  RouterProvider,
  Outlet,
  redirect,
  useLocation,
} from '@tanstack/react-router'
import Sidebar from './components/layout/Sidebar'
import Scanner from './pages/Scanner'
import SocialMonitor from './pages/SocialMonitor'
import WalletTracker from './pages/WalletTracker'
import MultiAnalyzer from './pages/MultiAnalyzer'
import Recommendation from './pages/Recommendation'
import Login from './pages/Login'
import Settings from './pages/Settings'
import { useAuth } from './components/auth/AuthGuard'
import { Loader2 } from 'lucide-react'

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// ─── Root layout: sidebar everywhere except /login ──────────

function RootLayout() {
  const { loading } = useAuth()
  const location = useLocation()
  const isLoginPage = location.pathname === '/login'
  const [collapsed, setCollapsed] = useState(false)

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center">
          <Loader2 size={24} className="animate-spin text-primary mx-auto mb-3" />
          <p className="text-xs text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Login page: full screen, no sidebar
  if (isLoginPage) {
    return <Outlet />
  }

  // All other pages: always show sidebar
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}

// ─── Routes ─────────────────────────────────────────────────

const rootRoute = createRootRoute({ component: RootLayout })

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/scanner' })
  },
  component: () => null,
})

const scannerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/scanner',
  component: Scanner,
})

const socialRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/social',
  component: SocialMonitor,
})

const walletRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/wallet',
  component: WalletTracker,
})

const analyzerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/analyzer',
  component: MultiAnalyzer,
})

const recommendationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recommendation',
  component: Recommendation,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: Settings,
})

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: Login,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  scannerRoute,
  socialRoute,
  walletRoute,
  analyzerRoute,
  recommendationRoute,
  settingsRoute,
  loginRoute,
])

const router = createRouter({ routeTree })

export default function App() {
  return <RouterProvider router={router} />
}

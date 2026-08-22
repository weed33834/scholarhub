import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import '@/i18n'
import { ThemeProvider } from './components/theme-provider'
import { AppErrorBoundary } from './components/common/error-boundary'
import { initMonitoring, installGlobalErrorHandlers } from './lib/monitoring'
import './index.css'

// window.onerror + unhandledrejection 兜底（ErrorBoundary 只覆盖渲染期错误）
installGlobalErrorHandlers()
// 监控后端初始化。未配置 VITE_SENTRY_DSN 时为 no-op；
// 不 await —— 上报能力晚几十毫秒就绪不影响首屏，错误在此之前由 console reporter 兜住。
void initMonitoring()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
  context: { queryClient },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AppErrorBoundary>
          <RouterProvider router={router} />
        </AppErrorBoundary>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)

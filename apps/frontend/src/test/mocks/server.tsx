/**
 * MSW server 生命周期 + QueryClient wrapper，供 hook 层测试复用。
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { setupServer } from 'msw/node'
import type { ReactNode } from 'react'

import { counters, handlers } from './handlers'

export { counters }

export const server = setupServer(...handlers)

export function startMockServer(): void {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => {
    server.resetHandlers()
    // 每个用例后清空 React Query 缓存（全局单例由测试自行创建时无需，
    // 这里主要防跨用例串扰）
    window.sessionStorage.clear()
  })
  afterAll(() => server.close())
}

/** 新建一个关掉 retry 的 QueryClient（测试要快、失败要立即可见） */
export function makeTestClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

export function withClient(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

export { renderHook, waitFor }

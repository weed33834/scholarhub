/**
 * Hook 层行为测试（MSW）—— 锁住 0.1.1 修复的分页 queryKey 语义与
 * mutation 成功后的缓存直写/前缀失效约定，防止回归。
 */
import { describe, expect, it } from 'vitest'

import {
  keys,
  useEditorDecision,
  useMarkAllRead,
  useMySubmissions,
  useUnreadCount,
} from '../use-modules'
import {
  counters,
  makeTestClient,
  renderHook,
  startMockServer,
  waitFor,
  withClient,
} from '../../../test/mocks/server'

startMockServer()

describe('useMySubmissions — 分页必须进 queryKey', () => {
  it('page=1 与 page=2 是两个独立缓存条目，互不覆盖', async () => {
    const client = makeTestClient()
    const wrapper = withClient(client)

    const first = renderHook(() => useMySubmissions(undefined, 1, 20), { wrapper })
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true))

    const second = renderHook(() => useMySubmissions(undefined, 2, 20), { wrapper })
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true))

    // 若 key 回归成不含分页（0.1.1 之前的 bug），第二次写入会覆盖第一次
    const page1 = client.getQueryData(keys.submission.mine(undefined, 1, 20)) as
      | { meta: { page: number } }
      | undefined
    const page2 = client.getQueryData(keys.submission.mine(undefined, 2, 20)) as
      | { meta: { page: number } }
      | undefined
    expect(page1?.meta.page).toBe(1)
    expect(page2?.meta.page).toBe(2)
  })
})

describe('useEditorDecision — 缓存直写 + 前缀失效', () => {
  it('成功后 detail 缓存被替换为新响应，且列表查询被标记为 stale 触发 refetch', async () => {
    const client = makeTestClient()
    const wrapper = withClient(client)

    // 先挂一个 ['submissions'] 前缀下的列表观察者
    const list = renderHook(() => useMySubmissions(undefined, 1, 20), { wrapper })
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true))
    const refetchesBefore = counters.submissionsMe

    // 预填 detail 缓存，验证 mutation 后被 setQueryData 直写覆盖
    client.setQueryData(keys.submission.detail(7), {
      id: 7,
      status: 'pending',
    })

    const decision = renderHook(() => useEditorDecision(), { wrapper })
    await decision.result.current.mutateAsync({
      id: 7,
      body: { decision: 'accept' },
    })

    const detail = client.getQueryData(keys.submission.detail(7)) as
      | { status: string }
      | undefined
    expect(detail?.status).toBe('accepted')
    expect(counters.decisionPut).toBe(1)

    // invalidateQueries({ queryKey: ['submissions'] }) 应让活跃观察者重新拉取
    await waitFor(() =>
      expect(counters.submissionsMe).toBeGreaterThan(refetchesBefore),
    )
  })
})

describe('useMarkAllRead — 失效通知前缀', () => {
  it('全部已读后 unread-count 观察者重新拉取', async () => {
    const client = makeTestClient()
    const wrapper = withClient(client)

    const unread = renderHook(() => useUnreadCount(), { wrapper })
    await waitFor(() => expect(unread.result.current.isSuccess).toBe(true))
    const before = counters.notificationsRefetch

    const markAll = renderHook(() => useMarkAllRead(), { wrapper })
    await markAll.result.current.mutateAsync()

    await waitFor(() =>
      expect(counters.notificationsRefetch).toBeGreaterThan(before),
    )
  })
})

/**
 * API client 行为测试 —— 基于真实 axios 实例 + 自定义 adapter。
 *
 * 旧的实现是「mock 掉 axios 再断言 mock 被调用」的同义反复，对最关键的
 * 401 单飞刷新（single-flight refresh）逻辑零覆盖。这里改为安装一个
 * 可编程的假 adapter（实例级拦截业务请求、全局级拦截 /auth/refresh），
 * 直接验证端到端行为：刷新一次、并发共享、失败登出、防循环、CSRF 头。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios, { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'

import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/auth'

interface CallRecord {
  url: string
  method: string
  authorization?: string
  csrfToken?: string
}

let calls: CallRecord[]
let refreshCallCount: number
/** 业务请求（走 api 实例）的可编程响应脚本 */
let businessHandler: (cfg: InternalAxiosRequestConfig) => Promise<AxiosResponse>
/** 刷新请求（走全局 axios）的行为脚本 */
let refreshBehavior: 'ok' | 'fail'

function makeResponse(cfg: InternalAxiosRequestConfig, status: number, data: unknown): AxiosResponse {
  return {
    data,
    status,
    statusText: String(status),
    headers: {},
    config: cfg,
  } as AxiosResponse
}

function make401(cfg: InternalAxiosRequestConfig): AxiosError {
  return new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', cfg, {}, makeResponse(cfg, 401, { detail: 'expired' }))
}

const fakeBusinessAdapter: AxiosAdapter = async (rawCfg) => {
  const cfg = rawCfg as InternalAxiosRequestConfig
  const headers = cfg.headers as Record<string, string | undefined>
  calls.push({
    url: cfg.url ?? '',
    method: (cfg.method ?? 'get').toLowerCase(),
    authorization: headers?.Authorization,
    csrfToken: headers?.['X-CSRF-Token'],
  })
  return businessHandler(cfg)
}

const fakeGlobalAdapter: AxiosAdapter = async (rawCfg) => {
  const cfg = rawCfg as InternalAxiosRequestConfig
  if ((cfg.url ?? '').includes('/auth/refresh')) {
    refreshCallCount += 1
    if (refreshBehavior === 'fail') throw make401(cfg)
    // 刷新成功：签发新 token 并写回 store（与真实后端契约一致）
    useAuthStore.getState().setAuth('refreshed-token', {
      id: 1,
      username: 'alice',
      is_admin: false,
    })
    return makeResponse(cfg, 200, {
      access_token: 'refreshed-token',
      user_id: 1,
      username: 'alice',
      is_admin: false,
    })
  }
  throw make401(cfg)
}

let originalInstanceAdapter: unknown
let originalGlobalAdapter: unknown

beforeEach(() => {
  vi.restoreAllMocks()
  calls = []
  refreshCallCount = 0
  refreshBehavior = 'ok'
  businessHandler = async () => makeResponse({} as InternalAxiosRequestConfig, 200, {})
  useAuthStore.setState({ token: 'stale-token', user: { id: 1, username: 'alice', is_admin: false } })

  originalInstanceAdapter = api.defaults.adapter
  originalGlobalAdapter = axios.defaults.adapter
  api.defaults.adapter = fakeBusinessAdapter
  axios.defaults.adapter = fakeGlobalAdapter
})

afterEach(() => {
  api.defaults.adapter = originalInstanceAdapter as AxiosAdapter
  axios.defaults.adapter = originalGlobalAdapter as AxiosAdapter
  useAuthStore.getState().logout()
})

describe('401 single-flight refresh', () => {
  it('首个 401 触发一次刷新并用新 token 重放原请求', async () => {
    let attempts = 0
    businessHandler = async (cfg) => {
      attempts += 1
      if (attempts === 1) throw make401(cfg)
      return makeResponse(cfg, 200, { ok: true })
    }

    const res = await api.get('/things')
    expect(res.data).toEqual({ ok: true })
    expect(refreshCallCount).toBe(1)

    // 重放请求必须携带刷新后的新 token
    const retries = calls.filter((c) => c.url === '/things')
    expect(retries).toHaveLength(2)
    expect(retries[0]?.authorization).toBe('Bearer stale-token')
    expect(retries[1]?.authorization).toBe('Bearer refreshed-token')
  })

  it('并发多个 401 只触发一次刷新（single-flight 共享 Promise）', async () => {
    let attempts = 0
    businessHandler = async (cfg) => {
      attempts += 1
      if (attempts <= 2) throw make401(cfg)
      return makeResponse(cfg, 200, { n: attempts })
    }

    const [a, b] = await Promise.all([api.get('/a'), api.get('/b')])
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
    // 关键断言：两个并发请求只应产生一次 /auth/refresh
    expect(refreshCallCount).toBe(1)
  })

  it('刷新自身 401 时登出并向上抛错（不无限循环）', async () => {
    refreshBehavior = 'fail'
    businessHandler = async (cfg) => {
      void cfg
      throw make401(cfg)
    }

    await expect(api.get('/protected')).rejects.toBeTruthy()
    expect(refreshCallCount).toBe(1)
    expect(useAuthStore.getState().token).toBeNull()
  })

  it('重试后仍然 401 时直接拒绝（_retried 防循环），不再二次刷新', async () => {
    businessHandler = async (cfg) => {
      // 无论重放多少次都 401
      throw make401(cfg)
    }

    await expect(api.get('/always-401')).rejects.toBeTruthy()
    expect(refreshCallCount).toBe(1)
  })
})

describe('request side contracts', () => {
  it('实例默认配置：baseURL=/api、withCredentials、10s 超时、重复参数序列化', () => {
    expect(api.defaults.baseURL).toBe('/api')
    expect(api.defaults.withCredentials).toBe(true)
    expect(api.defaults.timeout).toBe(10_000)
    expect((api.defaults.paramsSerializer as { indexes?: string }).indexes).toBeNull()
  })

  it('非幂等请求回显 X-CSRF-Token；GET 不带', async () => {
    document.cookie = 'csrf=abc123; Path=/'
    businessHandler = async (cfg) => makeResponse(cfg, 200, {})

    await api.get('/no-csrf')
    await api.post('/with-csrf', {})

    const get = calls.find((c) => c.method === 'get')
    const post = calls.find((c) => c.method === 'post')
    expect(get?.csrfToken).toBeUndefined()
    expect(post?.csrfToken).toBe('abc123')
    document.cookie = 'csrf=; Path=/; Max-Age=0'
  })

  it('无 token 时请求不带 Authorization 头', async () => {
    useAuthStore.setState({ token: null, user: null })
    businessHandler = async (cfg) => makeResponse(cfg, 200, {})
    await api.get('/anon')
    expect(calls[0]?.authorization).toBeUndefined()
  })
})

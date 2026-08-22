// query key 工厂（唯一真源）：所有域的 queryKey 都从这里取，
// 避免散落字符串导致失效前缀拼错。
import type { ResourceListParams } from '@/lib/types'

// query key 工厂，避免散落字符串
export const keys = {
  catalog: {
    list: (params: ResourceListParams) => ['catalog', 'list', params] as const,
    detail: (id: number) => ['catalog', 'detail', id] as const,
    stats: () => ['catalog', 'stats'] as const,
    facets: (params?: { type?: string; discipline?: string }) =>
      ['catalog', 'facets', params ?? {}] as const,
  },
  reader: {
    history: (page = 1) => ['reader', 'history', page] as const,
    progress: (id: number) => ['reader', 'progress', id] as const,
    fileAssets: () => ['reader', 'file-assets'] as const,
    fileAsset: (id: number) => ['reader', 'file-assets', id] as const,
  },
  submission: {
    // 分页参数必须进 key：否则 staleTime 内翻页会命中旧页缓存
    mine: (status?: string, page = 1, pageSize = 20) =>
      ['submissions', 'mine', status ?? 'all', page, pageSize] as const,
    all: (status?: string, page = 1, pageSize = 20) =>
      ['submissions', 'all', status ?? 'all', page, pageSize] as const,
    pending: (page = 1, pageSize = 20) =>
      ['submissions', 'pending', page, pageSize] as const,
    detail: (id: number) => ['submissions', 'detail', id] as const,
    assignments: (id: number) => ['submissions', id, 'assignments'] as const,
    reports: (id: number) => ['submissions', id, 'reports'] as const,
    versions: (id: number) => ['submissions', id, 'versions'] as const,
  },
  review: {
    myAssignments: (status?: string, page = 1, pageSize = 20) =>
      ['review', 'my-assignments', status ?? 'all', page, pageSize] as const,
    assignment: (id: number) => ['review', 'assignment', id] as const,
    // 审稿人查看分配稿件的完整内容
    submission: (assignmentId: number) =>
      ['review', 'assignment', assignmentId, 'submission'] as const,
  },
  library: {
    list: (page = 1) => ['library', 'list', page] as const,
    detail: (id: number) => ['library', 'detail', id] as const,
  },
  notifications: {
    list: (page = 1) => ['notifications', 'list', page] as const,
    unread: () => ['notifications', 'unread'] as const,
  },
  recommendations: {
    me: (limit = 10) => ['recommendations', 'me', limit] as const,
  },
  admin: {
    users: (limit = 50, offset = 0, q = '') =>
      ['admin', 'users', limit, offset, q] as const,
    audit: (limit = 50, offset = 0) => ['admin', 'audit', limit, offset] as const,
    reviewMode: () => ['admin', 'review-mode'] as const,
    volumes: () => ['admin', 'volumes'] as const,
    issues: (volume: string) => ['admin', 'issues', volume] as const,
    journalSettings: () => ['admin', 'journal-settings'] as const,
  },
  follows: {
    author: (name: string) => ['follows', 'author', name] as const,
    discipline: (slug: string) => ['follows', 'discipline', slug] as const,
    myAuthors: (page = 1) => ['follows', 'my-authors', page] as const,
    myDisciplines: () => ['follows', 'my-disciplines'] as const,
  },
  modules: () => ['modules'] as const,
  health: () => ['health'] as const,
} as const


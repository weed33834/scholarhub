// 从 use-modules.ts 按域拆分（0.2.0）；行为与缓存语义不变。
// 消费方仍可从 '@/hooks/api/use-modules' 桶导入，也可直接引本文件。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { keys } from './keys'
import type {
  AssignableRole,
  AuditLogEntry,
  IssueInfo,
  JournalSettings,
  ResourceListResponse,
  ReviewMode,
  ReviewModeResponse,
  UserResponse,
  VolumeInfo,
} from '@/lib/types'

// --- Admin ---
export function useAdminUsers(limit = 50, offset = 0, q = '') {
  return useQuery<UserResponse[]>({
    queryKey: keys.admin.users(limit, offset, q),
    // q 变化切 key 时保留旧列表：避免整表闪 Loading 导致行内下拉菜单
    // 被卸载重建（E2E 中表现为菜单项永远 "not stable"）。
    placeholderData: (prev) => prev,
    queryFn: async () =>
      (
        await api.get<UserResponse[]>('/admin/users', {
          params: { limit, offset, q: q || undefined },
        })
      ).data,
  })
}

export function useSetUserActive() {
  const qc = useQueryClient()
  return useMutation<UserResponse, Error, { userId: number; isActive: boolean }>({
    mutationFn: async ({ userId, isActive }) =>
      (await api.patch<UserResponse>(`/admin/users/${userId}/active`, null, {
        params: { is_active: isActive },
      })).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })
}

// admin 给用户分配角色（同租户内幂等：已分配则后端返回 200）
export function useAssignRole() {
  const qc = useQueryClient()
  return useMutation<UserResponse, Error, { userId: number; role: AssignableRole }>({
    mutationFn: async ({ userId, role }) =>
      (await api.post<UserResponse>(`/admin/users/${userId}/roles`, { role })).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })
}

// admin 撤销用户角色（不存在则后端 404）
export function useRevokeRole() {
  const qc = useQueryClient()
  return useMutation<UserResponse, Error, { userId: number; role: AssignableRole }>({
    mutationFn: async ({ userId, role }) =>
      (await api.delete<UserResponse>(`/admin/users/${userId}/roles/${role}`)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })
}

// 期刊评审模式（单盲 / 双盲）——租户级设置
export function useReviewMode() {
  return useQuery<ReviewModeResponse>({
    queryKey: keys.admin.reviewMode(),
    queryFn: async () =>
      (await api.get<ReviewModeResponse>('/admin/settings/review-mode')).data,
  })
}

export function useSetReviewMode() {
  const qc = useQueryClient()
  return useMutation<ReviewModeResponse, Error, ReviewMode>({
    mutationFn: async (review_mode) =>
      (await api.patch<ReviewModeResponse>('/admin/settings/review-mode', { review_mode }))
        .data,
    onSuccess: (data) => {
      qc.setQueryData(keys.admin.reviewMode(), data)
      // 审稿人看到的稿件内容随模式变化，相关缓存需失效
      void qc.invalidateQueries({ queryKey: ['review'] })
    },
  })
}

export function useAdminAuditLogs(limit = 50, offset = 0) {
  return useQuery<AuditLogEntry[]>({
    queryKey: keys.admin.audit(limit, offset),
    queryFn: async () =>
      (await api.get<AuditLogEntry[]>('/admin/audit-logs', { params: { limit, offset } })).data,
  })
}

// --- Volume / Issue management (admin) ---

export function useVolumeList() {
  return useQuery<VolumeInfo[]>({
    queryKey: keys.admin.volumes(),
    queryFn: async () => {
      const res = await api.get<ResourceListResponse>('/catalog', {
        params: { page_size: 100, sort: 'year', order: 'desc' },
      })
      const resources = res.data.data
      const volumeMap = new Map<string, { articles: number; issues: Set<string> }>()
      for (const r of resources) {
        if (!r.volume) continue
        const v = volumeMap.get(r.volume) ?? { articles: 0, issues: new Set<string>() }
        v.articles++
        if (r.issue) v.issues.add(r.issue)
        volumeMap.set(r.volume, v)
      }
      return Array.from(volumeMap.entries())
        .map(([volume, info]) => ({
          volume,
          articleCount: info.articles,
          issueCount: info.issues.size,
        }))
        .sort((a, b) => {
          const na = Number(a.volume)
          const nb = Number(b.volume)
          if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na
          return b.volume.localeCompare(a.volume)
        })
    },
    staleTime: 2 * 60_000,
  })
}

export function useIssueList(volume: string) {
  return useQuery<IssueInfo[]>({
    queryKey: keys.admin.issues(volume),
    queryFn: async () => {
      const res = await api.get<ResourceListResponse>('/catalog', {
        params: { page_size: 100, sort: 'year', order: 'desc' },
      })
      const resources = res.data.data.filter((r) => r.volume === volume)
      const issueMap = new Map<string, { articles: number; years: number[] }>()
      for (const r of resources) {
        if (!r.issue) continue
        const v = issueMap.get(r.issue) ?? { articles: 0, years: [] as number[] }
        v.articles++
        v.years.push(r.year)
        issueMap.set(r.issue, v)
      }
      return Array.from(issueMap.entries())
        .map(([issue, info]) => ({
          issue,
          articleCount: info.articles,
          firstYear: Math.min(...info.years),
          lastYear: Math.max(...info.years),
        }))
        .sort((a, b) => {
          const na = Number(a.issue)
          const nb = Number(b.issue)
          if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na
          return b.issue.localeCompare(a.issue)
        })
    },
    enabled: !!volume,
    staleTime: 2 * 60_000,
  })
}

export function useJournalSettings() {
  return useQuery<JournalSettings>({
    queryKey: keys.admin.journalSettings(),
    queryFn: async () => {
      const res = await api.get<ResourceListResponse>('/catalog', {
        params: { page_size: 100, sort: 'created_at', order: 'desc' },
      })
      const resources = res.data.data
      const issn = resources.find((r) => r.issn)?.issn ?? ''
      const publisher = resources.find((r) => r.publisher)?.publisher ?? ''
      const short_container_title =
        resources.find((r) => r.short_container_title)?.short_container_title ?? ''
      return { issn, publisher, short_container_title }
    },
    staleTime: 5 * 60_000,
  })
}

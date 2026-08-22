// 从 use-modules.ts 按域拆分（0.2.0）；行为与缓存语义不变。
// 消费方仍可从 '@/hooks/api/use-modules' 桶导入，也可直接引本文件。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { keys } from './keys'
import type {
  FacetBucket,
  ResourceCreate,
  ResourceFacets,
  ResourceListParams,
  ResourceListResponse,
  ResourceResponse,
  ResourceStats,
  ResourceUpdate,
} from '@/lib/types'

// --- Catalog ---
export function useResources(params: ResourceListParams = {}) {
  return useQuery<ResourceListResponse>({
    queryKey: keys.catalog.list(params),
    queryFn: async () => (await api.get<ResourceListResponse>('/catalog', { params })).data,
    placeholderData: (prev) => prev,
  })
}

export function useResource(id: number) {
  return useQuery<ResourceResponse>({
    queryKey: keys.catalog.detail(id),
    queryFn: async () => (await api.get<ResourceResponse>(`/catalog/${id}`)).data,
    enabled: id > 0,
  })
}

export function useCatalogStats() {
  return useQuery<ResourceStats>({
    queryKey: keys.catalog.stats(),
    queryFn: async () => (await api.get<ResourceStats>('/catalog/stats')).data,
    staleTime: 5 * 60_000,
  })
}

export function useCatalogFacets(params?: { type?: string; discipline?: string }) {
  return useQuery<ResourceFacets>({
    queryKey: keys.catalog.facets(params),
    queryFn: async () => (await api.get<ResourceFacets>('/catalog/facets', { params })).data,
    staleTime: 5 * 60_000,
  })
}

export function useCreateResource() {
  const qc = useQueryClient()
  return useMutation<ResourceResponse, Error, ResourceCreate>({
    mutationFn: async (body) => (await api.post<ResourceResponse>('/catalog', body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog'] })
    },
  })
}

export function useUpdateResource() {
  const qc = useQueryClient()
  return useMutation<
    ResourceResponse,
    Error,
    { id: number; body: ResourceUpdate }
  >({
    mutationFn: async ({ id, body }) =>
      (await api.patch<ResourceResponse>(`/catalog/${id}`, body)).data,
    onSuccess: (data, { id }) => {
      qc.setQueryData(keys.catalog.detail(id), data)
      void qc.invalidateQueries({ queryKey: ['catalog'] })
    },
  })
}

export function useDeleteResource() {
  const qc = useQueryClient()
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await api.delete(`/catalog/${id}`)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['catalog'] })
    },
  })
}

// Export 走 blob，触发浏览器下载
export async function exportResources(ids: number[], format: 'bibtex' | 'ris' | 'csv' | 'json') {
  const res = await api.get('/export', {
    params: { ids, format },
    responseType: 'blob',
  })
  // 从 Content-Disposition 解析文件名
  const disp = res.headers['content-disposition'] ?? ''
  const match = disp.match(/filename="?([^";]+)"?/i)
  const filename = match?.[1] ?? `export.${format}`
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// 把 FacetBucket 类型重导出供消费方使用
export type { FacetBucket }

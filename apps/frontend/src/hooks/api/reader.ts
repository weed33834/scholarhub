// 从 use-modules.ts 按域拆分（0.2.0）；行为与缓存语义不变。
// 消费方仍可从 '@/hooks/api/use-modules' 桶导入，也可直接引本文件。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { keys } from './keys'
import type {
  FileAssetCreate,
  FileAssetResponse,
  MessageResponse,
  ReadingHistoryListResponse,
  ReadingProgressResponse,
  ReadingProgressUpdate,
} from '@/lib/types'

// --- Reader ---
export function useReadingHistory(page = 1, pageSize = 20) {
  return useQuery<ReadingHistoryListResponse>({
    queryKey: keys.reader.history(page),
    queryFn: async () =>
      (await api.get<ReadingHistoryListResponse>('/reader/history', {
        params: { page, page_size: pageSize },
      })).data,
  })
}

export function useReadingProgress(
  resourceId: number,
  options?: { enabled?: boolean },
) {
  return useQuery<ReadingProgressResponse>({
    queryKey: keys.reader.progress(resourceId),
    queryFn: async () =>
      (await api.get<ReadingProgressResponse>(`/reader/history/${resourceId}/progress`)).data,
    // 访客不发请求：阅读进度接口需要登录，未登录时只会得到 401。
    enabled: resourceId > 0 && (options?.enabled ?? true),
  })
}

export function useRecordView() {
  const qc = useQueryClient()
  return useMutation<MessageResponse, Error, number>({
    mutationFn: async (resourceId) =>
      (await api.post<MessageResponse>(`/reader/history/${resourceId}`)).data,
    onSuccess: () => {
      // Without this, the reading-history list never sees the new entry.
      void qc.invalidateQueries({ queryKey: ['reader'] })
    },
  })
}

export function useUpdateProgress() {
  const qc = useQueryClient()
  return useMutation<
    ReadingProgressResponse,
    Error,
    { resourceId: number; body: ReadingProgressUpdate }
  >({
    mutationFn: async ({ resourceId, body }) =>
      (await api.put<ReadingProgressResponse>(`/reader/history/${resourceId}/progress`, body)).data,
    onSuccess: (data, { resourceId }) => {
      qc.setQueryData(keys.reader.progress(resourceId), data)
    },
  })
}

export function useRemoveFromHistory() {
  const qc = useQueryClient()
  return useMutation<MessageResponse, Error, number>({
    mutationFn: async (resourceId) =>
      (await api.delete<MessageResponse>(`/reader/history/${resourceId}`)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reader'] })
    },
  })
}

export function useFileAssets() {
  return useQuery<FileAssetResponse[]>({
    queryKey: keys.reader.fileAssets(),
    queryFn: async () => (await api.get<FileAssetResponse[]>('/reader/file-assets')).data,
  })
}

export function useCreateFileAsset() {
  const qc = useQueryClient()
  return useMutation<FileAssetResponse, Error, FileAssetCreate>({
    mutationFn: async (body) =>
      (await api.post<FileAssetResponse>('/reader/file-assets', body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reader', 'file-assets'] })
    },
  })
}

export function useDeleteFileAsset() {
  const qc = useQueryClient()
  return useMutation<MessageResponse, Error, number>({
    mutationFn: async (id) =>
      (await api.delete<MessageResponse>(`/reader/file-assets/${id}`)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reader', 'file-assets'] })
    },
  })
}

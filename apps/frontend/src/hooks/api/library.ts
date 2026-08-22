// 从 use-modules.ts 按域拆分（0.2.0）；行为与缓存语义不变。
// 消费方仍可从 '@/hooks/api/use-modules' 桶导入，也可直接引本文件。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { keys } from './keys'
import type {
  MessageResponse,
  ReadingListCreate,
  ReadingListDetailResponse,
  ReadingListItemCreate,
  ReadingListListResponse,
  ReadingListUpdate,
} from '@/lib/types'

// --- Library ---
export function useReadingLists(page = 1, pageSize = 20) {
  return useQuery<ReadingListListResponse>({
    queryKey: keys.library.list(page),
    queryFn: async () =>
      (await api.get<ReadingListListResponse>('/reading-lists', {
        params: { page, page_size: pageSize },
      })).data,
  })
}

export function useReadingList(id: number) {
  return useQuery<ReadingListDetailResponse>({
    queryKey: keys.library.detail(id),
    queryFn: async () =>
      (await api.get<ReadingListDetailResponse>(`/reading-lists/${id}`)).data,
    enabled: id > 0,
  })
}

export function useCreateReadingList() {
  const qc = useQueryClient()
  return useMutation<ReadingListDetailResponse, Error, ReadingListCreate>({
    mutationFn: async (body) =>
      (await api.post<ReadingListDetailResponse>('/reading-lists', body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['library'] })
    },
  })
}

export function useUpdateReadingList() {
  const qc = useQueryClient()
  return useMutation<
    ReadingListDetailResponse,
    Error,
    { id: number; body: ReadingListUpdate }
  >({
    mutationFn: async ({ id, body }) =>
      (await api.patch<ReadingListDetailResponse>(`/reading-lists/${id}`, body)).data,
    onSuccess: (data, { id }) => {
      qc.setQueryData(keys.library.detail(id), data)
      void qc.invalidateQueries({ queryKey: ['library'] })
    },
  })
}

export function useDeleteReadingList() {
  const qc = useQueryClient()
  return useMutation<MessageResponse, Error, number>({
    mutationFn: async (id) => (await api.delete<MessageResponse>(`/reading-lists/${id}`)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['library'] })
    },
  })
}

export function useAddReadingListItem() {
  const qc = useQueryClient()
  return useMutation<
    ReadingListDetailResponse,
    Error,
    { listId: number; body: ReadingListItemCreate }
  >({
    mutationFn: async ({ listId, body }) =>
      (await api.post<ReadingListDetailResponse>(`/reading-lists/${listId}/items`, body)).data,
    onSuccess: (data, { listId }) => {
      qc.setQueryData(keys.library.detail(listId), data)
      void qc.invalidateQueries({ queryKey: ['library'] })
    },
  })
}

export function useRemoveReadingListItem() {
  const qc = useQueryClient()
  return useMutation<void, Error, { listId: number; resourceId: number }>({
    mutationFn: async ({ listId, resourceId }) => {
      await api.delete(`/reading-lists/${listId}/items/${resourceId}`)
    },
    onSuccess: (_, { listId }) => {
      void qc.invalidateQueries({ queryKey: keys.library.detail(listId) })
    },
  })
}

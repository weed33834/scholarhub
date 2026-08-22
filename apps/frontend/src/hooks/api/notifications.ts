// 从 use-modules.ts 按域拆分（0.2.0）；行为与缓存语义不变。
// 消费方仍可从 '@/hooks/api/use-modules' 桶导入，也可直接引本文件。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { keys } from './keys'
import type {
  MessageResponse,
  NotificationListResponse,
  NotificationResponse,
  UnreadCountResponse,
} from '@/lib/types'

// --- Notifications ---
export function useNotifications(page = 1, pageSize = 20) {
  return useQuery<NotificationListResponse>({
    queryKey: keys.notifications.list(page),
    queryFn: async () =>
      (await api.get<NotificationListResponse>('/notifications', {
        params: { page, page_size: pageSize },
      })).data,
    refetchInterval: 30_000,
  })
}

export function useUnreadCount(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true
  return useQuery<UnreadCountResponse>({
    queryKey: keys.notifications.unread(),
    queryFn: async () => (await api.get<UnreadCountResponse>('/notifications/unread-count')).data,
    // 访客不轮询：未登录时该接口只会返回 401，白白打请求。
    enabled,
    refetchInterval: enabled ? 30_000 : false,
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation<{ updated: number }, Error, void>({
    mutationFn: async () => (await api.patch('/notifications/read-all')).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useMarkRead() {
  const qc = useQueryClient()
  return useMutation<NotificationResponse, Error, number>({
    mutationFn: async (id) =>
      (await api.patch<NotificationResponse>(`/notifications/${id}/read`)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useDeleteNotification() {
  const qc = useQueryClient()
  return useMutation<MessageResponse, Error, number>({
    mutationFn: async (id) =>
      (await api.delete<MessageResponse>(`/notifications/${id}`)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

// 从 use-modules.ts 按域拆分（0.2.0）；行为与缓存语义不变。
// 消费方仍可从 '@/hooks/api/use-modules' 桶导入，也可直接引本文件。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { keys } from './keys'
import type {
  AuthorFollowListResponse,
  DisciplineSubscriptionListResponse,
  FollowStatusResponse,
  SubscriptionStatusResponse,
} from '@/lib/types'

// --- Follows ---
export function useAuthorFollowStatus(authorName: string) {
  return useQuery<FollowStatusResponse>({
    queryKey: keys.follows.author(authorName),
    queryFn: async () =>
      (await api.get<FollowStatusResponse>(`/authors/${encodeURIComponent(authorName)}/follow`)).data,
    enabled: !!authorName,
  })
}

export function useFollowAuthor() {
  const qc = useQueryClient()
  return useMutation<FollowStatusResponse, Error, string>({
    mutationFn: async (authorName) =>
      (await api.post<FollowStatusResponse>(`/authors/${encodeURIComponent(authorName)}/follow`)).data,
    onSuccess: (data, authorName) => {
      qc.setQueryData(keys.follows.author(authorName), data)
      void qc.invalidateQueries({ queryKey: ['follows', 'my-authors'] })
    },
  })
}

export function useUnfollowAuthor() {
  const qc = useQueryClient()
  return useMutation<FollowStatusResponse, Error, string>({
    mutationFn: async (authorName) =>
      (await api.delete<FollowStatusResponse>(`/authors/${encodeURIComponent(authorName)}/follow`)).data,
    onSuccess: (data, authorName) => {
      qc.setQueryData(keys.follows.author(authorName), data)
      void qc.invalidateQueries({ queryKey: ['follows', 'my-authors'] })
    },
  })
}

export function useMyFollowedAuthors(page = 1, pageSize = 20) {
  return useQuery<AuthorFollowListResponse>({
    queryKey: keys.follows.myAuthors(page),
    queryFn: async () =>
      (await api.get<AuthorFollowListResponse>('/users/me/following/authors', {
        params: { page, page_size: pageSize },
      })).data,
  })
}

export function useDisciplineSubscriptionStatus(discipline: string) {
  return useQuery<SubscriptionStatusResponse>({
    queryKey: keys.follows.discipline(discipline),
    queryFn: async () =>
      (await api.get<SubscriptionStatusResponse>(`/disciplines/${encodeURIComponent(discipline)}/subscribe`)).data,
    enabled: !!discipline,
  })
}

export function useSubscribeDiscipline() {
  const qc = useQueryClient()
  return useMutation<SubscriptionStatusResponse, Error, string>({
    mutationFn: async (discipline) =>
      (await api.post<SubscriptionStatusResponse>(`/disciplines/${encodeURIComponent(discipline)}/subscribe`)).data,
    onSuccess: (data, discipline) => {
      qc.setQueryData(keys.follows.discipline(discipline), data)
      void qc.invalidateQueries({ queryKey: ['follows', 'my-disciplines'] })
    },
  })
}

export function useUnsubscribeDiscipline() {
  const qc = useQueryClient()
  return useMutation<SubscriptionStatusResponse, Error, string>({
    mutationFn: async (discipline) =>
      (await api.delete<SubscriptionStatusResponse>(`/disciplines/${encodeURIComponent(discipline)}/subscribe`)).data,
    onSuccess: (data, discipline) => {
      qc.setQueryData(keys.follows.discipline(discipline), data)
      void qc.invalidateQueries({ queryKey: ['follows', 'my-disciplines'] })
    },
  })
}

export function useMySubscribedDisciplines() {
  return useQuery<DisciplineSubscriptionListResponse>({
    queryKey: keys.follows.myDisciplines(),
    queryFn: async () =>
      (await api.get<DisciplineSubscriptionListResponse>('/users/me/subscriptions/disciplines')).data,
  })
}

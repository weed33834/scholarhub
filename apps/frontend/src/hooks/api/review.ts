// 从 use-modules.ts 按域拆分（0.2.0）；行为与缓存语义不变。
// 消费方仍可从 '@/hooks/api/use-modules' 桶导入，也可直接引本文件。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { keys } from './keys'
import type {
  AssignmentListResponse,
  AssignmentResponse,
  ReviewReportResponse,
  ReviewSubmit,
  SubmissionResponse,
} from '@/lib/types'

// --- Reviewer side ---
export function useMyReviewAssignments(status?: string, page = 1, pageSize = 20) {
  return useQuery<AssignmentListResponse>({
    queryKey: keys.review.myAssignments(status, page, pageSize),
    queryFn: async () =>
      (await api.get<AssignmentListResponse>('/review/assignments/me', {
        params: { status, page, page_size: pageSize },
      })).data,
  })
}

export function useReviewAssignment(id: number) {
  return useQuery<AssignmentResponse>({
    queryKey: keys.review.assignment(id),
    queryFn: async () =>
      (await api.get<AssignmentResponse>(`/review/assignments/${id}`)).data,
    enabled: id > 0,
  })
}

// 审稿人查看分配稿件的完整内容（abstract / file_path / keywords / jel_codes 等）
// 单盲剥离仅作用于作者侧的 review reports，审稿人需要看完整稿件
export function useReviewSubmissionDetail(assignmentId: number) {
  return useQuery<SubmissionResponse>({
    queryKey: keys.review.submission(assignmentId),
    queryFn: async () =>
      (await api.get<SubmissionResponse>(
        `/review/assignments/${assignmentId}/submission`,
      )).data,
    enabled: assignmentId > 0,
  })
}

export function useAcceptAssignment() {
  const qc = useQueryClient()
  return useMutation<AssignmentResponse, Error, number>({
    mutationFn: async (id) =>
      (await api.post<AssignmentResponse>(`/review/assignments/${id}/accept`)).data,
    onSuccess: (data, id) => {
      qc.setQueryData(keys.review.assignment(id), data)
      void qc.invalidateQueries({ queryKey: ['review', 'my-assignments'] })
    },
  })
}

export function useDeclineAssignment() {
  const qc = useQueryClient()
  return useMutation<AssignmentResponse, Error, number>({
    mutationFn: async (id) =>
      (await api.post<AssignmentResponse>(`/review/assignments/${id}/decline`)).data,
    onSuccess: (data, id) => {
      qc.setQueryData(keys.review.assignment(id), data)
      void qc.invalidateQueries({ queryKey: ['review', 'my-assignments'] })
    },
  })
}

export function useSubmitReview() {
  const qc = useQueryClient()
  return useMutation<ReviewReportResponse, Error, { id: number; body: ReviewSubmit }>({
    mutationFn: async ({ id, body }) =>
      (await api.post<ReviewReportResponse>(`/review/assignments/${id}/submit`, body)).data,
    onSuccess: (_, { id }) => {
      void qc.invalidateQueries({ queryKey: keys.review.assignment(id) })
      void qc.invalidateQueries({ queryKey: ['review', 'my-assignments'] })
    },
  })
}

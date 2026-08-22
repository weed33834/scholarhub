// 从 use-modules.ts 按域拆分（0.2.0）；行为与缓存语义不变。
// 消费方仍可从 '@/hooks/api/use-modules' 桶导入，也可直接引本文件。

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { keys } from './keys'
import type {
  AssignmentCreate,
  AssignmentListResponse,
  AssignmentResponse,
  MessageResponse,
  ReviewReportResponse,
  SubmissionCreate,
  SubmissionDecision,
  SubmissionListResponse,
  SubmissionResponse,
  SubmissionUpdate,
  SubmissionVersionListResponse,
  SubmissionVersionResponse,
} from '@/lib/types'

// --- Submission ---
export function useCreateSubmission() {
  const qc = useQueryClient()
  return useMutation<MessageResponse, Error, SubmissionCreate>({
    mutationFn: async (body) =>
      (await api.post<MessageResponse>('/submissions', body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['submissions'] })
    },
  })
}

export function useMySubmissions(status?: string, page = 1, pageSize = 20) {
  return useQuery<SubmissionListResponse>({
    queryKey: keys.submission.mine(status, page, pageSize),
    queryFn: async () =>
      (await api.get<SubmissionListResponse>('/submissions/me', {
        params: { status, page, page_size: pageSize },
      })).data,
  })
}

export function useAllSubmissions(status?: string, page = 1, pageSize = 20) {
  return useQuery<SubmissionListResponse>({
    queryKey: keys.submission.all(status, page, pageSize),
    queryFn: async () =>
      (await api.get<SubmissionListResponse>('/submissions', {
        params: { status, page, page_size: pageSize },
      })).data,
  })
}

export function usePendingSubmissions(page = 1, pageSize = 20) {
  return useQuery<SubmissionListResponse>({
    queryKey: keys.submission.pending(page, pageSize),
    queryFn: async () =>
      (await api.get<SubmissionListResponse>('/submissions/pending', {
        params: { page, page_size: pageSize },
      })).data,
  })
}

export function useReviewSubmission() {
  const qc = useQueryClient()
  return useMutation<
    MessageResponse,
    Error,
    {
      id: number
      body: { status: 'approved' | 'rejected'; admin_note?: string; resource_id?: number }
    }
  >({
    mutationFn: async ({ id, body }) =>
      (await api.patch<MessageResponse>(`/submissions/${id}/review`, body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['submissions'] })
    },
  })
}

export function useDeleteSubmission() {
  const qc = useQueryClient()
  return useMutation<MessageResponse, Error, number>({
    mutationFn: async (id) => (await api.delete<MessageResponse>(`/submissions/${id}`)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['submissions'] })
    },
  })
}

export function useSubmission(id: number) {
  return useQuery<SubmissionResponse>({
    queryKey: keys.submission.detail(id),
    queryFn: async () =>
      (await api.get<SubmissionResponse>(`/submissions/${id}`)).data,
    enabled: id > 0,
  })
}

// 编辑分配审稿人
export function useAssignReviewer() {
  const qc = useQueryClient()
  return useMutation<AssignmentResponse, Error, { id: number; body: AssignmentCreate }>({
    mutationFn: async ({ id, body }) =>
      (await api.post<AssignmentResponse>(`/submissions/${id}/assignments`, body)).data,
    onSuccess: (_, { id }) => {
      void qc.invalidateQueries({ queryKey: keys.submission.assignments(id) })
      void qc.invalidateQueries({ queryKey: ['submissions'] })
    },
  })
}

export function useSubmissionAssignments(id: number) {
  return useQuery<AssignmentListResponse>({
    queryKey: keys.submission.assignments(id),
    queryFn: async () =>
      (await api.get<AssignmentListResponse>(`/submissions/${id}/assignments`)).data,
    enabled: id > 0,
  })
}

export function useCancelAssignment() {
  const qc = useQueryClient()
  return useMutation<MessageResponse, Error, { submissionId: number; assignmentId: number }>({
    mutationFn: async ({ submissionId, assignmentId }) =>
      (await api.delete<MessageResponse>(
        `/submissions/${submissionId}/assignments/${assignmentId}`,
      )).data,
    onSuccess: (_, { submissionId }) => {
      void qc.invalidateQueries({ queryKey: keys.submission.assignments(submissionId) })
    },
  })
}

// 编辑 4-元决定
export function useEditorDecision() {
  const qc = useQueryClient()
  return useMutation<SubmissionResponse, Error, { id: number; body: SubmissionDecision }>({
    mutationFn: async ({ id, body }) =>
      (await api.patch<SubmissionResponse>(`/submissions/${id}/decision`, body)).data,
    onSuccess: (_, { id }) => {
      qc.setQueryData(keys.submission.detail(id), _)
      void qc.invalidateQueries({ queryKey: ['submissions'] })
    },
  })
}

// 作者重投（note 可选：给编辑的修改说明，随新版本存档）
export function useResubmitSubmission() {
  const qc = useQueryClient()
  return useMutation<SubmissionResponse, Error, { id: number; note?: string }>({
    mutationFn: async ({ id, note }) =>
      (
        await api.post<SubmissionResponse>(
          `/submissions/${id}/resubmit`,
          note ? { note } : {},
        )
      ).data,
    onSuccess: (data, { id }) => {
      qc.setQueryData(keys.submission.detail(id), data)
      void qc.invalidateQueries({ queryKey: ['submissions'] })
    },
  })
}

// 作者修改稿件内容（pending / major_revision / minor_revision 状态限定）
export function useUpdateSubmission() {
  const qc = useQueryClient()
  return useMutation<SubmissionResponse, Error, { id: number; body: SubmissionUpdate }>({
    mutationFn: async ({ id, body }) =>
      (await api.patch<SubmissionResponse>(`/submissions/${id}`, body)).data,
    onSuccess: (data, { id }) => {
      qc.setQueryData(keys.submission.detail(id), data)
      void qc.invalidateQueries({ queryKey: ['submissions'] })
    },
  })
}

// 稿件版本历史（作者 + 编辑可见）
export function useSubmissionVersions(id: number, enabled = true) {
  return useQuery<SubmissionVersionResponse[]>({
    queryKey: keys.submission.versions(id),
    queryFn: async () =>
      (
        await api.get<SubmissionVersionListResponse>(
          `/submissions/${id}/versions`,
        )
      ).data.data,
    enabled: enabled && id > 0,
  })
}

// 作者上传稿件文件
export function useUploadSubmissionFile() {
  const qc = useQueryClient()
  return useMutation<SubmissionResponse, Error, { id: number; file: File }>({
    mutationFn: async ({ id, file }) => {
      const form = new FormData()
      form.append('file', file)
      // axios 自动设置 multipart boundary；这里显式清掉 Content-Type 让浏览器接管
      const { data } = await api.post<SubmissionResponse>(
        `/submissions/${id}/files`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return data
    },
    onSuccess: (data, { id }) => {
      qc.setQueryData(keys.submission.detail(id), data)
      void qc.invalidateQueries({ queryKey: ['submissions'] })
    },
  })
}

// 下载稿件文件（作者/编辑/被指派审稿人）。用 blob + programmatic <a>
// 而不是裸 <a href>：请求必须带 Authorization 头，纯链接带不上。
export async function downloadSubmissionFile(id: number): Promise<void> {
  const { data, headers } = await api.get<Blob>(`/submissions/${id}/files`, {
    responseType: 'blob',
  })
  const disposition = (headers['content-disposition'] as string | undefined) ?? ''
  const match = /filename="?([^";]+)"?/.exec(disposition)
  const filename = match?.[1] ?? `submission-${id}.pdf`
  const url = URL.createObjectURL(data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// 审稿报告列表（单盲：作者只看 comments_to_author）
export function useSubmissionReports(id: number) {
  return useQuery<ReviewReportResponse[]>({
    queryKey: keys.submission.reports(id),
    queryFn: async () =>
      (await api.get<ReviewReportResponse[]>(`/submissions/${id}/reports`)).data,
    enabled: id > 0,
  })
}

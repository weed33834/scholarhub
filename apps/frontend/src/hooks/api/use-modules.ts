import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type {
  AssignmentCreate,
  AssignmentListResponse,
  AssignmentResponse,
  AssignableRole,
  AuditLogEntry,
  AuthorFollowListResponse,
  DisciplineSubscriptionListResponse,
  FacetBucket,
  FetchRequest,
  FileAssetCreate,
  FileAssetResponse,
  FollowStatusResponse,
  HealthResponse,
  IngestResource,
  IssueInfo,
  JournalSettings,
  MessageResponse,
  ModuleInfo,
  NotificationListResponse,
  NotificationResponse,
  ParseRequest,
  ParseResponse,
  ReadingHistoryListResponse,
  ReadingListCreate,
  ReadingListDetailResponse,
  ReadingListItemCreate,
  ReadingListListResponse,
  ReadingListUpdate,
  ReadingProgressResponse,
  ReadingProgressUpdate,
  RecommendationListResponse,
  ResourceCreate,
  ResourceFacets,
  ResourceListParams,
  ResourceListResponse,
  ResourceResponse,
  ResourceStats,
  ResourceUpdate,
  ReviewMode,
  ReviewModeResponse,
  ReviewReportResponse,
  ReviewSubmit,
  SubmissionCreate,
  SubmissionDecision,
  SubmissionListResponse,
  SubmissionResponse,
  SubmissionUpdate,
  SubmissionVersionListResponse,
  SubmissionVersionResponse,
  SubscriptionStatusResponse,
  UnreadCountResponse,
  UserResponse,
  VolumeInfo,
} from '@/lib/types'

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

// --- Modules + Health ---
export function useModules() {
  return useQuery<ModuleInfo[]>({
    queryKey: keys.modules(),
    queryFn: async () => (await api.get<ModuleInfo[]>('/modules')).data,
    staleTime: 5 * 60_000,
  })
}

export function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: keys.health(),
    queryFn: async () => (await api.get<HealthResponse>('/health')).data,
    staleTime: 30_000,
  })
}

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

// --- Recommendations ---
export function useMyRecommendations(limit = 10) {
  return useQuery<RecommendationListResponse>({
    queryKey: keys.recommendations.me(limit),
    queryFn: async () =>
      (await api.get<RecommendationListResponse>('/recommendations/me', {
        params: { limit },
      })).data,
  })
}

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

// --- Ingest ---
export function useParseIngest() {
  return useMutation<ParseResponse, Error, ParseRequest>({
    mutationFn: async (body) => (await api.post<ParseResponse>('/ingest/parse', body)).data,
  })
}

export function useFetchIngest() {
  return useMutation<IngestResource, Error, FetchRequest>({
    mutationFn: async (body) => (await api.post<IngestResource>('/ingest/fetch', body)).data,
  })
}

// --- Admin ---
export function useAdminUsers(limit = 50, offset = 0, q = '') {
  return useQuery<UserResponse[]>({
    queryKey: keys.admin.users(limit, offset, q),
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

// 把 FacetBucket 类型重导出供消费方使用
export type { FacetBucket }

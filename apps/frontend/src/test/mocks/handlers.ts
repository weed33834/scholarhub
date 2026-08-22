/**
 * MSW 默认 handlers —— hook 层测试共用。
 *
 * 只覆盖测试用到的端点；未匹配的请求由 onUnhandledRequest: 'error'
 * 直接报错，避免测试静默打到真实网络或空响应。
 */
import { http, HttpResponse } from 'msw'

export const counters = {
  decisionPut: 0,
  notificationsRefetch: 0,
  submissionsMe: 0,
}

export function resetCounters(): void {
  counters.decisionPut = 0
  counters.notificationsRefetch = 0
  counters.submissionsMe = 0
}

/** 构造一份最小可用的 SubmissionListResponse */
function submissionList(page: number) {
  return {
    data: [
      {
        id: page,
        title: `Paper p${page}`,
        type: 'paper',
        authors: ['A'],
        year: 2024,
        discipline: 'cs',
        tags: [],
        abstract: '',
        preview: '',
        status: 'pending',
        submitted_by: 1,
        submitted_at: '2026-01-01T00:00:00Z',
      },
    ],
    meta: { total: 2, page, page_size: 20, total_pages: 1 },
  }
}

export const handlers = [
  // 分页 key 测试：按 page 返回可区分的 payload
  http.get('/api/submissions/me', ({ request }) => {
    counters.submissionsMe += 1
    const page = Number(new URL(request.url).searchParams.get('page') ?? '1')
    return HttpResponse.json(submissionList(page))
  }),

  http.patch('/api/submissions/:id/decision', async ({ request }) => {
    counters.decisionPut += 1
    const body = (await request.json()) as { decision?: string }
    return HttpResponse.json({
      id: 7,
      title: 'Paper #7',
      type: 'paper',
      authors: [],
      year: 2024,
      tags: [],
      abstract: '',
      preview: '',
      status: body.decision === 'accept' ? 'accepted' : 'pending',
      submitted_by: 1,
      submitted_at: '2026-01-01T00:00:00Z',
    })
  }),

  http.get('/api/notifications/unread-count', () => {
    counters.notificationsRefetch += 1
    return HttpResponse.json({ unread: 3 })
  }),

  http.patch('/api/notifications/read-all', () =>
    HttpResponse.json({ updated: 3 }),
  ),
]

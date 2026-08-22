import { useEffect, useRef, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useIsMobile } from '@/hooks/use-is-mobile'
import {
  useReadingProgress,
  useRemoveFromHistory,
  useResource,
  useUpdateProgress,
} from '@/hooks/api/use-modules'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { EmptyState, ErrorState, Loading } from '@/components/common/state'
import { requireAuth } from '@/lib/auth-guard'

// Restrict reader iframe to https: scheme so data:/blob:/javascript:
// URLs cannot execute content inside the PDF viewer frame.
function isSafeDownloadUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:'
  } catch {
    return false
  }
}

export const Route = createFileRoute('/reader/$resourceId')({
  beforeLoad: ({ location }) => requireAuth(location),
  component: ReaderPage,
})

function ReaderPage() {
  const { resourceId } = Route.useParams()
  const id = Number(resourceId)
  const navigate = useNavigate()

  const { data, isLoading, isError, refetch } = useResource(id)
  const progress = useReadingProgress(id)
  const updateMut = useUpdateProgress()
  const removeMut = useRemoveFromHistory()

  const [page, setPage] = useState(1)
  const [progressPercent, setProgressPercent] = useState(0)
  const [completed, setCompleted] = useState(false)
  // 本地累加器：仅跟踪本次会话新增的秒数，flush 后清零
  const [localDuration, setLocalDuration] = useState(0)
  const [removeOpen, setRemoveOpen] = useState(false)
  const isMobile = useIsMobile()

  // 标记是否已从服务端同步过进度。
  // React StrictMode 在 dev 下会 mount→unmount→mount：第一次 unmount 时
  // stateRef 还是初始值（page=1, progress=0），如果此时 flush 会把 server
  // 端的真实进度覆盖成 1/0。加这个 guard 避免首次同步前上报。
  const hasSyncedRef = useRef(false)

  // 从服务端进度初始化本地状态（仅首次加载时）。
  // 用 isFetched 而非 isLoading 判断 query 完成：React Query v5 中 isLoading
  // 在 query pending 时为 true，但对于 404 + retry=1 的场景，retry 期间 isLoading
  // 仍是 true。如果用户在 retry 期间点击保存进度，hasSyncedRef 还没设为 true，
  // flush 会 early-return，PUT 永远不发。isFetched 在 query 第一次
  // 完成（无论成功失败）后变 true 且不会被 retry 重置，更稳健。
  // 新用户在服务端没有 history，GET /progress 返回 404，progress.data 为
  // undefined，但 hasSynced 仍需设为 true，否则用户的输入永远无法上报。
  // hasSynced 同时作为"已初始化"标志：PUT 成功后 onSuccess 会更新
  // progress.data，但此时不应再用 server 数据覆盖本地 state。
  const [hasSynced, setHasSynced] = useState(false)
  // 同步 ref 以便 flush 闭包读取
  if (hasSynced) {
    // eslint-disable-next-line react-hooks/refs
    hasSyncedRef.current = true
  }
  // render-time 初始化：服务端数据到达后同步到本地状态，非 effect
  if (progress.isFetched && !hasSynced) {
    setHasSynced(true)
    if (progress.data) {
      setPage(progress.data.page ?? 1)
      setProgressPercent(progress.data.progress_percent ?? 0)
      setCompleted(progress.data.completed)
    }
  }

  // 用 ref 持有最新值，让 setInterval 回调读取时不被闭包冻结
  const stateRef = useRef({ page, progressPercent, completed, localDuration })

  const flush = async () => {
    // 首次 mount 未同步完成前不 flush，避免 StrictMode 双挂载时
    // 用初始值覆盖服务端的真实进度。
    if (!hasSyncedRef.current) return
    const s = stateRef.current
    // 即使 localDuration=0 也可能 page/progress/completed 已变更，
    // 所以无条件上报（duration=0 后端 no-op）。
    try {
      await updateMut.mutateAsync({
        resourceId: id,
        body: {
          page: s.page,
          progress_percent: s.progressPercent,
          duration_sec: s.localDuration,
          completed: s.completed,
        },
      })
      setLocalDuration(0)
    } catch {
      // flush 失败静默，下个周期会重试
    }
  }

  const flushRef = useRef(flush)

  // 在 effect 中同步 ref，避免 render 阶段直接修改 ref
  useEffect(() => {
    stateRef.current = { page, progressPercent, completed, localDuration }
    flushRef.current = flush
  })
  useEffect(() => {
    const ticker = setInterval(() => {
      setLocalDuration((s) => s + 1)
    }, 1000)
    const flusher = setInterval(() => {
      void flushRef.current()
    }, 30_000)
    return () => {
      clearInterval(ticker)
      clearInterval(flusher)
      // unmount 时立即上报最后一次累积的进度，避免丢失最多 29s
      void flushRef.current()
    }
  }, [])

  // 翻页前立即 flush 旧状态
  const goToPage = (newPage: number) => {
    void flush()
    setPage(Math.max(1, newPage))
  }

  const onManualUpdate = async () => {
    // 用户手动点击"保存进度"：绕过 flush 的 hasSyncedRef guard。
    // 原因：GET /progress 在新用户上返回 404 + retry=1，整个 query 完成需要
    // ~1.5s。如果用户在这期间点击保存进度，hasSyncedRef.current 还是 false，
    // flush 会 early-return，PUT 永远不发，进度丢失。手动点击是显式用户意图，
    // 应该立即上报当前 stateRef 的值。
    const s = stateRef.current
    try {
      await updateMut.mutateAsync({
        resourceId: id,
        body: {
          page: s.page,
          progress_percent: s.progressPercent,
          duration_sec: s.localDuration,
          completed: s.completed,
        },
      })
      setLocalDuration(0)
      // 手动 PUT 成功后，把 hasSyncedRef 设为 true：后续 unmount 时的 flush
      // 可以正常工作（不会再 early-return）。如果 useEffect 在 query 完成
      // 后已经设过，这里是无害的赋值。
      hasSyncedRef.current = true
      toast.success('进度已保存')
    } catch {
      toast.error('保存失败')
    }
  }

  const onRemove = async () => {
    try {
      await removeMut.mutateAsync(id)
      toast.success('已从阅读历史移除')
      void navigate({ to: '/catalog' })
    } catch {
      toast.error('移除失败')
    }
  }

  if (isLoading) return <Loading />
  if (isError || !data) {
    return <ErrorState message="加载资源失败" onRetry={() => refetch()} />
  }

  const totalDuration = (progress.data?.duration_sec ?? 0) + localDuration

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* 顶部标题栏 */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 sm:gap-3">
        <Link
          to="/catalog/$resourceId"
          params={{ resourceId: String(id) }}
          className="inline-flex shrink-0 items-center text-sm text-muted-foreground hover:text-primary"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          返回详情
        </Link>
        <span className="min-w-0 flex-1 text-sm font-medium line-clamp-1">{data.title}</span>
        {data.type && <Badge variant="secondary">{data.type}</Badge>}
      </div>

      <div
        className={
          'flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden' +
          (isMobile ? ' pb-20' : '')
        }
      >
        {/* PDF 主体 */}
        <div className="flex-1 overflow-hidden p-4">
          {data.download_url && isSafeDownloadUrl(data.download_url) ? (
            <iframe
              src={data.download_url}
              title={data.title}
              className="h-[60vh] w-full rounded-md border lg:h-full"
              sandbox="allow-same-origin allow-popups"
            />
          ) : (
            <EmptyState
              title="暂无可阅读文件"
              description={
                data.download_url
                  ? '该资源下载链接协议不安全，已阻止加载。'
                  : '该资源未提供下载链接。'
              }
            />
          )}
        </div>

        {/* 右侧进度栏：桌面端固定侧栏，移动端堆叠到下方全宽 */}
        <aside className="w-full shrink-0 overflow-y-auto border-t p-4 lg:w-72 lg:border-l lg:border-t-0">
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">阅读进度</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="page">页码</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="page"
                    type="number"
                    min={1}
                    value={page}
                    onChange={(e) => setPage(Number(e.target.value))}
                    className="h-8 w-20"
                  />
                  {/* 移动端：翻页由底部固定操作栏独占，这里仅桌面端显示，避免控件重复 */}
                  <Button
                    size="sm"
                    variant="outline"
                    className="max-md:hidden"
                    onClick={() => goToPage(page - 1)}
                  >
                    上一页
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="max-md:hidden"
                    onClick={() => goToPage(page + 1)}
                  >
                    下一页
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="progress">
                  进度：{progressPercent}%
                </Label>
                <input
                  id="progress"
                  type="range"
                  min={0}
                  max={100}
                  value={progressPercent}
                  onChange={(e) => setProgressPercent(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="completed"
                  type="checkbox"
                  checked={completed}
                  onChange={(e) => setCompleted(e.target.checked)}
                />
                <Label htmlFor="completed" className="cursor-pointer">
                  已读完
                </Label>
              </div>

              <div className="space-y-1 border-t pt-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">总时长</span>
                  <span>{Math.round(totalDuration / 60)} 分钟</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">最近阅读</span>
                  <span>{progress.data?.last_read_at ?? '—'}</span>
                </div>
              </div>

              {/* 移动端：保存进度由底部固定操作栏独占，这里仅桌面端显示 */}
              <Button
                className="w-full max-md:hidden"
                size="sm"
                onClick={onManualUpdate}
                disabled={updateMut.isPending}
              >
                {updateMut.isPending ? '保存中…' : '保存进度'}
              </Button>
            </CardContent>
          </Card>

          <Button
            variant="outline"
            className="w-full text-destructive"
            onClick={() => setRemoveOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
            移除阅读历史
          </Button>
        </aside>
      </div>

      {/* 移动端底部阅读操作栏：翻页 + 保存进度（桌面端沿用侧栏控件） */}
      {isMobile && (
        <div
          role="toolbar"
          aria-label="阅读操作栏"
          className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t bg-background/95 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur"
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(page - 1)}
            aria-label="上一页"
          >
            上一页
          </Button>
          <span className="text-xs text-muted-foreground">{page} 页</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(page + 1)}
            aria-label="下一页"
          >
            下一页
          </Button>
          <Button
            size="sm"
            className="flex-1"
            onClick={onManualUpdate}
            disabled={updateMut.isPending}
          >
            {updateMut.isPending ? '保存中…' : '保存进度'}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={removeOpen}
        title="移除阅读历史"
        description="确认移除该资源的阅读历史？此操作不可撤销。"
        confirmText="移除"
        destructive
        onOpenChange={setRemoveOpen}
        onConfirm={onRemove}
      />
    </div>
  )
}
